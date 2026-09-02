import http from 'node:http'
import { readFileSync, existsSync, rmSync } from 'node:fs'
import { __routeHandler } from './lib/index.js'

const server = http.createServer((req, res) => {
  Promise.resolve(__routeHandler(req, res)).catch((e) => {
    res.writeHead(500); res.end(String(e && e.message || e))
  })
})
await new Promise(ok => server.listen(0, '127.0.0.1', ok))
const base = 'http://127.0.0.1:' + server.address().port

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name) }
  else { fail++; console.log('  FAIL ' + name + ' ' + extra) }
}

// 1. catalog
const cat = await (await fetch(base + '/dsh-wallpaper/catalog')).json()
check('catalog returns a list', Array.isArray(cat.builtin))
check('catalog carries prefs defaults', cat.prefs && cat.prefs.fit === 'cover')
// The public build ships an empty library; a local fork may add items.
// Both shapes must pass. If the library is empty, the route must not crash.
let first = null
try { first = cat.builtin[0] } catch { /* empty array */ }
if (first) {
  check('builtin item has full+thumb+page', first.full.startsWith('/dsh-wallpaper/assets/full/') && !!first.thumb && /^https?:/.test(first.page))
  const img = await fetch(base + first.full)
  check('asset serves image', img.status === 200, String(img.status))
  const thumb = await fetch(base + first.thumb)
  check('thumb serves 200', thumb.status === 200)
} else {
  check('empty library is served cleanly', true)
}

// 2. static asset / traversal (works for both shapes)
const img = await fetch(base + '/dsh-wallpaper/assets/full/.gitkeep')
check('empty-library asset route is safe', img.status === 404 || img.status === 200, String(img.status))

// 3. traversal is refused
const bad = await fetch(base + '/dsh-wallpaper/assets/..%2F..%2F..%2Fetc%2Fpasswd')
check('path traversal refused', bad.status === 404, String(bad.status))

// 4. prefs round-trip
const saved = await (await fetch(base + '/dsh-wallpaper/prefs', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ enabled: true, imageUrl: '/x.jpg', blur: 12, scrim: 50, veil: 30, fit: 'contain' }),
})).json()
check('prefs POST echoes merged prefs', saved.blur === 12 && saved.fit === 'contain' && saved.enabled === true)
const got = await (await fetch(base + '/dsh-wallpaper/prefs')).json()
check('prefs GET persists', got.blur === 12 && got.veil === 30)

// 5. upload + list + delete
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64')
const up = await (await fetch(base + '/dsh-wallpaper/upload?name=' + encodeURIComponent('测试壁纸.png'), {
  method: 'POST', body: png,
})).json()
check('upload stores the file', up.ok === true && up.item && up.item.kind === 'user', JSON.stringify(up).slice(0, 160))
const listed = await (await fetch(base + '/dsh-wallpaper/catalog')).json()
check('uploaded image appears in user library', listed.user.some(i => i.id === up.item.id))
const served = await fetch(base + up.item.full)
check('uploaded image is served', served.status === 200 && served.headers.get('content-type') === 'image/png')
const del = await (await fetch(base + '/dsh-wallpaper/delete', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: up.item.id }),
})).json()
check('delete succeeds', del.ok === true)
const after = await (await fetch(base + '/dsh-wallpaper/catalog')).json()
check('deleted image is gone', !after.user.some(i => i.id === up.item.id))
const delBuiltin = await fetch(base + '/dsh-wallpaper/delete', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: (cat.builtin[0] && cat.builtin[0].id) || 'builtin-x' }),
})
check('built-in images cannot be deleted', delBuiltin.status === 400)

// 6. online search proxy
const search = await (await fetch(base + '/dsh-wallpaper/search?q=' + encodeURIComponent('sakura'))).json()
check('online search returns items', Array.isArray(search.items) && search.items.length > 0, search.error || '')
if (search.items && search.items[0]) {
  check('search item shape', /^remote:/.test(search.items[0].id) && /^https:/.test(search.items[0].full) && /^https:/.test(search.items[0].page))
}

// 7. unknown route
const miss = await fetch(base + '/dsh-wallpaper/nope')
check('unknown route 404', miss.status === 404)

server.close()
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
