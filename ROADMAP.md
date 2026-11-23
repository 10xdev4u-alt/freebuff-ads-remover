# Roadmap — freebuff-ads-remover

Vision: a self-healing, auditable, multi-surface ad blocker for Freebuff Desktop that
survives near-daily upstream releases, never breaks the host app, and stays honest via
automated verification. Scaled for 100+ issues, 1000+ commits, 1000s of PRs.

Last updated: 2026-11-19 (Wave 54 truth pass; Freebuff 0.0.204).

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

Verified 2026-11-19 against the real code. Done items are marked; rejected items moved to
the Deprecated section.

- [x] Launcher injection-integrity check: `scripts/launch-freebuff.sh:294-299` +
      `scripts/check-injection.mjs`.
- [x] Launcher audit-at-patch-time: `scripts/launch-freebuff.sh:301-306`.
- [x] Launcher `--repair` flag: `scripts/launch-freebuff.sh:193-202`.
- [ ] Extension load ping: marker presence is not activation; `scripts/check-injection.mjs`
      only checks the marker substring, so a throwing `dist/bootstrap.js` still reports a
      clean patch. → Wave 60
- [x] Graceful degradation: fail open to an unpatched launch
      (`scripts/launch-freebuff.sh:176-180,298`).
- [x] Atomic patch writes: `scripts/patch-freebuff-app.mjs:130,144` (temp + same-dir rename).
- [x] Detect Freebuff self-update mid-session: `adopt_live_payload`
      (`scripts/launch-freebuff.sh:119-165`); the adopted copy is unverified → Wave 56.
- [x] Handle AppImage FUSE mount expiry: the launcher never execs from a FUSE mount; it
      extracts to disk (`scripts/launch-freebuff.sh:250-261,311`).
- [x] Survive `ELECTRON_RUN_AS_NODE`: unset at `scripts/launch-freebuff.sh:246-247`; other
      Electron env vars still inherit → Wave 60.
- [x] stdout/stderr EPIPE guard: `src/logger.ts:14-31,95-106` plus child fds redirected;
      the launcher's own `echo` is still exposed → Wave 56.
- [~] Crash-loop protection: implemented (`src/crash-guard.ts`) but the sentinel is never
      cleared on a clean exit and the threshold is checked before counting → Wave 55.
- [ ] Checksum verification of `app.asar.orig` before restore: bare `renameSync` at
      `scripts/patch-freebuff-app.mjs:87-90` → Wave 56.

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
- [ ] Normalize duplicate slashes in paths (`/api//ad//break` slips through today). → Wave 59
- [x] Block by host in addition to path (allowlist of ad hosts). → Wave 59
- [ ] Block by request body content (sponsored task payloads).
- [ ] Block redirect chains that land on ad endpoints.
- [ ] Block prefetch/preload of ad assets.
- [ ] Guard malformed URLs in matching: `decodeURIComponent` throws on `/api/ad/%ZZ`
      (`src/url-match.ts:21`). → Wave 59
- [ ] Never skip `callback()` when `intercept()` throws (`src/electron-hook.ts:218,237`);
      a throw today leaves the request handling dangling. → Wave 59
- [ ] Audit absolute ad URLs: the scan regex only sees `/api/`-prefixed literals
      (`scripts/audit-endpoints.mjs:67`), so host-based ad URLs are invisible. → Wave 59

## 3. Coverage — DOM & CSS layer

- [ ] MutationObserver-based node removal (not just CSS hide) for `!important` overrides.
- [ ] Shadow DOM piercing for ad containers in shadow roots.
- [ ] iframe ad removal (same-origin only; cross-origin via URL blocking).
- [ ] Re-inject CSS on SPA navigation without full reload.
- [ ] Handle dynamically added ad surfaces after initial render.
- [x] Cover all 68 CSS classes (done) + keep audit green on every release.
- [ ] Add per-surface CSS scoping to avoid over-hiding.
- [ ] Dark/light theme-aware hiding (avoid layout shift).
- [ ] Prevent ad placeholder skeleton flicker (reserve space collapse).
- [x] Derive DOM selectors from the registry: `src/dom-remover.ts` hardcoded 5 while
      `src/types.ts` registers 56; the remover now flattens `AD_CSS_SELECTORS`. → Wave 59

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

- [x] Resolve retired↔canonical placement IDs in any client-side logic (done: map).
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
- [x] Hot-reload all settings without restart (mostly done; watcher ignores profile/rename).
- [x] Remote block-list feed (opt-in, signed).
- [ ] Scheduled updates of block lists.

## 8. Testing & quality

- [ ] Property-based tests for `stageForEndpoint` and `intercept`.
- [ ] Fuzz tests for URL matching (edge cases, unicode, encoding).
- [ ] Snapshot tests for `HIDE_ALL_ADS_CSS`.
- [ ] Visual regression for dashboard (Playwright).
- [x] E2E against a real Freebuff instance in CI (headless): `scripts/e2e-headless.mjs`,
      `heal-proof.yml`, `release.yml`.
- [ ] Mutation testing (stryker) for interceptor.
- [x] Coverage ratchet: never drop below 85% — thresholds are pinned at 85 for
      lines/functions/branches/statements, and the suite holds 97.5/93.9/91.2/95.7.
      → Wave 59
- [ ] Contract tests for config schema migrations.
- [ ] Golden-file tests for audit output.
- [x] Self-test the ledger gate with negative fixtures. → Wave 57

## 9. CI / automation / scale

- [x] Cron job: fetch latest Freebuff AppImage, run audit, open PR with deltas
      (`upstream-proof.yml:4-5,41-105`).
- [ ] Auto-bump version on audit-clean release: `release.yml:40-47` only asserts
      tag == `package.json`; nothing bumps it. → Wave 61 (policy-gated)
- [ ] Matrix testing across Node 20/22: `engines.node >=20` is unverified; `ci.yml` pins 22
      and `upstream-proof.yml` pins 20, but no job tests both. → Wave 60
- [~] Dependabot for all deps: npm only (`.github/dependabot.yml`); the `github-actions`
      ecosystem is absent. → Wave 60
- [ ] Signed releases (cosign) for the extension bundle: only SHA256SUMS today; the
      Ed25519 feed signature is a different system. → Wave 60
- [ ] SBOM generation. → Wave 60
- [ ] Reproducible builds: `release.yml:67` uses bare `tar -czf`. → Wave 60
- [x] Release artifacts attached to GitHub releases (`release.yml:52-84`).

## 10. Anti-detection & privacy

- [ ] Rename extension entry file to avoid trivial detection.
- [ ] Randomize loader marker comment.
- [ ] Minify/obfuscate injected require block.
- [ ] Strip ad-context client data (window state, GPU vendor, editors).
- [ ] Block telemetry beacons entirely (opt-in aggressive mode).
- [ ] Prevent Freebuff from reporting extension presence.
- [ ] Detect and neutralize anti-adblock checks.

## 11. Documentation

- [x] Auto-generate API docs from types (`scripts/gen-api-docs.mjs`).
- [ ] Keep ARCHITECTURE.md in sync via CI check.
- [ ] Video walkthrough of install + verify.
- [ ] Troubleshooting guide with common failures.
- [x] Security policy (SECURITY.md).
- [ ] Contributing guide with PR checklist.

## 12. Community & scale

- [ ] Issue templates for new ad surfaces (with audit output): only bug/feature/research
      exist today. → Wave 60
- [ ] PR template requiring audit green: no audit checkbox; `ci.yml` never runs
      `npm run audit`. → Wave 60
- [x] Release notes automation (`release.yml:81`, `proof-publish.yml`).

---

## 13. Wave backlog (locked 2026-11-19)

Sequenced from the five-audit research pass: coverage gaps, ROADMAP truth, patch/launcher
integrity, testing/ledger honesty, and loop automation. Each bullet is one atomic PR.

### Wave 54 — Hygiene & truth
- [x] Triage noise bot PRs (#189 timestamp-only receipt, #190 re-signed manifest closed).
- [x] Remove untracked drill receipts from the worktree (root fix lands in Wave 57).
- [x] ROADMAP truth pass (this PR).
- [x] Cut v1.27.0 for the #191 EPIPE / e2e-isolation / payload-version fixes.

### Wave 55 — Stop breaking the install (P0 runtime)
- [x] `fix(update): restore dist when the marker check fails` — `scripts/update.mjs:28-36`
      moves `dist` away, then throws before the restore; every updater run leaves no `dist/`.
- [x] `fix(crash-guard): clear the sentinel on clean exit` — no `before-quit`/`exit` hook
      exists, so the product self-disables after three ordinary quits.
- [x] `fix(crash-guard): count before the threshold check` — off-by-one at
      `src/crash-guard.ts:35-46`; a surviving sentinel is also double-counted.
- [x] `fix(launcher): serialize extract/patch with flock` — concurrent launchers
      `rm -rf` the shared extract and can exec a half-patched host.

### Wave 56 — Trust the payload you patch
- [x] `fix(launcher): stamp the extract only when complete` — extraction exit status is
      discarded at `scripts/launch-freebuff.sh:67`; a partial tree becomes permanent.
- [x] `fix(patch): verify the asar backup before restore` — bare rename at
      `scripts/patch-freebuff-app.mjs:87-90` promotes a truncated archive to live.
- [x] `fix(launcher): verify the adopted payload after copy` — `.adopted-version` is
      written from the source version and the copy is never checked.
- [x] `fix(launcher): redirect launcher output to the log` — the launcher's own `echo`
      can SIGPIPE before `exec` when stdout is a closed pipe.
- [x] `fix(feed): atomic feed writes` — plain `writeFileSync` in
      `scripts/feed-sync.mjs:66-68` can strand a truncated rules file forever.

### Wave 57 — Make the gates tell the truth
- [x] `fix(ledger): require passing live evidence` — `ledger-check.mjs` fails on a missing
      live receipt, a non-passing one, or one with no probes; `check-ledger.mjs` is a thin
      CLI over the importable gate.
- [x] `fix(feed): bind healHash to the published artifact` — `feed-build.mjs` refuses a
      manifest unless a receipt matches the artifact bytes and records a passing gate.
- [x] `fix(e2e): fail on empty promotion` — `e2e-headless.mjs --promote` exits 1 when no rule
      is promoted; `heal-proof.yml`/`release.yml` pass the flag only for a non-empty artifact.
- [x] `test(ledger): self-test the gate` — `tests/check-ledger.test.ts` covers the happy path
      and eleven negative fixtures.
- [x] `fix(proof): publish the newest verified receipt` — `scripts/pick-live-receipt.mjs`
      selects by `at`, requires `pass` and `provenance`, and fails without one.
- [x] `test(drill): assert a real heal delta and write to temp` — `loop-drill.mjs` fails on an
      empty delta and writes its receipt under the temp work dir.
- [x] `fix(verifier): stop over-claiming control health` — a control answers 401 (`/healthz`,
      launch-id cookie scoped to /api) or 404 (`/api/account/usage`, a hosted route) on a
      packaged launch, so requiring 2xx turned `heal-proof` red on `main`. Accept any
      non-5xx answer as reached; a 5xx still fails and rolls back promoted rules.
- [x] `fix(e2e): actually apply the signed feed` — `--feed` only set a config field nothing
      reads, so `heal-proof`'s "feed was applied" guard could never pass. `scripts/feed-apply.mjs`
      runs the launcher's `feed-sync.mjs` invocation, requires the delivery receipt, and the
      harness probes the routes the feed delivered.
- [x] `fix(ledger): bind live evidence to the shipped artifact` — a missing or unparseable
      receipt timestamp skipped the freshness check, and a live `artifactHash` was never
      compared to `config/generated-rules.json`, so a passing run for artifact A could
      green-light artifact B. Both now fail; the feed manifest's `generatedAt` gets the same
      finite-age check.

### Wave 58 — Make truth apply to shipped code
- [x] `ci: require real E2E on source PRs` — branch protection requires `heal-proof`, so its
      `paths` filter left any PR that did not touch a proof path blocked on a status that
      never reported. The filter is gone: every PR now runs the real E2E.
- [x] `fix(verify): require a real block reason` — any fetch rejection is labelled BLOCKED.
- [x] `ci: close the fail-open paths` — `release.yml` no longer swallows a missing
      corpus/receipts/docs/LICENSE/CHANGELOG, `inbound-triage.yml` no longer swallows a
      failed issue creation, and `upstream-proof.yml` fails when the audit emits no readable
      report instead of only recording the exit code.
- [x] `test(verifier): cover negative paths` — happy-path mocks only.
- [x] `fix(e2e): exercise the signed feed` — `--feed` is wired to an empty url/key.
- [x] `fix(ci): pin the E2E payload version` — a `||` fallback can test a different binary
      than the receipt claims.
- [x] `fix(corpus): preserve controls and stage writes` — `update-corpus.mjs:53` resets
      controls to the hardcoded pair.
- [x] `fix(heal): stop daily receipt churn` — `generatedAt` bumps every run, opening a
      no-op PR daily.
- [x] `ci: serialize the loop workflows` — four crons race on release day.
- [x] `ci: alert when the heal gate fails` — a rejected heal leaks ads silently.
- [x] `fix(loop): connect inbound candidates to heal` — `inbound-triage.yml` uploads
      `inbound/candidates.json` as an artifact, `upstream-proof.yml` downloads the latest
      successful run's artifact and passes it to `self-heal`, and `self-heal` now fails on a
      missing or unreadable `--candidates` file instead of silently healing without it.

### Wave 59 — Coverage & registry
- [x] `fix(match): guard malformed URLs` — `decodeURIComponent` threw on `/api/ad/%ZZ`;
      a malformed encoding now falls back to matching the raw path instead of
      escaping `matchRoute`.
- [x] `fix(hook): never skip callback on intercept throw` — `electron-hook.ts` let an
      `intercept` throw skip the Electron callback, hanging the request; both the
      first-arm and re-arm listeners now share a handler that always calls back.
- [x] `feat(audit): audit absolute ad URLs` — the scan only matched literals beginning
      with `/api/`, so a host-based call such as `https://ads.example.com/api/ad/break`
      was invisible; absolute URLs are now classified by pathname plus host and join
      `routes.missing` so the loop can heal them.
- [x] `feat(dom): derive selectors from the registry` — the remover flattened 5
      hardcoded selectors while `src/types.ts` registers 56; selectors are now
      derived from the registry.
- [x] `feat(block): block third-party ad hosts` — a configured `adHosts` entry is
      blocked regardless of path, so ad assets whose URLs are not ad-shaped are
      stopped too. First-party hosts are exempt, so the app's own remote auction
      cannot be swallowed; the audit reports non-first-party hosts serving
      ad-shaped routes under `routes.hostCandidates`, and self-heal promotes one
      into a host rule (`addHosts`) rather than a bogus origin endpoint. Empty by
      default: 0.0.204 serves every ad from first-party hosts.
- [x] `test(corpus): assert surface classifications` — every ad was labelled
      `sponsorBreak`; `classifyEndpoint` is now shared and the corpus carries the
      classified surface, with a test asserting each entry.
- [x] `test(proof): cover the zero-coverage proof modules` — `autopilot`, `dom-probe`,
      `install-id`, `miss-report`, `outcome-report` and `trust-report` now have tests.
- [x] `test: ratchet coverage toward 85%` — the vitest thresholds are raised to 85
      for all four metrics, backed by new branch-focused suites; the landing page,
      README and this roadmap now state the measured figures.
- [x] `fix(proof): verify the landing-page claims` — the ledger now checks the
      version pill and eyebrow against `package.json` and the live receipt, the
      hero test count, the `N/N ad routes blocked` figure against the corpus ad
      count, and both coverage figures against the vitest run; the live-proof page
      must embed a committed passing live-e2e receipt.
- [x] `test: de-flake the timing benchmarks` — wall-clock budgets now warm up and take
      the best of several batches, so one descheduled CI sample cannot fail them.

### Wave 60 — Release trust & contribution gates
- [ ] `ci: SBOM in release`.
- [ ] `ci: cosign the release tarball`.
- [ ] `ci: reproducible release tarball`.
- [ ] `ci: dependabot for GitHub Actions`.
- [ ] `ci: Node 20/22 test matrix`.
- [ ] `docs: ad-surface issue template`.
- [ ] `ci: gate PRs on audit deltas`.
- [ ] `fix(launcher): sanitize Electron env vars`.
- [ ] `feat(bootstrap): confirm extension load on boot`.
- [ ] `fix(config): honor profile in the watcher`.
- [ ] `build: harden the page-client sanitizer guard`.

### Wave 61 — Zero manual landing (policy-gated)
- [ ] `ci: auto-merge the bot PR train` — conflicts with `PLAN.md` non-negotiables;
      needs an explicit decision first.
- [ ] `ci: auto-cut a release from a verified live receipt` — needs the versioning policy
      decided first.

---

## Milestones

- **M1 (v1.5.x):** Robustness + integrity (section 1). Target: 20 issues.
- **M2 (v1.6.x):** Coverage expansion network+DOM (sections 2-3). Target: 25 issues.
- **M3 (v1.7.x):** Script layer + placement aliases (sections 4-5). Target: 15 issues.
- **M4 (v1.8.x):** Dashboard v2 + config UX (sections 6-7). Target: 20 issues.
- **M5 (v1.9.x):** Testing & CI scale (sections 8-9). Target: 25 issues.
- **M6 (v2.0.x):** Anti-detection + privacy + docs (sections 10-12). Target: 20 issues.

Total tracked items: 100+. Each item = one issue/PR. Target: 1000+ commits over the program.

## Deprecated (verified against 0.0.201 bundle)
- SSE/WebSocket renderer hooks — 0 ad usage (only LLM streaming libs).
- Service-worker ad blocking — no service worker present.
- Renderer fetch/XHR monkey-patching — session.webRequest already covers it.

## Rejected (reviewed 2026-11-19)
- Backup rotation (last 3 asars) — the AppImage is the authoritative pristine source;
  rotation adds state and recovery ambiguity with no user benefit.
- mtime watch on `freebuff-app` — sha256-at-launch is strictly stronger.
- Semantic-release / auto-generated CHANGELOG — fights the curated wave versioning and
  the `check-ledger.mjs` drift guard; the CHANGELOG is prose, not commit logs.
- CODEOWNERS per module / stale-issue bot / Discord — single maintainer, no community yet.
- "Repacking breaks asar integrity" — the installed 0.0.204 asar has no `integrity` header
  and `package.json` has no `asarIntegrity` (verified directly).
