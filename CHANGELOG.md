# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.20.0] - 2026-11-09

Wave 46: the loop fights a real war. Drill harness, ledger enforcement, benchmark threshold.

## [1.19.0] - 2026-11-09

Wave 45: the loop reaches the user. Default-on feed, key rollover, kill switch, maxRules, farbuff update, delivery receipt.

## [1.18.0] - 2026-11-09

Wave 44: the loop fires on main. feed-build receipt selection, update.mjs atomic swap, install.sh tag pin, ledger enforcement.

## [1.17.0] - 2026-11-09

Wave 43: the loop runs. add-paths + large-file guard, feed/proof PR mergeability, ledger enforces feed/proof/version, truth-pass.

## [1.16.0] - 2026-11-09

Wave 42: the shield wakes. farbuff status, live-proof link, truth-pass, conservative defaults.

## [1.15.0] - 2026-11-09

Wave 41: the shield ships. Installer, uninstaller, self-update, .gitignore for extracted artifacts, feed publish via PR, truth-pass docs.

## [1.14.0] - 2026-11-09

Wave 40: the shield delivers. Front door drift check, empty-delta no-op, live receipt + proof page committed, feed-sync CLI, truth-pass docs.

## [1.13.0] - 2026-11-09

Wave 39: the loop delivers. Safety gate (exact token match, protected-route collision), corpus drift guard, feed builder refuses unknown, ledger fails on bad live receipts.

## [1.12.0] - 2026-11-09

Wave 38: the shield proves. Full-corpus live gate, truncated-set guard, machine-born live receipt, truth-pass disclosure.

## [1.11.0] - 2026-11-09

Wave 37: the loop goes live. Canonical manifest, pinned Ed25519 key, merged feed/inbound settings, wild outcome relay, outbound aggregation, --feed E2E gate, inbound triage issue creation.

## [1.10.0] - 2026-11-09

Wave 36: the shield listens. Privacy-safe miss envelopes, opt-in submission,
corroboration-gated aggregation, inbound candidates into the heal pipeline.

## [1.9.0] - 2026-11-09

Wave 34: the shield syncs. Signed feed manifest, launcher sync, feed rule loading,
edge outcome export, kill switch.

## [1.8.0] - 2026-11-09

Wave 33: the loop heals a rename. Single-token classifier fix, real baseline path,
live-fire drill against a non-ad-prefixed route.

## [1.7.0] - 2026-11-09

Wave 32: multi-signal candidate classifier, payload-drift baseline, runtime
observation of candidates, explicit control rejection.

### Added
- `src/candidates.ts` classifier with path/host/module/param signals.
- `config/endpoint-baseline.json` payload-drift baseline.
- Candidate reporting in audit and baseline updates in self-heal.

### Changed
- `isControlRoute` now uses an explicit allow-list.
- Runtime observer considers classifier candidates, not only ad-shaped misses.

## [1.6.1] - 2026-11-09

Wave 31 proof-green: machine-born receipts, live promotion assertion, single-flight
and debounce invariants, truth-passed landing hash, and dependency bumps.

### Added

- `provenance` field on heal receipts (`machine` in CI, `legacy-hand-merge` for the
  historical receipt).
- Single-flight `PromotionEngine.tick()` and debounced `ShieldStateStore` writes.
- `--expect-promoted` assertion folded into heal-proof and release workflows.

### Changed

- Upstream AppImage tag resolution now matches `freebuff-desktop-v…`.
- Landing cites the real receipt artifact hash.

## [1.5.1] - 2026-11-08

19 waves of hardening: self-healing loop primitives, real activation proof,
per-profile config, block-log export, per-surface time series, live kill-board
landing page, and a tag-triggered release system.

### Added

- Deterministic activation test replaying the 40-entry golden corpus through the
  real bootstrap path (38/38 ad routes blocked, 2/2 controls pass).
- Ledger check (README test count + corpus hash) wired into CI.
- Live kill-board landing page with radar hero, typed receipt, loop, dashboard,
  proof panel, and CSV export.
- Tag-triggered release workflow with SHA256SUMS and workflow_dispatch escape hatch.

### Fixed

- Delta gate now uses the real AdInterceptor instead of substring matching.
- Audit tool loads persisted rules (convergent observer).
- Runtime verifier derives orchestrator origin from webContents and watches new
  windows.
- Autopilot saves to the config dir instead of process.cwd().

## [1.4.0] - 2026-11-02

Freebuff `0.0.196` moved threads into a hosted workspace on `https://freebuff.com`
with its own session partition, so the extension's shield and ad hiding vanished
the moment a thread opened. Also made `blockTracking` a real feature.

### Added

- Hooks every Electron session (default + any discovered via `webContents` or
  `session-created`), so the hosted workspace partition is covered.
- Hosted workspace (`freebuff.com`) is now a first-party injection target for
  CSS and the dashboard script; previewed third-party sites stay excluded.
- `blockTracking` semantics: tracking endpoints (impression, click,
  click-return, engagement, report, break-event, invitation click/event and
  their `/api/v1/ads` equivalents) pass through when `false`; ad content stays
  blocked.
- `scripts/audit-endpoints.mjs` now also audits DOM selector literals the app
  uses and reports uncovered surfaces, plus a review list of CSS-only ad classes.
- Coverage for `0.0.196` surfaces: `sponsored-*`, `tab-sponsored`, `ad-banner`,
  `ad-with-reward`, `ad-reward`, `ad-greptile`, `ad-posthog`.

### Fixed

- `blockTracking` was a dead config key.
- Shield badge and ad hiding now persist inside threads.

### Changed

- Docs: documented orchestrator-side fetch limitation and session-scoped stats.

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

### Changed

- Docs: verification is log-based (`"logLevel": "debug"` →
  `Blocked ad request:`). Freebuff `>= 0.0.186` ships its own scoped CDP bridge
  and exits when the app-wide `--remote-debugging-port` flag is passed, so
  `verify-remover.mjs` / `screenshot-dashboard.mjs` only work on older payloads.
- Documented the stale-`~/.config/Freebuff/Singleton*`-lock failure mode that
  makes the app exit silently after a hard kill.

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
