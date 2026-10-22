# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-22

Freebuff `0.0.186` broke the patch entirely: the app shipped with the Electron
`OnlyLoadAppFromAsar` fuse enabled, so the unpacked `resources/app/` directory
this project used to create made Electron exit before `main.cjs` ran — no
window, no error, no log line. Ads came back the moment the app did boot.

### Fixed

- Patching now **repacks `app.asar`** instead of leaving an unpacked `app/`
  directory. The pristine archive is still kept as `app.asar.orig`, and the
  repack is verified by reading the marker back out of the new archive.
- Automatic migration of an existing unpacked `app/` install back to a repacked
  archive on the next launch.
- Launcher: payload detection accepts `app.asar.orig`, so a previously patched
  extract still resolves.

### Added

- Blocks the ad endpoints introduced in Freebuff `0.0.186`:
  `/api/ad/intent`, `/api/ad/report`, `/api/ad/invitation/git/*`
  (invitation prefix matching, was three leaf paths),
  `/api/v1/ads*` (all remote ad calls: impression, click, engagement,
  invitation, policy, prefs, proposal, sponsored-skills) and
  `/api/telemetry/ad-density`.
- CSS fallback selector for `0.0.186` partner units
  (`[class*="partner-placement"]`), which carry no `partner-ad` class.
- `tests/patch-freebuff-app.test.ts`: pins the repack contract (no `app/` dir,
  pristine backup untouched, idempotent re-bake, legacy migration).
- `scripts/audit-endpoints.mjs` (`npm run audit`) — scrapes every route out of a
  payload's orchestrator + renderer bundle and reports ad routes the interceptor
  misses. Covers Freebuff's near-daily releases.
- Blocks `/api/sponsored-survey` (sponsored questionnaire served through the
  orchestrator).

## [1.2.0] - 2026-10-11

### Added

- Shield dashboard: a live in-app panel (shadow-DOM badge + expandable
  card) showing blocks per ad-funnel stage
  (`Inventory → Bid → Policy → Media → Delivery`, plus `Promo`), top
  surfaces, latest stops and a DOM-hide counter. Stats are collected in a
  `StatsStore`, pushed to the page once per second over `executeJavaScript`,
  and toggled with the `dashboard` config flag.
- `sponsoredCard` surface: hides in-chat sponsor cards
  (`a.sponsored-ad.ad-card` and friends) — server-rendered creatives that
  carry no legacy surface keywords in their markup.
- Update survival: the launcher now adopts a newer live updater payload
  (see below) instead of only trusting the AppImage file on disk.
- `scripts/payload-version.mjs`: prints `<name> <version>` for a payload
  resources dir (unpacked `app/` or `app.asar`).
- `scripts/screenshot-dashboard.mjs`: opens the shield panel over CDP and
  captures a screenshot for visual verification.

### Changed

- Launcher: on start it scans FUSE-mounted payloads behind running
  Freebuff processes and, when one is newer than the extract, copies it
  over (`scripts/adopt` flow, stamped `.adopted-version`). An adopted
  payload is reused while the AppImage on disk is older, so in-app
  updater restarts (which bypass the launcher and run from a temp
  download) no longer orphan the extension — the next icon launch
  self-heals onto the new version, already patched.
- Dashboard pipeline labels are now compact (`Inv/Bid/Pol/Med/Dlv/Prm`,
  full names as tooltips) so they fit their stage boxes.

## [1.1.0] - 2026-10-11

### Added

- App patcher (`scripts/patch-freebuff-app.mjs`): injects the extension
  loader into Freebuff's `resources/app.asar` — the only reliable preload
  path, since Electron ignores `--require`, `NODE_OPTIONS` and `--app` for
  packaged apps. Original archive is preserved as `app.asar.orig`.
- `WebContentsCssTarget`: CSS fallback now injects via
  `webContents.insertCSS` (sessions have no `insertCSS` API), re-applies on
  navigation, and never touches previewed third-party sites.
- `scripts/verify-remover.mjs`: end-to-end probe through the DevTools
  endpoint — asserts ad fetches are blocked while control requests still
  reach the orchestrator.
- Auto-activation: the extension registers its `app.whenReady()` hook at
  module load, before the app's own `boot` runs.

### Changed

- Launcher: drops the ineffective `--require` flag, unsets
  `ELECTRON_RUN_AS_NODE`, patches the app payload, and re-extracts the
  AppImage when it changes (so updates get patched too).
- Build: `dist/package.json` (`{"type":"commonjs"}`) is emitted by the
  build; stale `dist/index.cjs` removed.
- Lint: fixed pre-existing violations (the `typescript-eslint` package was
  missing, so lint had never actually run); tests get a tsconfig and a
  small rule relaxation for mock-heavy code.

## [1.0.0] - 2026-10-09

### Added

- Foundation: TypeScript project scaffold with strict mode
- Config system with zod validation and hot-reload
- Ad interceptor: pattern matching for all 18 ad endpoints
- CSS injector: fallback hiding for all 9 ad surfaces
- Electron session hook: webRequest integration
- Extension entry point: activate/deactivate API
- Launcher script: one-command Freebuff launch with extension
- Update checker: GitHub releases version comparison
- Performance monitor: latency, memory, uptime tracking
- CI/CD pipeline: lint, typecheck, test, build
- Research documentation: complete ads architecture
- Architecture documentation: component diagrams and data flow
- 57 tests across 5 test files
- GitHub issue and PR templates
- README with installation and configuration guide
- Contributing guide

### Research

- Complete reverse-engineering of Freebuff Desktop ads system
- 18 ad API endpoints mapped
- 6 ad surfaces identified and classified
- Renderer state flow documented
- Blocking strategy designed and validated
