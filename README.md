# dsh-wallpaper

**A background-image plugin for the DeepSeek Harness (DSH) Web GUI.**

Adds a `背景图片 / Background image` row right below the **Appearance (dark mode)** row in Settings → General. Click it to open a centred picker dialog: choose from your own wallpaper library, search online (wallhaven, SFW anime only), import images from disk — and right-click any card to set it as the background or open the original image page.

> No bundled wallpaper images. All code is MIT licensed; artwork is not. The shipped gallery is empty by design — see [Assets policy](#assets-policy).

## Features

- **Whole-app background** — takes over the backdrop layer: neutralises any existing skin background image, makes the app chrome translucent via a tunable content veil, and paints the wallpaper on a fixed layer behind everything.
- **Sits exactly below Dark Mode** — registers into the same `settings.general.item` slot as the official appearance row with `order: 11` (theirs is 10). No forking, no patching official code.
- **Centred picker dialog** — opened from the settings row, rendered through a React portal into `document.body`; Esc or click-outside closes it.
- **Local library** — `<plugin>/assets/full/*` + `catalog.json`; read per request, so drop in files anytime without restarting.
- **Online search** — the host proxies the wallhaven v1 API (categories 010, purity 100 = SFW anime only). Picked results are downloaded into your local library, so they keep working offline.
- **Local import** — file picker AND drag-and-drop; imported files are stored host-side in `<plugin>/user/` and survive browser storage clears.
- **Right-click menu** — set as background / open the original image page / copy URL / save to library (online results) / delete (imports only; built-ins are protected).
- **Display controls** — fill mode (cover/contain/stretch/center/tile), blur, scrim, content veil; scrim colour follows the light/dark theme. When a character-art skin (e.g. maid-atelier) is detected, an extra `hide skin art` checkbox appears.
- **Clean lifecycle** — every DOM/CSS write is restored by the Cordis effect disposer; uninstalling leaves no residue.

## Requirements

- DSH web build **0.1.1-rc.2** (tested). Uses `slots.inject('settings.general.item')` and `webServer.register({ kind:'prefix', path:'/dsh-wallpaper' })`.
- Node.js ≥ 20.

## Install

> Not published to npm — install from this repository. (The npm package named `dsh-wallpaper` is an unrelated project: a Wallpaper Engine integration.)

```bash
git clone https://github.com/dugujun3-cloud/dsh-wallpaper.git
cd dsh-wallpaper
./install.sh          # symlink into ~/.dsh/profiles/web/node_modules + cordis.patch.yml entry (backs up first)
kill $(pgrep -f 'dsh/lib/bin.js web')   # launchd KeepAlive restarts it within ~10 s
```

Then refresh http://127.0.0.1:3080 → Settings → General: the **背景图片** row sits directly below the Appearance row.

Uninstall:

```bash
./uninstall.sh
kill $(pgrep -f 'dsh/lib/bin.js web')
```

Both scripts are idempotent and back up `cordis.patch.yml` before touching it.

## Assets policy

The public build ships **no wallpaper images**. Bundling third-party fan art (wallhaven / safebooru / konachan) would violate the artists' rights. Instead:

1. **Build your own library** from the Wallhaven API:

   ```bash
   python3 make-assets.py                        # starter set (3 themes x 4)
   python3 make-assets.py --query 'sakura anime' --query 'cyberpunk city' --per-theme 8
   ```

   This writes `assets/catalog.json` + `assets/full/` + `assets/thumb/`; the dialog picks them up on next load (catalog is read per request, no restart needed).

2. **Or use in-app search / import** — every online result you pick is saved locally with its source page, so you can always right-click `open image link` to credit the artist.

`assets/` image files are gitignored; `make-assets.py` records each item's `page` (original post) and `source` links for attribution.

## HTTP API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/dsh-wallpaper/catalog` | built-in library + user imports + prefs |
| GET | `/dsh-wallpaper/assets/<path>` | built-in images (traversal hardened) |
| GET | `/dsh-wallpaper/user/<name>` | imported images |
| GET/POST | `/dsh-wallpaper/prefs` | preference read/write |
| POST | `/dsh-wallpaper/upload?name=` | upload an image (max 32 MB) |
| POST | `/dsh-wallpaper/import-url` | download a remote image into the local library |
| POST | `/dsh-wallpaper/delete` | delete an imported image (built-ins protected) |
| GET | `/dsh-wallpaper/search?q=` | online search (wallhaven, SFW anime) |

## Project layout

```
lib/index.js      host plugin: routes, catalog/upload/delete, wallhaven proxy, prefs persistence
lib/client.js     browser plugin: settings row, portal dialog, grid + search + context menu, backdrop engine
assets/           your wallpaper library (images gitignored; see Assets policy)
user/             your imports (gitignored)
make-assets.py    regenerate assets/catalog.json from the Wallhaven API
test-host.mjs     16 host-route tests (incl. traversal + built-in delete protection)
test-client.mjs   20 client wiring tests (slot order 11, stylesheet/canvas injection, full dispose)
install.sh        idempotent live-profile install
uninstall.sh      reversible uninstall (byte-level round-trip verified)
```

## Tests

```bash
node test-host.mjs && node test-client.mjs   # 36 checks, all green
```

## Disclaimer

- The wallhaven proxy hits the public wallhaven.cc API without a key. Convenience wrapper, not an affiliated service.
- Only the SFW anime category (`categories=010`, `purity=100`) is queried server-side; the client never talks to the upstream directly.
- Unofficial community plugin. Not affiliated with, endorsed by, or supported by DeepSeek.
- The plugin targets `settings.general.item` and `webServer.register({ kind: 'prefix' })`; a DSH version that changes those may need a small update.

## License

MIT © 2026 [dugujun3-cloud](https://github.com/dugujun3-cloud) (独孤菌). Artwork excluded — see Assets policy.

