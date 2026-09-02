import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * dsh-wallpaper host plugin.
 *
 * Owns every server-side surface the browser UI needs:
 *   GET  /dsh-wallpaper/catalog          built-in library + user imports
 *   GET  /dsh-wallpaper/assets/<p>       built-in images (full/ + thumb/)
 *   GET  /dsh-wallpaper/user/<p>         user-imported images
 *   GET  /dsh-wallpaper/prefs            persisted preferences
 *   POST /dsh-wallpaper/prefs            replace preferences
 *   POST /dsh-wallpaper/upload           raw image body -> user library
 *   POST /dsh-wallpaper/import-url       download a remote image -> user library
 *   POST /dsh-wallpaper/delete           remove one user-imported image
 *   GET  /dsh-wallpaper/search?q=        SFW anime wallpaper search (wallhaven proxy)
 *
 * Every write stays inside this package's own directory (or DSH_WALLPAPER_DIR).
 */

const PLUGIN_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const ASSET_DIR = join(PLUGIN_DIR, 'assets')
const USER_DIR = process.env.DSH_WALLPAPER_DIR || join(PLUGIN_DIR, 'user')
const PREFS_FILE = join(USER_DIR, 'prefs.json')
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.json': 'application/json; charset=utf-8',
}

const DEFAULT_PREFS = {
  enabled: false,
  imageId: null,
  imageUrl: '',
  imageName: '',
  fit: 'cover',
  blur: 0,
  scrim: 38,
  brightness: 100,
  saturate: 100,
}

function ensureUserDir() {
  if (!existsSync(USER_DIR)) mkdirSync(USER_DIR, { recursive: true })
}

function json(res, body, status = 200) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(text)
}

function readPrefs() {
  try {
    const raw = JSON.parse(readFileSync(PREFS_FILE, 'utf8'))
    return { ...DEFAULT_PREFS, ...raw }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writePrefs(next) {
  ensureUserDir()
  const merged = { ...DEFAULT_PREFS, ...next }
  writeFileSync(PREFS_FILE, JSON.stringify(merged, null, 2))
  return merged
}

function readCatalog() {
  try {
    if (existsSync(join(ASSET_DIR, 'catalog.json'))) {
      const parsed = JSON.parse(readFileSync(join(ASSET_DIR, 'catalog.json'), 'utf8'))
      if (parsed && Array.isArray(parsed.items)) return parsed.items
    }
  } catch {
    /* the public build ships without a wallpaper library: return an empty one */
  }
  return []
}

/** Every user-imported image, newest first, with its sidecar metadata. */
function readUserLibrary() {
  ensureUserDir()
  const out = []
  let names = []
  try {
    names = readdirSync(USER_DIR)
  } catch {
    return out
  }
  for (const name of names) {
    const ext = extname(name).toLowerCase()
    if (!(ext in MIME) || ext === '.json') continue
    const file = join(USER_DIR, name)
    let meta = {}
    try {
      meta = JSON.parse(readFileSync(join(USER_DIR, name + '.meta.json'), 'utf8'))
    } catch { /* metadata is optional */ }
    let size = 0
    let mtime = 0
    try {
      const st = statSync(file)
      size = st.size
      mtime = st.mtimeMs
    } catch { continue }
    out.push({
      id: 'user:' + name,
      kind: 'user',
      name: meta.name || name,
      theme: 'user',
      themeLabel: '我的导入',
      tags: ['我的导入', 'user', 'local', ...(meta.tags || [])],
      resolution: meta.resolution || '',
      colors: [],
      full: '/dsh-wallpaper/user/' + encodeURIComponent(name),
      thumb: '/dsh-wallpaper/user/' + encodeURIComponent(name),
      page: meta.page || '',
      source: meta.source || '',
      bytes: size,
      addedAt: mtime,
    })
  }
  out.sort((a, b) => b.addedAt - a.addedAt)
  return out
}

/** Resolve a request sub-path inside a root, refusing traversal. */
function safeJoin(root, rest) {
  const decoded = decodeURIComponent(rest).replace(/^\/+/, '')
  if (decoded.includes('\0')) return null
  const target = resolve(root, normalize(decoded))
  if (target !== root && !target.startsWith(root + '/')) return null
  return target
}

function sendFile(res, file, { immutable = false } = {}) {
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  res.writeHead(200, {
    'content-type': type,
    'content-length': String(statSync(file).size),
    'cache-control': immutable ? 'public, max-age=604800' : 'no-cache',
  })
  createReadStream(file).pipe(res)
}

function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((ok, fail) => {
    const chunks = []
    let total = 0
    req.on('data', (chunk) => {
      total += chunk.length
      if (total > limit) {
        fail(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => ok(Buffer.concat(chunks)))
    req.on('error', fail)
  })
}

function extensionFor(name, contentType) {
  const fromName = extname(String(name || '')).toLowerCase()
  if (fromName in MIME && fromName !== '.json') return fromName
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase()
  for (const [ext, mime] of Object.entries(MIME)) {
    if (mime.split(';')[0] === ct && ext !== '.json') return ext
  }
  return '.jpg'
}

function storeUserImage(bytes, { name, page, source, tags } = {}) {
  ensureUserDir()
  const ext = extensionFor(name, '')
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const slug = String(name || 'wallpaper')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'wallpaper'
  let file = slug + '-' + stamp + ext
  let n = 1
  while (existsSync(join(USER_DIR, file))) file = slug + '-' + stamp + '-' + n++ + ext
  writeFileSync(join(USER_DIR, file), bytes)
  writeFileSync(join(USER_DIR, file + '.meta.json'), JSON.stringify({
    name: String(name || slug),
    page: page || '',
    source: source || '',
    tags: Array.isArray(tags) ? tags.slice(0, 12) : [],
    addedAt: new Date().toISOString(),
  }, null, 2))
  return file
}

/** SFW anime wallpaper search, proxied so the browser never talks to the source directly. */
async function searchWallhaven(query, page) {
  const params = new URLSearchParams({
    q: query && query.trim() ? query.trim() : 'anime',
    categories: '010',
    purity: '100',
    sorting: query && query.trim() ? 'relevance' : 'toplist',
    atleast: '1600x900',
    page: String(page || 1),
  })
  const response = await fetch('https://wallhaven.cc/api/v1/search?' + params.toString(), {
    headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('search upstream ' + response.status)
  const body = await response.json()
  return (body.data || [])
    .filter(item => item.file_type === 'image/jpeg' || item.file_type === 'image/png')
    .map(item => ({
      id: 'remote:' + item.id,
      kind: 'remote',
      name: (item.colors && item.colors[0] ? '在线 · ' : '在线 · ') + item.id,
      theme: 'remote',
      themeLabel: '在线结果',
      tags: [],
      resolution: item.resolution,
      colors: (item.colors || []).slice(0, 3),
      full: item.path,
      thumb: item.thumbs && item.thumbs.small,
      page: item.url,
      source: item.source || item.url,
      bytes: item.file_size || 0,
    }))
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1')
  const path = url.pathname.replace(/^\/dsh-wallpaper/, '') || '/'

  if (path === '/catalog' && (req.method === 'GET' || req.method === 'HEAD')) {
    json(res, { builtin: readCatalog(), user: readUserLibrary(), prefs: readPrefs() })
    return
  }

  if (path.startsWith('/assets/')) {
    sendFile(res, safeJoin(ASSET_DIR, path.slice('/assets/'.length)), { immutable: true })
    return
  }

  if (path.startsWith('/user/')) {
    sendFile(res, safeJoin(USER_DIR, path.slice('/user/'.length)))
    return
  }

  if (path === '/prefs') {
    if (req.method === 'GET' || req.method === 'HEAD') {
      json(res, readPrefs())
      return
    }
    if (req.method === 'POST' || req.method === 'PUT') {
      const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
      json(res, writePrefs(body))
      return
    }
  }

  if (path === '/upload' && req.method === 'POST') {
    const name = url.searchParams.get('name') || 'wallpaper'
    const bytes = await readBody(req)
    if (bytes.length === 0) {
      json(res, { error: 'empty upload' }, 400)
      return
    }
    const file = storeUserImage(bytes, { name, tags: ['本地导入'] })
    json(res, { ok: true, item: readUserLibrary().find(i => i.id === 'user:' + file) })
    return
  }

  if (path === '/import-url' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
    if (!/^https?:\/\//i.test(String(body.url || ''))) {
      json(res, { error: 'bad url' }, 400)
      return
    }
    const response = await fetch(body.url, {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      signal: AbortSignal.timeout(60000),
    })
    if (!response.ok) {
      json(res, { error: 'download failed ' + response.status }, 502)
      return
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_UPLOAD_BYTES) {
      json(res, { error: 'image too large' }, 413)
      return
    }
    const name = body.name || decodeURIComponent(new URL(body.url).pathname.split('/').pop() || 'wallpaper')
    const file = storeUserImage(bytes, {
      name: name.endsWith('.jpg') || name.endsWith('.png') ? name : name + extensionFor('', response.headers.get('content-type')),
      page: body.page,
      source: body.source || body.url,
      tags: ['在线保存'],
    })
    json(res, { ok: true, item: readUserLibrary().find(i => i.id === 'user:' + file) })
    return
  }

  if (path === '/delete' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
    const id = String(body.id || '')
    if (!id.startsWith('user:')) {
      json(res, { error: 'only user images can be deleted' }, 400)
      return
    }
    const file = safeJoin(USER_DIR, id.slice('user:'.length))
    if (file && existsSync(file)) unlinkSync(file)
    if (file && existsSync(file + '.meta.json')) unlinkSync(file + '.meta.json')
    json(res, { ok: true })
    return
  }

  if (path === '/search' && (req.method === 'GET' || req.method === 'HEAD')) {
    try {
      const items = await searchWallhaven(url.searchParams.get('q') || '', url.searchParams.get('page') || '1')
      json(res, { items })
    } catch (error) {
      json(res, { items: [], error: String((error && error.message) || error) }, 200)
    }
    return
  }

  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
  res.end('dsh-wallpaper: no route')
}

/** Test seam: the raw router, so the route table can be exercised without a DSH host. */
export { handle as __routeHandler }

export default {
  name: 'dsh-wallpaper',
  inject: ['webServer'],
  apply(ctx) {
    if (!ctx.webServer) {
      ctx.logger?.warn?.('dsh-wallpaper: webServer service unavailable, routes not registered')
      return
    }
    ensureUserDir()
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'prefix',
        path: '/dsh-wallpaper',
        handler: (req, res) => {
          Promise.resolve(handle(req, res)).catch((error) => {
            ctx.logger?.warn?.('dsh-wallpaper route failed: ' + String((error && error.message) || error))
            if (!res.headersSent) {
              res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: String((error && error.message) || error) }))
            } else {
              res.end()
            }
          })
        },
      }),
      'dsh-wallpaper: /dsh-wallpaper routes',
    )
  },
}
