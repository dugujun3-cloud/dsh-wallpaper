import { readFileSync, existsSync, unlinkSync } from 'node:fs'

/* ------------------------------------------------------------ tiny DOM stub */
function node(tag) {
  const props = new Map()
  const styles = new Map()
  const n = {
    tag, children: [], parent: null, textContent: '',
    style: {
      setProperty: (k, v) => styles.set(k, String(v)),
      removeProperty: k => styles.delete(k),
      getPropertyValue: k => styles.get(k) || '',
      _all: styles,
    },
    setAttribute: (k, v) => props.set(k, String(v)),
    removeAttribute: k => props.delete(k),
    getAttribute: k => (props.has(k) ? props.get(k) : null),
    hasAttribute: k => props.has(k),
    appendChild(c) { c.parent = n; n.children.push(c); return c },
    insertBefore(c, ref) { c.parent = n; n.children.unshift(c); return c },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter(x => x !== n); n.parent = null },
    querySelector: () => null,
    contains: () => false,
    get firstChild() { return n.children[0] || null },
    _props: props,
  }
  return n
}
const head = node('head')
const body = node('body')
const document = {
  head, body,
  createElement: node,
  querySelector: () => null,
}
const storage = new Map()
const window = {
  __ModuleLoader__: { load: def => { window._def = def } },
  localStorage: {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
  },
  addEventListener() {}, removeEventListener() {}, innerWidth: 1440, innerHeight: 900,
}
const react = {
  createElement: (t, p, ...c) => ({ t, p, c }),
  useState: v => [v, () => {}],
  useEffect: () => {}, useRef: () => ({ current: null }),
}
const reactDom = { createPortal: x => x }
let fetched = []
const fetch = (url, init) => {
  fetched.push({ url, method: (init && init.method) || 'GET' })
  return Promise.resolve({
    json: () => Promise.resolve({ builtin: [{ id: 'a', full: '/x.jpg' }], user: [], prefs: null }),
  })
}

/* --------------------------------------------------------------- run module */
const src = readFileSync(new URL('./lib/client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'fetch', 'require', 'navigator', 'location', src)(
  window, document, fetch,
  name => (name === 'react' ? react : name === 'react-dom' ? reactDom : {}),
  {}, { origin: 'http://127.0.0.1:3080' },
)

let pass = 0, fail = 0
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name) }
  else { fail++; console.log('  FAIL ' + name + ' ' + extra) }
}

check('module registered itself', window._def && window._def.id === 'dsh-wallpaper')
const mod = window._def.factory(n => (n === 'react' ? react : n === 'react-dom' ? reactDom : {}))
check('exports apply()', typeof mod.apply === 'function')
check('injects the slots service', JSON.stringify(mod.inject) === '["slots"]')

/* ------------------------------------------------------------- apply() wiring */
const effects = []
const registrations = []
let disposeEffect
const ctx = {
  effect(fn, label) { const d = fn(); effects.push({ label, dispose: d }); return d },
  slots: {
    inject(slotName, fn) { registrations.push({ slotName, disposer: fn() }) },
    register(opts, component) { registrations.push({ opts, component }); return () => {} },
  },
}
mod.apply(ctx)

check('registers one background effect', effects.length === 1 && /background layer/.test(effects[0].label), effects.map(e => e.label).join())
const reg = registrations.find(r => r.opts)
check('registers into settings.general.item', reg && reg.opts.name === 'settings.general.item')
check('sits right below the Appearance row', reg && reg.opts.order === 11, reg && String(reg.opts.order))
check('registration id is wallpaper', reg && reg.opts.id === 'wallpaper')
check('slot component is a function', reg && typeof reg.component === 'function')

/* ------------------------------------------------------------------ DOM writes */
const style = head.children.find(c => c.tag === 'style')
check('injects one stylesheet into <head>', !!style && style.textContent.includes('dshwp-modal'))
check('stylesheet neutralises the previous body image', style.textContent.includes('background-image:none!important'))
check('stylesheet keeps dark-mode scrim separate', style.textContent.includes('data-ds-dark-theme'))
const canvas = body.children.find(c => c.getAttribute('data-dsh-wallpaper-canvas') !== null)
check('prepends the background canvas to <body>', !!canvas)
check('canvas is inert', canvas && style.textContent.includes('pointer-events:none'))

check('background stays off with no image', body.getAttribute('data-dsh-wallpaper') === null)
check('canvas is hidden when off', body.style.getPropertyValue('--dshwp-opacity') === '0')
check('catalog is fetched on apply', fetched.some(f => f.url.includes('/dsh-wallpaper/catalog')))

/* ------------------------------------------------------------------- disposal */
effects[0].dispose()
check('stylesheet removed on dispose', !head.children.some(c => c.tag === 'style'))
check('canvas removed on dispose', !body.children.some(c => c.getAttribute('data-dsh-wallpaper-canvas') !== null))
check('body attribute cleared on dispose', body.getAttribute('data-dsh-wallpaper') === null)
check('css variables cleared on dispose', body.style.getPropertyValue('--dshwp-image') === '')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail ? 1 : 0)
