# Roadmap — freebuff-ads-remover

Vision: a self-healing, auditable, multi-surface ad blocker for Freebuff Desktop that
survives near-daily upstream releases, never breaks the host app, and stays honest via
automated verification. Scaled for 100+ issues, 1000+ commits, 1000s of PRs.

Last updated: v1.5.0 (Freebuff 0.0.201).

## Guiding principles

- **Never trust upstream.** Every release is hostile-by-default until audited.
- **Block by endpoint first, DOM second, CSS third.** Network blocking is authoritative;
  DOM/CSS are fallbacks for what slips through.
- **Fail open for the host, fail closed for ads.** The extension must never crash Freebuff;
  a missed ad is acceptable, a broken app is not.
- **Verify, don't assert.** `audit-endpoints.mjs` + `verify-remover.mjs` + tests are the
  source of truth, not code review.
- **Small, reviewable units.** Each PR changes one surface or one behavior.

## Status legend

- [ ] planned  [~] in progress  [x] done

---

## 0. Foundations (done)

- [x] AppImage extract → patch app.asar → repack flow
- [x] Idempotent loader injection into `electron/main.cjs`
- [x] Pristine archive kept as `app.asar.orig` (restorable)
- [x] Updater survival via `adopt_live_payload`
- [x] Config schema (Zod) + hot reload
- [x] Endpoint + tracking block lists
- [x] Per-surface toggles
- [x] CSS fallback injector
- [x] Electron session hook (default + partitions)
- [x] Dashboard (stats store + shield UI)
- [x] `audit-endpoints.mjs` regression guard
- [x] `verify-remover.mjs` CDP smoke test
- [x] CI (lint/typecheck/test)
- [x] Issue/PR templates, CODEOWNERS

## 1. Robustness & self-healing (high priority)

- [ ] Launcher injection-integrity check: verify loader marker present in `app.asar`;
      auto-re-patch if stripped by an updater.
- [ ] Launcher audit-at-patch-time: run `audit-endpoints.mjs` after patching; warn on gaps.
- [ ] Launcher `--repair` flag: force re-extract + re-patch + verify.
- [ ] Extension load ping: main process confirms load within N seconds; else log + retry.
- [ ] Graceful degradation: if injection fails, launch unpatched rather than crash.
- [ ] Atomic patch writes (temp file + rename) to avoid half-written asar.
- [ ] Backup rotation: keep last 3 pristine asars, prune older.
- [ ] Checksum verification of `app.asar.orig` before restore.
- [ ] Detect Freebuff self-update mid-session; queue re-patch for next launch.
- [ ] Watch `~/.local/bin/freebuff-app` mtime; trigger re-extract on change.
- [ ] Handle AppImage FUSE mount expiry (re-extract on stale mount).
- [ ] Survive `ELECTRON_RUN_AS_NODE` / env contamination.
- [ ] stdout/stderr EPIPE guard (done in v1.5.0 launcher).
- [ ] Crash-loop protection: if Freebuff crashes 3x after patch, auto-disable extension.

## 2. Coverage — network layer

- [ ] Block `https://freebuff.com/api/desktop/updates/` behind opt-in `blockUpdates` toggle.
- [ ] Intercept SSE (EventSource) ad streams, not just fetch/XHR.
- [ ] Intercept WebSocket ad channels.
- [ ] Intercept `navigator.sendBeacon` ad calls (via preload patch).
- [ ] Block ad requests issued from service workers (session-level, already partial).
- [ ] Block ad requests from `webview` tags.
- [ ] Cover `persist:freebuff-hosted-v1-*` partitions fully (currently discovered lazily).
- [ ] Cover new partitions naming schemes without code changes (regex match).
- [ ] Handle ad requests with query-string variants (`?placement=...`).
- [ ] Handle ad requests with trailing slashes / case differences.
- [ ] Block by host in addition to path (allowlist of ad hosts).
- [ ] Block by request body content (sponsored task payloads).
- [ ] Block redirect chains that land on ad endpoints.
- [ ] Block prefetch/preload of ad assets.

## 3. Coverage — DOM & CSS layer

- [ ] MutationObserver-based node removal (not just CSS hide) for `!important` overrides.
- [ ] Shadow DOM piercing for ad containers in shadow roots.
- [ ] iframe ad removal (same-origin only; cross-origin via URL blocking).
- [ ] Re-inject CSS on SPA navigation without full reload.
- [ ] Handle dynamically added ad surfaces after initial render.
- [ ] Cover all 68 CSS classes (done) + keep audit green on every release.
- [ ] Add per-surface CSS scoping to avoid over-hiding.
- [ ] Dark/light theme-aware hiding (avoid layout shift).
- [ ] Prevent ad placeholder skeleton flicker (reserve space collapse).

## 4. Coverage — script layer

- [ ] Inject a robust `farBuffShield` with retry on CSP failures.
- [ ] Observe `ads:context` IPC and neutralize client context (privacy).
- [ ] Block `ad-context` reads at IPC boundary.
- [ ] Neutralize placement-alias resolution so retired IDs stay retired.
- [ ] Hook `window.fetch` / `XMLHttpRequest` in renderer as belt-and-suspenders.
- [ ] Hook `EventSource` in renderer.
- [ ] Disable ad-related feature flags in `localStorage`/`IndexedDB`.
- [ ] Spoof ad-density telemetry to zero.

## 5. Placement aliases & sponsored commands

- [ ] Resolve retired↔canonical placement IDs in any client-side logic (done: map).
- [ ] Block sponsored-command refusals bypass (new v0.0.201 module).
- [ ] Track placement-alias usage in dashboard.
- [ ] Auto-update alias map from upstream bundle on each release.

## 6. Dashboard & observability

- [ ] Per-surface, per-stage time-series charts.
- [ ] Top blocked endpoints list.
- [ ] Block-rate sparkline.
- [ ] Export block log (JSON/CSV) from dashboard.
- [ ] Desktop notification on new ad surface detected.
- [ ] Local-only telemetry (opt-in) for aggregate effectiveness stats.
- [ ] Health panel: injection status, audit status, last update.
- [ ] Keyboard shortcuts for toggle/pause.
- [ ] Dark/light theme sync with Freebuff.

## 7. Configuration & UX

- [ ] Per-profile config (multiple Freebuff profiles).
- [ ] Import/export config.
- [ ] Preset profiles: strict / balanced / minimal.
- [ ] First-run wizard.
- [ ] In-app settings panel (not just JSON).
- [ ] Hot-reload all settings without restart (mostly done).
- [ ] Remote block-list feed (opt-in, signed).
- [ ] Scheduled updates of block lists.

## 8. Testing & quality

- [ ] Property-based tests for `stageForEndpoint` and `intercept`.
- [ ] Fuzz tests for URL matching (edge cases, unicode, encoding).
- [ ] Snapshot tests for `HIDE_ALL_ADS_CSS`.
- [ ] Visual regression for dashboard (Playwright).
- [ ] E2E against a real Freebuff instance in CI (headless).
- [ ] Mutation testing (stryker) for interceptor.
- [ ] Coverage ratchet: never drop below 85%.
- [ ] Contract tests for config schema migrations.
- [ ] Golden-file tests for audit output.

## 9. CI / automation / scale

- [ ] Cron job: fetch latest Freebuff AppImage, run audit, open PR with deltas.
- [ ] Auto-bump version on audit-clean release.
- [ ] Auto-generate CHANGELOG from conventional commits.
- [ ] Semantic-release.
- [ ] Matrix testing across Node 20/22.
- [ ] Dependabot for all deps (already partial).
- [ ] Signed releases (cosign) for the extension bundle.
- [ ] SBOM generation.
- [ ] Reproducible builds.
- [ ] Release artifacts attached to GitHub releases.

## 10. Anti-detection & privacy

- [ ] Rename extension entry file to avoid trivial detection.
- [ ] Randomize loader marker comment.
- [ ] Minify/obfuscate injected require block.
- [ ] Strip ad-context client data (window state, GPU vendor, editors).
- [ ] Block telemetry beacons entirely (opt-in aggressive mode).
- [ ] Prevent Freebuff from reporting extension presence.
- [ ] Detect and neutralize anti-adblock checks.

## 11. Documentation

- [ ] Auto-generate API docs from types.
- [ ] Keep ARCHITECTURE.md in sync via CI check.
- [ ] Video walkthrough of install + verify.
- [ ] Troubleshooting guide with common failures.
- [ ] Security policy (SECURITY.md).
- [ ] Contributing guide with PR checklist.

## 12. Community & scale

- [ ] Issue templates for new ad surfaces (with audit output).
- [ ] PR template requiring audit green.
- [ ] CODEOWNERS per module.
- [ ] Triage bot for stale issues.
- [ ] Release notes automation.
- [ ] Discord/community channel.

---

## Milestones

- **M1 (v1.5.x):** Robustness + integrity (section 1). Target: 20 issues.
- **M2 (v1.6.x):** Coverage expansion network+DOM (sections 2-3). Target: 25 issues.
- **M3 (v1.7.x):** Script layer + placement aliases (sections 4-5). Target: 15 issues.
- **M4 (v1.8.x):** Dashboard v2 + config UX (sections 6-7). Target: 20 issues.
- **M5 (v1.9.x):** Testing & CI scale (sections 8-9). Target: 25 issues.
- **M6 (v2.0.x):** Anti-detection + privacy + docs (sections 10-12). Target: 20 issues.

Total tracked items: 100+. Each item = one issue/PR. Target: 1000+ commits over the program.
