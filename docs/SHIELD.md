# Shield dashboard

The badge + popover that shows what the extension has blocked. This is the
reference for the current setup: how it is wired, what may not change, how to
verify it, and how to roll back when something breaks.

## Where the code lives

There are **two copies** of this repo on a normal install, and only one of them
is live:

| Path | Role |
| --- | --- |
| `~/.local/share/freebuff-ads-remover/` | **The live install.** The patched app loads the extension from here. |
| anywhere else (`/tmp/...`, a fresh `git clone`) | A scratch copy. Editing it changes nothing in the app. |

The launcher repacks `resources/app.asar` inside the extracted AppImage
(`/tmp/freebuff-ads-remover-extract/squashfs-root/resources/app.asar`) with this
block prepended to `electron/main.cjs` inside the archive:

```js
// freebuff-ads-remover:begin (auto-injected by patch-freebuff-app.mjs; do not edit)
try {
  require("/home/<you>/.local/share/freebuff-ads-remover/dist/index.js");
} catch (err) { ... }
// freebuff-ads-remover:end
```

So the app requires **`dist/index.js` from the live install** — the absolute
path is baked into the patch. To change what the app renders you must edit and
build in the live install (or point the patch somewhere else by re-running the
launcher against a different directory).

The UI itself is `src/dashboard-client.ts`. It is **not** a module that gets
imported: it is compiled to `dist/dashboard-client.js` and evaluated verbatim
inside the Freebuff page.

## Injection pipeline

```
src/dashboard-client.ts
  └─ tsc ──────────────▶ dist/dashboard-client.js   (CommonJS wrapper added)
       └─ finalize-dist.mjs ─▶ strips Object.defineProperty(exports, ...)
                              fails the build if require/module.exports/import/export survive
                                   └─ Dashboard.start() reads the file at activate()
                                        ├─ WebContentsScriptTarget.injectScript(source + install(...))
                                        └─ setInterval(1s) → postScript(update(<json>))
```

Two consequences worth remembering:

* **Only type imports are allowed** in `dashboard-client.ts`, and it must not
  export values. Any emitted `import`/`export`/`require` is a syntax error in
  the page. `scripts/finalize-dist.mjs` enforces this at build time, and
  `tests/dashboard-client-dist.test.ts` re-checks it against the built file.
* `loadClientSource()` reads `dist/dashboard-client.js` **at activate time**, so
  a rebuild takes effect on the next app launch — no repatch needed.

## The page contract

`dist/dashboard-client.js` registers exactly four functions on
`globalThis.farBuffShield`:

```ts
install({ hideSelectors, version? }): void
update(snapshot: StatsSnapshot): void
unmount(): void
isOpen(): boolean
```

It mounts one element, `#far-shield-host` (`z-index: 2147483646`), with an open
shadow root containing a `<style>` plus `.far-root`. All markup and CSS live in
the shadow tree, so the host page's styles cannot leak in.

### Hooks the tests pin

`tests/dashboard-client.test.ts` (23 tests) asserts these selectors and classes.
Renaming or dropping one breaks CI:

| Hook | Meaning |
| --- | --- |
| `.badge`, `.badge-count`, `.badge.pulse` | pill that opens the panel; pulses when the total grows |
| `.panel[hidden]` | the popover. Open state is the **`hidden` attribute**, not a class |
| `.header-total`, `.hero-label`, `.spark`, `.spark-line`, `.spark-area` | session total + blocks-per-minute sparkline |
| `.pipeline` | container holding **exactly 6** `.stage` in `AD_STAGES` order |
| `.stage[data-stage]`, `.stage-dot`, `.stage-label`, `.stage-count`, `.stage.lit`, `.stage.hit` | per-stage readout |
| `.surfaces > .surface-row[data-surface]`, `.surface-name`, `.surface-bar`, `.surface-fill`, `.surface-count` | top surfaces |
| `.events > .event`, `.event .t`, `.event-dot[data-stage]`, `.event-tag`, `.event-pill`, `.event.enter`, `.empty` | latest stops |
| `.version`, `.footer .dom-hidden`, `[data-f="since"]` | version string, DOM-hidden counter, session start |
| `.mark svg` | **exactly 2** (badge + header); emoji shields are forbidden |

`.stage-label` must stay the compact form (`Inv Bid Pol Med Dlv Prm`) with the
full name in `title`.

The design itself (colours, radii, layout, the Radar/Ledger switch) is *not*
pinned by tests — only the hooks above are. Restyle freely; rename nothing.

## Data model

`StatsStore.snapshot()` produces what `update()` receives, once per second:

```ts
{
  total, at, startedAt,
  byStage:    Record<AdStage, number>,    // always all 6 keys
  bySurface:  Record<AdSurface, number>,  // always all 10 keys
  byEndpoint: Record<string, number>,
  recent:     BlockEvent[],               // newest first, MAX_RECENT = 20
  perMinute:  { minute, count }[],        // 30-minute rolling window
}
```

**`perMinute` is sparse.** `StatsStore.bucketMinute()` only pushes a bucket for a
minute that actually saw a block, so a quiet minute is *absent*, not zero. Any
"blocks over time" view must rebuild a contiguous minute axis ending at
`Math.floor(snapshot.at / 60_000)` and treat missing minutes as zero — otherwise
gaps silently collapse and the chart lies. The radar blips have the same shape of
problem: `recent` is capped at 20, so a burst larger than that cannot be fully
replayed.

## The two views

A segmented control in the panel switches them; the choice lives in memory for
the session (`ShieldState.view`) and is preserved when the script is re-injected
into an existing host.

### Radar — *where* the pressure is

A 168×168 canvas. Six bearing wedges (one per stage) with an outer band filled by
that stage's share of the busiest; three range rings and spokes; a sweep; and a
blip for every newly blocked request, brightest while the sweep passes over it.

* Blips are derived from **new** `recent` entries — any event with `at >
  lastBlipAt`, capped at 12 per push and 60 alive.
* Blips age on **wall-clock `performance.now()`**, not accumulated `dt`. The
  animation loop only runs while the Radar pane is visible, so `dt`-based ageing
  would freeze blips while the user is on Ledger and dump a stale cluster on
  return.
* The canvas re-derives its backing store from `getBoundingClientRect()` on every
  visible frame and caches against the last width. There is no `ResizeObserver`
  and no "resize after unhide" callback, so it self-heals across pane switches,
  window resizes and DPR changes regardless of callback ordering.
* The rAF loop **stops** when the panel is closed, when the view is Ledger, when
  the page is hidden, or when a newer `ShieldState` replaces this one.

### Ledger — *what happened, over time*

No animation. A 30-cell density grid (15×2, one cell per minute over the same
30-minute window as `perMinute`), then the shared stage grid.

`.pipeline` is the **same element in both views**, relaid out by CSS via
`.panel[data-view="radar"|"ledger"]`: a single column beside the dial on Radar, a
3-column grid under the heat map on Ledger. One element, so there is one source
of truth for the stage counts and no duplicated `data-stage` hooks.

## Design tokens

`:host` defines the palette. Everything is a token; there is no per-stage
rainbow in the chrome, and no gradients on surfaces.

```css
--far-accent: #3ddc84;   /* brand green — totals, sweep, open badge, bars */
--far-surface / -2 / --far-sunken   /* 3 flat steps, no gradients */
--far-line / --far-line-2           /* hairlines */
--far-txt / -2 / -3 / --far-txt-0   /* 4 text tones, low → high emphasis */
--far-r: 5px;                        /* one radius everywhere */
--far-shadow: 0 3px 0 #0e1014;       /* hard offset, not a blur */
```

Stage identity uses six **muted** hues (`hsla(hue, 42%, l%, a)`) in the radar
and the event dots only; the accent is reserved for totals so "hot" reads at a
glance. The accent is defined **twice** — as `--far-accent` and as the literal
`rgba(61, 220, 132, …)` in `drawRadar()` / `renderHeat()` / the sparkline
gradient. Inline styles and canvas cannot read the shadow custom property, so
change all of them together.

## Build, test, verify

```bash
cd ~/.local/share/freebuff-ads-remover
npm run lint && npm run typecheck && npm test && npm run build
```

Expected: 154 tests pass, no lint or type errors, and a
`[build] dashboard-client.js sanitized for page injection` line.

To see it in the app:

```bash
./scripts/launch-freebuff.sh --remote-debugging-port=9222
# then, with the panel open:
node scripts/screenshot-dashboard.mjs /tmp/shield.png
```

`scripts/screenshot-dashboard.mjs` opens the panel through the DevTools endpoint
and prints the total, stage counts and recent events straight out of the shadow
root — the fastest way to confirm which build the app is actually running.

### Headless verification without the app

`--dump-dom` cannot verify this client: under `--virtual-time-budget` Chromium
fires only ~2 `requestAnimationFrame` callbacks, so the radar loop never runs and
the canvas looks broken when it is not. Drive a real browser instead — inject
`dist/dashboard-client.js` into a page, call `install()`, then push JSON
snapshots exactly as `postScript()` does. Assert on rendered pixels, not on
element counts:

```js
const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
```

Two traps in that harness: Chromium re-serialises `hsla(...)` as `rgba(...)`, so
never assert on `style.background.includes('hsla')` after setting it; and a
`1rem` square rotated 45° has a 14.14px bounding box, so compare an arrow's
**centre** to its target, not its right edge.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Panel never appears | `Dashboard.start()` logs `client source not found` when `dist/dashboard-client.js` is missing. Run `npm run build`. |
| Old UI after a rebuild | The app reads `dist/` at activate time — restart Freebuff. Editing a scratch clone changes nothing; build in the live install. |
| Badge appears, counts stay 0 | No requests are being blocked. Confirm with `node scripts/verify-remover.mjs`; stats come from the interceptor, not the client. |
| Radar canvas blank | The rAF loop stops when the panel is closed. It restarts on open; if it stays blank, check for a JS error in the page console. |
| Two badges / duplicate host | A host with no registry is dropped and re-mounted on `install()`. If you see two, an older client version is also injected — restart the app. |
| Sparkline or heat row collapses | `perMinute` is sparse. Rebuild the contiguous axis from `snapshot.at` (see Data model). |
| Panel is cut off screen | `max-height: 74vh` with internal scroll. Measured 560px (Radar) / 555px (Ledger) tall at 340px wide. |

## Rollback

The client is one file with no data model migrations, so rollback is a rebuild.

```bash
cd ~/.local/share/freebuff-ads-remover
git checkout main          # drop the feature branch
npm run build              # dist/dashboard-client.js back to the shipped UI
```

Then restart Freebuff. Nothing is persisted by the shield (the view choice is
in-memory only), so there is no state to clean up.

Don't try to "fix" that with `localStorage`. The app's UI is served from
`http://127.0.0.1:<random port>/` and the **port changes on every launch**, so
the origin — and with it the storage bucket — is brand new each time. A write
succeeds and is simply never read back. The only case that can work is the
session itself, which the retained view state already covers.

To also undo the app-level patch — removing the extension from Freebuff
entirely — restore the untouched archive and restart:

```bash
cd /tmp/freebuff-ads-remover-extract/squashfs-root/resources
mv app.asar.orig app.asar    # original archive back in place
```

To re-enable, just launch through the launcher again — it re-patches the
archive on every start:

```bash
./scripts/launch-freebuff.sh
```

## History

* `1.2.0` and earlier — badge + single scrolling panel: hero total, sparkline,
  3×2 stage grid, top surfaces, latest stops.
* Radar/Ledger redesign (`feat/shield-radar-ledger`) — adds the in-panel view
  toggle, the radar dial and the ledger heat map; switches the badge and panel to
  squared 5px geometry with a hard offset shadow, one flat surface ramp, and a
  single brand accent. Replaces the six full-width stage bars with a compact
  grid, adds a close button, and keeps every hook in the contract above.
