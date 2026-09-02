/**
 * dsh-wallpaper client plugin.
 *
 * Adds a "背景图片" row directly under the Appearance (dark mode) row in
 * Settings → General, opens a centred picker dialog, and owns the whole-app
 * background layer. Every DOM and CSS write is retracted by the ctx.effect
 * disposer so disabling or hot-reloading the plugin restores the stock GUI.
 */
window.__ModuleLoader__.load({
  id: 'dsh-wallpaper',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var react = require('react')
    var reactDom = require('react-dom')
    var h = react.createElement

    var PREFS_KEY = 'dsh-wallpaper:prefs:v1'
    var BODY_ATTR = 'data-dsh-wallpaper'
    var CANVAS_ATTR = 'data-dsh-wallpaper-canvas'
    var STYLE_ATTR = 'data-dsh-wallpaper-style'
    var API = '/dsh-wallpaper'

    var DEFAULTS = {
      enabled: false,
      imageId: null,
      imageUrl: '',
      imageName: '',
      fit: 'cover',
      blur: 0,
      scrim: 38,
      veil: 26,
      hideSkinArt: false,
    }

    var FITS = [
      { id: 'cover', label: '铺满', size: 'cover', repeat: 'no-repeat' },
      { id: 'contain', label: '完整', size: 'contain', repeat: 'no-repeat' },
      { id: 'stretch', label: '拉伸', size: '100% 100%', repeat: 'no-repeat' },
      { id: 'center', label: '原始', size: 'auto', repeat: 'no-repeat' },
      { id: 'tile', label: '平铺', size: 'auto', repeat: 'repeat' },
    ]

    /* ---------------------------------------------------------------- style */

    var CSS = [
      'body[' + BODY_ATTR + "='on']{background-image:none!important;--dsw-alias-bg-base:rgba(255,255,255,var(--dshwp-veil,0.26))!important}",
      'body[' + BODY_ATTR + "='on'][data-ds-dark-theme]{--dsw-alias-bg-base:rgba(21,21,23,var(--dshwp-veil,0.26))!important}",
      'body[' + BODY_ATTR + "='on'] #root{background:transparent!important}",
      '[' + CANVAS_ATTR + ']{position:fixed;inset:0;z-index:-1;pointer-events:none;background-position:center center;' +
        'background-image:var(--dshwp-image,none);background-size:var(--dshwp-size,cover);background-repeat:var(--dshwp-repeat,no-repeat);' +
        'filter:blur(var(--dshwp-blur,0px));transform:scale(var(--dshwp-scale,1));' +
        'transition:opacity 280ms ease;opacity:var(--dshwp-opacity,1)}',
      '[' + CANVAS_ATTR + ']::after{content:"";position:absolute;inset:0;background:rgba(255,255,255,var(--dshwp-scrim,0.38))}',
      'body[data-ds-dark-theme] [' + CANVAS_ATTR + ']::after{background:rgba(0,0,0,var(--dshwp-scrim,0.38))}',
      'body[' + BODY_ATTR + "='on'][data-dshwp-hide-art] [data-skin-chrome='character-stage']{display:none!important}",

      '.dshwp-row{border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:10px;padding:16px 0}',
      '.dshwp-row-title{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.dshwp-row-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dshwp-row-body{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
      '.dshwp-preview{width:112px;height:66px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);flex:0 0 auto;' +
        'background-size:cover;background-position:center;background-repeat:no-repeat;display:flex;align-items:center;justify-content:center;' +
        'color:var(--dsw-alias-label-caption);font-size:12px;overflow:hidden}',
      '.dshwp-row-meta{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1 1 160px}',
      '.dshwp-name{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshwp-btn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);font:inherit;font-size:13px;line-height:20px;' +
        'color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border-radius:10px;padding:7px 14px;white-space:nowrap;' +
        'transition:background 120ms ease,border-color 120ms ease}',
      '.dshwp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshwp-btn[data-tone="primary"]{background:var(--dsw-alias-button-info-fill);border-color:transparent;color:#fff}',
      '.dshwp-btn[data-tone="primary"]:hover{background:var(--dsw-alias-button-info-hover)}',
      '.dshwp-btn:disabled{opacity:.5;cursor:default}',

      '.dshwp-mask{position:fixed;inset:0;z-index:2147483000;background:rgba(15,17,21,.5);backdrop-filter:blur(3px);' +
        'display:flex;align-items:center;justify-content:center;padding:24px;animation:dshwp-fade 160ms ease}',
      '@keyframes dshwp-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes dshwp-pop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
      '.dshwp-modal{width:min(1060px,94vw);height:min(760px,88vh);display:flex;flex-direction:column;overflow:hidden;' +
        'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);' +
        'border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.34);animation:dshwp-pop 180ms cubic-bezier(.2,.8,.3,1)}',
      '.dshwp-head{display:flex;align-items:center;gap:12px;padding:18px 22px 14px}',
      '.dshwp-h1{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600;line-height:24px}',
      '.dshwp-h2{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dshwp-x{margin-left:auto;width:32px;height:32px;border-radius:9px;border:1px solid transparent;background:0 0;cursor:pointer;' +
        'color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center}',
      '.dshwp-x:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshwp-bar{display:flex;gap:8px;padding:0 22px 12px;flex-wrap:wrap;align-items:center}',
      '.dshwp-input{flex:1 1 240px;min-width:180px;box-sizing:border-box;height:36px;padding:0 12px;border-radius:10px;' +
        'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));' +
        'color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;outline:none}',
      '.dshwp-input:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.dshwp-chips{display:flex;gap:6px;padding:0 22px 12px;flex-wrap:wrap}',
      '.dshwp-chip{border:1px solid var(--dsw-alias-border-l2);background:0 0;color:var(--dsw-alias-label-secondary);' +
        'font:inherit;font-size:12px;line-height:18px;padding:4px 11px;border-radius:999px;cursor:pointer}',
      '.dshwp-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshwp-chip[data-on="1"]{background:var(--dsw-alias-state-business-tertiary);border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary)}',
      '.dshwp-body{flex:1 1 auto;overflow:hidden auto;padding:2px 22px 18px}',
      '.dshwp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}',
      '.dshwp-card{position:relative;aspect-ratio:16/10;border-radius:13px;overflow:hidden;cursor:pointer;' +
        'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);' +
        'transition:transform 140ms ease,border-color 140ms ease,box-shadow 140ms ease}',
      '.dshwp-card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.2);border-color:var(--dsw-alias-state-business-primary)}',
      '.dshwp-card[data-on="1"]{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary) inset}',
      '.dshwp-thumb{width:100%;height:100%;object-fit:cover;display:block}',
      '.dshwp-cap{position:absolute;left:0;right:0;bottom:0;padding:16px 10px 7px;color:#fff;font-size:12px;line-height:18px;' +
        'background:linear-gradient(180deg,transparent,rgba(0,0,0,.72));display:flex;gap:6px;align-items:baseline}',
      '.dshwp-cap b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshwp-cap span{margin-left:auto;opacity:.75;font-size:11px;white-space:nowrap}',
      '.dshwp-tag{position:absolute;top:8px;right:8px;padding:2px 8px;border-radius:999px;font-size:11px;line-height:17px;' +
        'background:var(--dsw-alias-button-info-fill);color:#fff}',
      '.dshwp-empty{padding:44px 8px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:22px}',
      '.dshwp-foot{border-top:1px solid var(--dsw-alias-border-l2);padding:12px 22px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}',
      '.dshwp-field{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}',
      '.dshwp-field input[type=range]{width:104px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.dshwp-val{color:var(--dsw-alias-label-tertiary);font-size:11px;width:34px;text-align:right}',
      '.dshwp-menu{position:fixed;z-index:2147483100;min-width:176px;padding:6px;border-radius:12px;' +
        'background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);' +
        'box-shadow:0 16px 44px rgba(0,0,0,.32)}',
      '.dshwp-mi{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;' +
        'color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;white-space:nowrap}',
      '.dshwp-mi:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshwp-mi[data-tone="danger"]{color:#e5484d}',
      '.dshwp-drop{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(65,118,230,.16);border:2px dashed var(--dsw-alias-state-business-primary);border-radius:20px;' +
        'color:var(--dsw-alias-label-primary);font-size:15px;pointer-events:none}',
      '.dshwp-busy{color:var(--dsw-alias-label-tertiary);font-size:12px;margin-left:auto}',
    ].join('\n')

    /* ------------------------------------------------------------- prefs io */

    function clamp(v, lo, hi) {
      v = Number(v)
      if (!isFinite(v)) return lo
      return v < lo ? lo : v > hi ? hi : v
    }

    function normalise(p) {
      var s = {}
      for (var k in DEFAULTS) s[k] = DEFAULTS[k]
      if (p && typeof p === 'object') {
        if (typeof p.enabled === 'boolean') s.enabled = p.enabled
        if (typeof p.imageId === 'string' || p.imageId === null) s.imageId = p.imageId
        if (typeof p.imageUrl === 'string') s.imageUrl = p.imageUrl
        if (typeof p.imageName === 'string') s.imageName = p.imageName
        for (var i = 0; i < FITS.length; i++) if (FITS[i].id === p.fit) s.fit = p.fit
        s.blur = clamp(p.blur, 0, 40)
        s.scrim = clamp(p.scrim, 0, 90)
        s.veil = clamp(p.veil, 0, 100)
        if (typeof p.hideSkinArt === 'boolean') s.hideSkinArt = p.hideSkinArt
      }
      return s
    }

    function loadLocal() {
      try {
        return normalise(JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}'))
      } catch (e) {
        return normalise(null)
      }
    }

    function saveLocal(p) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(p))
      } catch (e) { /* private mode: the host copy is still authoritative */ }
    }

    /* --------------------------------------------------------- dom back end */

    var installed = null

    function install() {
      if (installed) return installed
      var style = document.createElement('style')
      style.setAttribute(STYLE_ATTR, '')
      style.textContent = CSS
      document.head.appendChild(style)

      var canvas = document.createElement('div')
      canvas.setAttribute(CANVAS_ATTR, '')
      canvas.setAttribute('aria-hidden', 'true')
      document.body.insertBefore(canvas, document.body.firstChild)

      installed = {
        style: style,
        canvas: canvas,
        dispose: function () {
          style.remove()
          canvas.remove()
          document.body.removeAttribute(BODY_ATTR)
          document.body.removeAttribute('data-dshwp-hide-art')
          var s = document.body.style
          var names = ['--dshwp-image', '--dshwp-size', '--dshwp-repeat', '--dshwp-blur',
            '--dshwp-scale', '--dshwp-scrim', '--dshwp-veil', '--dshwp-opacity']
          for (var i = 0; i < names.length; i++) s.removeProperty(names[i])
          installed = null
        },
      }
      return installed
    }

    function paint(prefs) {
      install()
      var body = document.body
      var on = !!(prefs.enabled && prefs.imageUrl)
      if (on) body.setAttribute(BODY_ATTR, 'on')
      else body.removeAttribute(BODY_ATTR)
      if (on && prefs.hideSkinArt) body.setAttribute('data-dshwp-hide-art', '')
      else body.removeAttribute('data-dshwp-hide-art')

      var fit = FITS[0]
      for (var i = 0; i < FITS.length; i++) if (FITS[i].id === prefs.fit) fit = FITS[i]
      var s = body.style
      s.setProperty('--dshwp-image', on ? 'url("' + prefs.imageUrl.replace(/"/g, '%22') + '")' : 'none')
      s.setProperty('--dshwp-size', fit.size)
      s.setProperty('--dshwp-repeat', fit.repeat)
      s.setProperty('--dshwp-blur', prefs.blur + 'px')
      s.setProperty('--dshwp-scale', String(1 + prefs.blur / 260))
      s.setProperty('--dshwp-scrim', String(prefs.scrim / 100))
      s.setProperty('--dshwp-veil', String(prefs.veil / 100))
      s.setProperty('--dshwp-opacity', on ? '1' : '0')
    }

    /* ------------------------------------------------------------ the store */

    var store = {
      prefs: loadLocal(),
      builtin: [],
      user: [],
      remote: [],
      loaded: false,
      open: false,
      busy: '',
      listeners: [],
    }

    function emit() {
      var list = store.listeners.slice()
      for (var i = 0; i < list.length; i++) list[i]()
    }

    function patch(next) {
      for (var k in next) store[k] = next[k]
      emit()
    }

    function setPrefs(next, persist) {
      store.prefs = normalise(next)
      paint(store.prefs)
      saveLocal(store.prefs)
      emit()
      if (persist !== false) {
        fetch(API + '/prefs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(store.prefs),
        }).catch(function () { /* the local copy already applied */ })
      }
    }

    function useStore() {
      var tick = react.useState(0)
      var set = tick[1]
      react.useEffect(function () {
        var fn = function () { set(function (n) { return n + 1 }) }
        store.listeners.push(fn)
        return function () {
          var i = store.listeners.indexOf(fn)
          if (i >= 0) store.listeners.splice(i, 1)
        }
      }, [])
      return store
    }

    function loadCatalog() {
      return fetch(API + '/catalog', { cache: 'no-store' })
        .then(function (r) { return r.json() })
        .then(function (data) {
          patch({ builtin: data.builtin || [], user: data.user || [], loaded: true })
          // The host copy wins the first time only when this browser has none.
          try {
            if (!window.localStorage.getItem(PREFS_KEY) && data.prefs) setPrefs(data.prefs, false)
          } catch (e) { /* ignore */ }
        })
        .catch(function () { patch({ loaded: true }) })
    }

    /* ------------------------------------------------------------ utilities */

    function libraryOf(s) { return s.user.concat(s.builtin) }

    function matches(item, q) {
      if (!q) return true
      var hay = (item.name + ' ' + item.themeLabel + ' ' + (item.tags || []).join(' ') + ' ' + item.theme).toLowerCase()
      var parts = q.toLowerCase().split(/\s+/)
      for (var i = 0; i < parts.length; i++) if (parts[i] && hay.indexOf(parts[i]) < 0) return false
      return true
    }

    function sizeText(item) {
      if (!item.bytes) return item.resolution || ''
      var mb = item.bytes / 1024 / 1024
      return (item.resolution ? item.resolution + ' · ' : '') + (mb >= 1 ? mb.toFixed(1) + 'MB' : Math.round(item.bytes / 1024) + 'KB')
    }

    function post(path, body) {
      return fetch(API + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json() })
    }

    /* ------------------------------------------------------- context menu */

    function ContextMenu(props) {
      var menu = props.menu
      var boxRef = react.useRef(null)
      react.useEffect(function () {
        var close = function (e) {
          if (e && boxRef.current && boxRef.current.contains(e.target)) return
          props.onClose()
        }
        var esc = function (e) { if (e.key === 'Escape') props.onClose() }
        window.addEventListener('pointerdown', close, true)
        window.addEventListener('resize', close)
        window.addEventListener('keydown', esc)
        return function () {
          window.removeEventListener('pointerdown', close, true)
          window.removeEventListener('resize', close)
          window.removeEventListener('keydown', esc)
        }
      }, [])
      if (!menu) return null
      var x = Math.min(menu.x, window.innerWidth - 200)
      var y = Math.min(menu.y, window.innerHeight - (menu.items.length * 38 + 20))
      return reactDom.createPortal(
        h('div', {
          ref: boxRef,
          className: 'dshwp-menu',
          style: { left: Math.max(8, x) + 'px', top: Math.max(8, y) + 'px' },
          onPointerDown: function (e) { e.stopPropagation() },
          onContextMenu: function (e) { e.preventDefault() },
        }, menu.items.map(function (mi, i) {
          return h('div', {
            key: i,
            className: 'dshwp-mi',
            'data-tone': mi.tone || '',
            onClick: function () { props.onClose(); mi.run() },
          }, mi.icon ? h('span', null, mi.icon) : null, mi.label)
        })),
        document.body,
      )
    }

    /* -------------------------------------------------------------- dialog */

    function WallpaperDialog(props) {
      var s = useStore()
      var qs = react.useState('')
      var q = qs[0]
      var setQ = qs[1]
      var ts = react.useState('all')
      var tab = ts[0]
      var setTab = ts[1]
      var ms = react.useState(null)
      var menu = ms[0]
      var setMenu = ms[1]
      var ds = react.useState(false)
      var dragging = ds[0]
      var setDragging = ds[1]
      var fileRef = react.useRef(null)
      var hasSkinArt = document.querySelector("[data-skin-chrome='character-stage']") !== null

      react.useEffect(function () {
        var esc = function (e) { if (e.key === 'Escape' && !menu) props.onClose() }
        window.addEventListener('keydown', esc)
        return function () { window.removeEventListener('keydown', esc) }
      }, [menu])

      var themes = []
      var seen = {}
      libraryOf(s).forEach(function (it) {
        if (!seen[it.theme]) { seen[it.theme] = 1; themes.push({ id: it.theme, label: it.themeLabel }) }
      })

      var source = tab === 'remote' ? s.remote : libraryOf(s)
      var items = source.filter(function (it) {
        if (tab !== 'all' && tab !== 'remote' && it.theme !== tab) return false
        return tab === 'remote' ? true : matches(it, q)
      })

      function apply(item) {
        if (item.kind === 'remote') {
          patch({ busy: '正在保存到我的库…' })
          post('/import-url', { url: item.full, name: item.id.replace('remote:', 'wallhaven-') + '.jpg', page: item.page, source: item.source })
            .then(function (r) {
              patch({ busy: '' })
              if (r && r.item) {
                patch({ user: [r.item].concat(store.user) })
                setPrefs({ ...s.prefs, enabled: true, imageId: r.item.id, imageUrl: r.item.full, imageName: r.item.name })
              } else {
                setPrefs({ ...s.prefs, enabled: true, imageId: item.id, imageUrl: item.full, imageName: item.name })
              }
            })
            .catch(function () {
              patch({ busy: '' })
              setPrefs({ ...s.prefs, enabled: true, imageId: item.id, imageUrl: item.full, imageName: item.name })
            })
          return
        }
        setPrefs({ ...s.prefs, enabled: true, imageId: item.id, imageUrl: item.full, imageName: item.name })
      }

      function upload(files) {
        var list = []
        for (var i = 0; i < files.length; i++) if (/^image\//.test(files[i].type)) list.push(files[i])
        if (!list.length) return
        patch({ busy: '正在导入 ' + list.length + ' 张…' })
        var done = []
        var step = function (i) {
          if (i >= list.length) {
            patch({ busy: '', user: done.concat(store.user) })
            if (done.length) setPrefs({ ...s.prefs, enabled: true, imageId: done[0].id, imageUrl: done[0].full, imageName: done[0].name })
            setTab('user')
            return
          }
          fetch(API + '/upload?name=' + encodeURIComponent(list[i].name), { method: 'POST', body: list[i] })
            .then(function (r) { return r.json() })
            .then(function (r) { if (r && r.item) done.push(r.item); step(i + 1) })
            .catch(function () { step(i + 1) })
        }
        step(0)
      }

      function searchOnline() {
        patch({ busy: '正在搜索在线壁纸…' })
        fetch(API + '/search?q=' + encodeURIComponent(q), { cache: 'no-store' })
          .then(function (r) { return r.json() })
          .then(function (r) {
            patch({ remote: r.items || [], busy: (r.items && r.items.length) ? '' : '没有搜到结果，换个关键词试试' })
            setTab('remote')
            if (r.items && r.items.length) setTimeout(function () { patch({ busy: '' }) }, 100)
            else setTimeout(function () { patch({ busy: '' }) }, 2600)
          })
          .catch(function () { patch({ busy: '在线搜索失败，请检查网络' }); setTimeout(function () { patch({ busy: '' }) }, 2600) })
      }

      function openMenu(e, item) {
        e.preventDefault()
        e.stopPropagation()
        var mi = [
          { label: '设为背景', icon: '🖼', run: function () { apply(item) } },
          { label: '打开图片链接', icon: '🔗', run: function () { window.open(item.page || item.full, '_blank', 'noopener') } },
          { label: '复制图片地址', icon: '📋', run: function () {
            var url = /^https?:/.test(item.full) ? item.full : location.origin + item.full
            if (navigator.clipboard) navigator.clipboard.writeText(url)
          } },
        ]
        if (item.kind === 'remote') {
          mi.push({ label: '保存到我的库', icon: '⬇', run: function () {
            patch({ busy: '正在保存…' })
            post('/import-url', { url: item.full, name: item.id.replace('remote:', 'wallhaven-') + '.jpg', page: item.page, source: item.source })
              .then(function (r) { patch({ busy: '', user: r && r.item ? [r.item].concat(store.user) : store.user }) })
              .catch(function () { patch({ busy: '保存失败' }) })
          } })
        }
        if (item.kind === 'user') {
          mi.push({ label: '删除这张', icon: '🗑', tone: 'danger', run: function () {
            post('/delete', { id: item.id }).then(function () {
              patch({ user: store.user.filter(function (u) { return u.id !== item.id }) })
              if (store.prefs.imageId === item.id) setPrefs({ ...store.prefs, enabled: false, imageId: null, imageUrl: '', imageName: '' })
            })
          } })
        }
        setMenu({ x: e.clientX, y: e.clientY, items: mi })
      }

      function slider(label, key, min, max, unit) {
        return h('label', { className: 'dshwp-field' },
          label,
          h('input', {
            type: 'range', min: min, max: max, value: s.prefs[key],
            onChange: function (e) {
              var next = {}
              for (var k in s.prefs) next[k] = s.prefs[k]
              next[key] = Number(e.target.value)
              setPrefs(next)
            },
          }),
          h('span', { className: 'dshwp-val' }, s.prefs[key] + (unit || '')),
        )
      }

      var chips = [{ id: 'all', label: '全部 ' + libraryOf(s).length }]
      if (s.user.length) chips.push({ id: 'user', label: '我的导入 ' + s.user.length })
      themes.forEach(function (t) { if (t.id !== 'user') chips.push(t) })
      if (s.remote.length) chips.push({ id: 'remote', label: '在线结果 ' + s.remote.length })

      return reactDom.createPortal(
        h('div', {
          className: 'dshwp-mask',
          onPointerDown: function (e) { if (e.target === e.currentTarget) props.onClose() },
        },
          h('div', {
            className: 'dshwp-modal',
            style: { position: 'relative' },
            onDragOver: function (e) { e.preventDefault(); if (!dragging) setDragging(true) },
            onDragLeave: function (e) { if (e.target === e.currentTarget) setDragging(false) },
            onDrop: function (e) { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files) },
          },
            dragging ? h('div', { className: 'dshwp-drop' }, '松手即可导入为背景') : null,

            h('div', { className: 'dshwp-head' },
              h('div', null,
                h('div', { className: 'dshwp-h1' }, '选择背景图片'),
                h('div', { className: 'dshwp-h2' }, '单击设为背景 · 右键更多操作 · 图片可直接拖进来'),
              ),
              h('button', { className: 'dshwp-x', onClick: props.onClose, title: '关闭' }, '✕'),
            ),

            h('div', { className: 'dshwp-bar' },
              h('input', {
                className: 'dshwp-input',
                value: q,
                placeholder: '搜索：樱花 / 星空 / 都市 / 机甲 / sakura / city …（回车搜在线）',
                onChange: function (e) { setQ(e.target.value); if (tab === 'remote') setTab('all') },
                onKeyDown: function (e) { if (e.key === 'Enter') searchOnline() },
              }),
              h('button', { className: 'dshwp-btn', onClick: searchOnline }, '搜在线壁纸'),
              h('button', { className: 'dshwp-btn', 'data-tone': 'primary', onClick: function () { fileRef.current && fileRef.current.click() } }, '从本地导入'),
              h('input', {
                ref: fileRef, type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' },
                onChange: function (e) { upload(e.target.files); e.target.value = '' },
              }),
              s.busy ? h('span', { className: 'dshwp-busy' }, s.busy) : null,
            ),

            h('div', { className: 'dshwp-chips' }, chips.map(function (c) {
              return h('button', {
                key: c.id, className: 'dshwp-chip', 'data-on': tab === c.id ? '1' : '0',
                onClick: function () { setTab(c.id) },
              }, c.label)
            })),

            h('div', { className: 'dshwp-body' },
              items.length === 0
                ? h('div', { className: 'dshwp-empty' }, s.loaded ? '这里还没有图片。试试「搜在线壁纸」或「从本地导入」。' : '正在加载壁纸库…')
                : h('div', { className: 'dshwp-grid' }, items.map(function (item) {
                  var on = s.prefs.imageId === item.id && s.prefs.enabled
                  return h('div', {
                    key: item.id,
                    className: 'dshwp-card',
                    'data-on': on ? '1' : '0',
                    title: item.name + '（左键设为背景 · 右键更多）',
                    onClick: function () { apply(item) },
                    onContextMenu: function (e) { openMenu(e, item) },
                  },
                    h('img', { className: 'dshwp-thumb', src: item.thumb || item.full, loading: 'lazy', alt: item.name, draggable: false }),
                    on ? h('div', { className: 'dshwp-tag' }, '当前') : null,
                    h('div', { className: 'dshwp-cap' },
                      h('b', null, item.name),
                      h('span', null, sizeText(item)),
                    ),
                  )
                })),
            ),

            h('div', { className: 'dshwp-foot' },
              h('label', { className: 'dshwp-field' }, '填充',
                h('select', {
                  className: 'dshwp-input',
                  style: { flex: '0 0 auto', width: '92px', height: '30px', padding: '0 6px' },
                  value: s.prefs.fit,
                  onChange: function (e) {
                    var next = {}
                    for (var k in s.prefs) next[k] = s.prefs[k]
                    next.fit = e.target.value
                    setPrefs(next)
                  },
                }, FITS.map(function (f) { return h('option', { key: f.id, value: f.id }, f.label) })),
              ),
              slider('模糊', 'blur', 0, 40, 'px'),
              slider('压暗', 'scrim', 0, 90, '%'),
              slider('内容蒙版', 'veil', 0, 100, '%'),
              hasSkinArt ? h('label', { className: 'dshwp-field', style: { cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: !!s.prefs.hideSkinArt,
                  onChange: function (e) {
                    var next = {}
                    for (var k in s.prefs) next[k] = s.prefs[k]
                    next.hideSkinArt = e.target.checked
                    setPrefs(next)
                  },
                }),
                '隐藏皮肤立绘',
              ) : null,
              h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
                h('button', {
                  className: 'dshwp-btn',
                  onClick: function () { setPrefs({ ...s.prefs, blur: DEFAULTS.blur, scrim: DEFAULTS.scrim, veil: DEFAULTS.veil, fit: DEFAULTS.fit }) },
                }, '重置样式'),
                h('button', {
                  className: 'dshwp-btn',
                  disabled: !s.prefs.enabled,
                  onClick: function () { setPrefs({ ...s.prefs, enabled: false }) },
                }, '关闭背景'),
              ),
            ),
          ),
          h(ContextMenu, { menu: menu, onClose: function () { setMenu(null) } }),
        ),
        document.body,
      )
    }

    /* ---------------------------------------------------------- settings row */

    function WallpaperRow() {
      var s = useStore()
      react.useEffect(function () { if (!s.loaded) loadCatalog() }, [])

      var current = s.prefs.imageUrl
      return h('div', { className: 'dshwp-row' },
        h('div', null,
          h('div', { className: 'dshwp-row-title' }, '背景图片'),
          h('div', { className: 'dshwp-row-sub' }, '给整个界面换一张背景，支持内置二次元壁纸、在线搜索和本地导入'),
        ),
        h('div', { className: 'dshwp-row-body' },
          h('div', {
            className: 'dshwp-preview',
            style: current ? { backgroundImage: 'url("' + current + '")' } : null,
          }, current ? null : '无背景'),
          h('div', { className: 'dshwp-row-meta' },
            h('div', { className: 'dshwp-name' }, s.prefs.enabled && s.prefs.imageName ? s.prefs.imageName : '当前：跟随主题默认背景'),
            h('div', { className: 'dshwp-row-sub' }, s.prefs.enabled
              ? '模糊 ' + s.prefs.blur + 'px · 压暗 ' + s.prefs.scrim + '% · 蒙版 ' + s.prefs.veil + '%'
              : '未启用背景图片'),
          ),
          h('button', {
            className: 'dshwp-btn', 'data-tone': 'primary',
            onClick: function () { patch({ open: true }); if (!s.loaded) loadCatalog() },
          }, '选择背景…'),
          h('button', {
            className: 'dshwp-btn',
            disabled: !s.prefs.imageUrl,
            onClick: function () { setPrefs({ ...s.prefs, enabled: !s.prefs.enabled }) },
          }, s.prefs.enabled ? '关闭' : '开启'),
        ),
        s.open ? h(WallpaperDialog, { onClose: function () { patch({ open: false }) } }) : null,
      )
    }

    /* ---------------------------------------------------------------- apply */

    function apply(ctx) {
      ctx.effect(function () {
        install()
        paint(store.prefs)
        loadCatalog()
        return function () {
          if (installed) installed.dispose()
        }
      }, 'dsh-wallpaper: background layer')

      ctx.slots.inject('settings.general.item', function () {
        return ctx.slots.register({
          name: 'settings.general.item',
          id: 'wallpaper',
          order: 11,
          inject: function () { return {} },
        }, WallpaperRow)
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
