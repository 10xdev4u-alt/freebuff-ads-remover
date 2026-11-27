# Roadmap — freebuff-ads-remover

Vision: a self-healing, auditable, multi-surface ad blocker for Freebuff Desktop that
survives near-daily upstream releases, never breaks the host app, and stays honest via
automated verification. Scaled for 100+ issues, 1000+ commits, 1000s of PRs.

Last updated: 2026-11-28 (Wave 87; Freebuff 0.0.205).

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
- [x] Extension load confirmation: `activate()` writes `load-receipt.json`
      (status/pid/version/at) and `scripts/check-runtime-load.mjs` rejects a
      missing/stale/dead/corrupt or version-mismatched receipt; headless E2E fails
      when a boot never reached the success path (`scripts/e2e-headless.mjs:259-267`).
      → Wave 60
- [x] Graceful degradation: fail open to an unpatched launch
      (`scripts/launch-freebuff.sh:176-180,298`).
- [x] Atomic patch writes: `scripts/patch-freebuff-app.mjs:130,144` (temp + same-dir rename).
- [x] Detect Freebuff self-update mid-session: `adopt_live_payload`
      (`scripts/launch-freebuff.sh:136-188`) stages the live payload and verifies the
      copied version and `app.asar` before committing it. → Wave 56
- [x] Handle AppImage FUSE mount expiry: the launcher never execs from a FUSE mount; it
      extracts to disk (`scripts/launch-freebuff.sh:250-261,311`).
- [x] Drop hostile Electron/node env before launch: `sanitize_env` unsets 15 vars
      (`ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ASAR`, runtime/log overrides,
      `NODE_OPTIONS`/`NODE_PATH`/`LD_PRELOAD`) before any helper or `exec`
      (`scripts/launch-freebuff.sh:234-257,262`). → Wave 60
- [x] stdout/stderr EPIPE guard: `src/logger.ts:14-31,95-106` plus child fds redirected;
      the launcher's own `echo` is still exposed → Wave 56.
- [x] Crash-loop protection: `src/crash-guard.ts` consumes the sentinel exactly once
      and resets the counter on a clean exit (`:55,65,78`). → Wave 55
- [x] Validate `app.asar.orig` before restore: the legacy migration reads the backup's
      main entry first, so a truncated archive aborts instead of becoming the live
      payload (`scripts/patch-freebuff-app.mjs:87-95`). → Wave 56

## 2. Coverage — network layer

- [x] Block `https://freebuff.com/api/desktop/updates/` behind opt-in `blockUpdates` toggle
      (`src/config.ts:12`, `src/interceptor.ts:150-165`); off by default and never
      enabled by presets. → Wave 63
- [x] Intercept SSE (EventSource) ad streams — the wildcard
      `onBeforeRequest({urls:['*://*/*']})` cancels any HTTP GET in a hooked
      session, including EventSource-style streams; renderer monkey-patching is
      deliberately not used (`src/electron-hook.ts:270,282`). → Wave 72 truth pass
- [ ] Intercept WebSocket ad channels — no WebSockets are intercepted; the
      0.0.201 audit found no ad usage (`ROADMAP.md` Deprecated). Revisit only with
      real evidence.
- [x] Intercept `navigator.sendBeacon` ad calls — beacon POSTs are ordinary
      requests through the same wildcard listener, with the real method forwarded
      (`src/electron-hook.ts:244`). No preload patch needed. → Wave 72 truth pass
- [x] Block ad requests issued from service workers (session-level) — any
      `session-created` session gets the same wildcard listener
      (`src/electron-hook.ts:92-96`); real-app routing remains an E2E claim.
      → Wave 72 truth pass
- [x] Block ad requests from `webview` tags — guest sessions arrive via
      `web-contents-created` and are hooked/re-armed (`src/electron-hook.ts:95-100,228-231`).
      → Wave 72 truth pass
- [x] Cover `persist:freebuff-hosted-v1-*` partitions — regex discovery at
      startup (`src/partition-scanner.ts:4-12`, `src/electron-hook.ts:103-116`).
      → Wave 72 truth pass
- [x] Cover new partition naming schemes without code changes —
      `network.partitionPattern` is compiled at activation
      (`src/electron-hook.ts:108`). → Wave 72 truth pass
- [x] Handle ad requests with query-string variants (`?placement=...`) —
      query sorting and prefix matching (`src/url-match.ts:10-12,33`).
      → Wave 72 truth pass
- [x] Handle ad requests with trailing slashes / case differences —
      lowercasing and slash collapse (`src/url-match.ts:5,9,25-28,32-33`).
      → Wave 72 truth pass
- [x] Normalize duplicate slashes in paths — `src/url-match.ts:5,9` for absolute
      URLs and `:20-22` for the path-only branch used in production. Regression
      tests in `tests/url-match-canonicalization.test.ts`. → Wave 59, verified Wave 62
- [x] Block by host in addition to path (allowlist of ad hosts). → Wave 59
- [ ] Block by request body content (sponsored task payloads).
- [x] Block redirect chains that land on ad endpoints — `createChainTracker`
      (`src/redirect-chain.ts:8-31`) preserves an ad flag across re-record, and
      `tests/redirect-chain-canonicalization.test.ts` covers re-arm duplicates
      and duplicate-slash ad hops. → Wave 59, hardened Wave 62
- [x] Block prefetch/preload of ad assets — all resource types hit the same
      wildcard `onBeforeRequest` (`src/electron-hook.ts:270,282`). No
      `resourceType` filter is needed. → Wave 72 truth pass
- [x] Guard malformed URLs in matching: `decodeURIComponent` failures fall back to the
      raw path (`src/url-match.ts:22`). → Wave 59
- [x] Never skip `callback()` when `intercept()` throws: the shared handler logs and
      calls back (`src/electron-hook.ts:209-218`). → Wave 59
- [x] Audit absolute ad URLs: host-based literals are classified and reported under
      `routes.missing`/`hostCandidates` (`scripts/audit-endpoints.mjs:106-148`). → Wave 59

## 3. Coverage — DOM & CSS layer

- [x] MutationObserver-based node removal for `!important` overrides: nodes are
      physically removed and re-scans are raf-scheduled on childList/subtree
      changes (`src/dom-remover.ts:55,81-86`). → Wave 64 truth pass
- [x] Shadow DOM piercing for ad containers in shadow roots: recursive sweep,
      root observation and an `attachShadow` hook (`src/dom-remover.ts:59-67,93-97,118`).
      → Wave 64 truth pass
- [x] iframe ad removal (same-origin only; cross-origin via URL blocking):
      recursive `contentDocument` sweep, per-iframe MutationObserver and a
      capture-phase `load` handler for late/navigated frames
      (`src/dom-remover.ts:64-72,98-102,129-130`). → Wave 64
- [x] Re-inject CSS on SPA navigation without full reload: CSS is re-injected on
      `did-finish-load` (`src/web-contents-css.ts:123-132`), and `pushState`,
      `replaceState` and `popstate` re-scan the DOM (`src/dom-remover.ts:125-127`).
      → Wave 64 truth pass
- [x] Handle dynamically added ad surfaces after initial render: observer +
      history hooks (`src/dom-remover.ts:81-96,125-127`). → Wave 64 truth pass
- [x] Cover every registered CSS selector (`src/types.ts:333` `AD_CSS_SELECTORS`)
      and keep the audit green on every release.
- [x] Per-surface CSS/DOM scoping avoids over-hiding: injected CSS is combined
      only when every surface is enabled and the registry still matches the
      default selector set (`src/css-injector.ts:65-79`); DOM-removal selectors
      are derived from `config.surfaces` (`src/dom-remover.ts:175-190`) and
      re-armed on config change (`src/electron-hook.ts:updateConfig`).
      `tests/per-surface-scoping.test.ts`. → Wave 64
- [ ] Dark/light theme-aware hiding (avoid layout shift).
- [ ] Prevent ad placeholder skeleton flicker (reserve space collapse).
- [x] Derive DOM selectors from the registry: `src/dom-remover.ts` hardcoded 5 while
      `src/types.ts` registers 56; the remover now flattens `AD_CSS_SELECTORS`. → Wave 59

## 4. Coverage — script layer

- [ ] Inject a robust `farBuffShield` with retry on CSP failures.
- [x] Observe `ads:context` IPC and neutralize client context (privacy) —
      the existing `wrapIpcMain` guard is now wired from the Electron bridge
      through `bootstrap.activate()` and re-armed on preset changes; active
      only with opt-in Ghost Mode aggressive/paranoid
      (`src/bootstrap.ts:161,207-222,232-255`).
      `tests/ghost-ipc-bootstrap.test.ts`. → Wave 73
- [x] Block `ad-context` reads at IPC boundary — same guard redacts
      configured signature/field payloads for both `on` and `handle`
      (`src/ghost/ipc-guard.ts:9-59`). → Wave 73
- [ ] Neutralize placement-alias resolution so retired IDs stay retired.
- [ ] Hook `window.fetch` / `XMLHttpRequest` in renderer as belt-and-suspenders.
- [ ] Hook `EventSource` in renderer.
- [ ] Disable ad-related feature flags in `localStorage`/`IndexedDB`.
- [ ] Spoof ad-density telemetry to zero.

## 5. Placement aliases & sponsored commands

- [ ] Resolve retired↔canonical placement IDs in client-side logic — no map
      exists yet; `PLACEMENT_IDS` is a flat canonical list
      (`src/types.ts:122-129`).
- [ ] Block sponsored-command refusals bypass (new v0.0.201 module).
- [ ] Track placement-alias usage in dashboard.
- [ ] Auto-update alias map from upstream bundle on each release.

## 6. Dashboard & observability

- [ ] Per-surface, per-stage time-series charts.
- [x] Top blocked endpoints list — the page client derives a top-six list from
      `snapshot.byEndpoint` (`src/stats-store.ts:48,67`) using `endpointLabel`
      and inert `textContent` rendering (`src/dashboard-client.ts:renderEndpoints`).
      Session-only data; no `AD_ENDPOINTS` or page-API change.
      `tests/dashboard-endpoints.test.ts`. → Wave 68
- [x] Block-rate sparkline — `renderSpark` uses the 30-minute `perMinute`
      series (`src/dashboard-client.ts:760-785`). Marked done (was stale `[ ]`).
- [x] Export block log (JSON/CSV) from dashboard — shadow-DOM
      `exportJson`/`exportCsv` buttons download `exportLog.json`/`.csv` byte-for-byte
      through browser-only Blob + object URL; `BlockLog.toJson()/toCsv()` remain
      the single serializer and the page API stays four-key
      (`tests/dashboard-export.test.ts`). → Wave 65
- [ ] Desktop notification on new ad surface detected.
- [ ] Local-only telemetry (opt-in) for aggregate effectiveness stats.
- [ ] Health panel: injection status, audit status, last update.
- [x] Keyboard shortcuts for toggle/pause: panel-only `Alt+Shift+D` toggle via
      the existing `setOpen()`, ignoring repeats and editable targets and
      detaching on unmount (`src/dashboard-client.ts:wire/unmount`). No pause,
      no new page API key. `tests/dashboard-client-shortcut.test.ts`. → Wave 70
- [x] OS `prefers-color-scheme: light` follow for token-driven panel chrome
      (`src/dashboard-client.ts` CSS media block). Canvas/inline literal colors
      stay dark by design (`docs/SHIELD.md:170-179`); no page-API change.
      `tests/dashboard-client-light-theme.test.ts`. → Wave 77
- [ ] Dark/light theme sync with Freebuff (in-app theme signal, not the OS
      preference) — still open; no theme data reaches the page.

## 7. Configuration & UX

- [x] Per-profile config (multiple Freebuff profiles) — `getConfigDir(profileId)`
      and `FREEBUFF_PROFILE` (`src/config.ts:119-128`); only profile rename/recreate
      events are still unwatched.
- [~] Import/export config — export-only `farbuff config-export --out FILE
      [--profile ID]` is implemented, omitting the signed-feed keys; import is
      deliberately rejected because it would let untrusted JSON replace the
      feed trust root (`scripts/launch-freebuff.sh:357-366`). → Wave 71
- [x] Preset profiles: strict / balanced / minimal — `configSchema.preset` and
      `PRESETS` applied in `loadConfig` (`src/config.ts:10,130-177`). In-app UI
      is still missing.
- [ ] First-run wizard.
- [ ] In-app settings panel (not just JSON).
- [x] Hot-reload all settings without restart — the watcher honors the active
      profile and ignores rename/recreate events (`src/config.ts:192-207`).
- [x] Remote block-list feed (signed; enabled by default with a kill switch).
- [x] Scheduled updates of block lists — daily `0 6 * * *` self-heal/feed jobs
      (`upstream-proof.yml:4-5,96-150`, `feed-publish.yml:5-6,35-58`). → Wave 67 truth pass

## 8. Testing & quality

- [x] Property-based tests for `stageForEndpoint` and `intercept`: seeded
      generator with 250 deterministic inputs plus per-endpoint normalization
      transforms, asserting totality, stage↔intercept agreement and no false
      positives (`tests/url-intercept-properties.test.ts`). → Wave 66
- [x] Fuzz tests for URL matching (unicode, encoding, malformed percent, query
      order, duplicate slashes) in the same seeded file. → Wave 66
- [ ] Snapshot tests for `HIDE_ALL_ADS_CSS`.
- [ ] Visual regression for dashboard (Playwright).
- [x] E2E against a real Freebuff instance in CI (headless): `scripts/e2e-headless.mjs`,
      `heal-proof.yml`, `release.yml`.
- [ ] Mutation testing (stryker) for interceptor.
- [x] Coverage ratchet: never drop below 85% — thresholds are pinned at 85 for
      lines/functions/branches/statements, and the suite holds 97.5/94.0/91.3/95.7.
      → Wave 59
- [ ] Contract tests for config schema migrations.
- [x] Golden-file tests for audit output — `tests/audit-golden.test.ts` pins the
      full `--json` summary for two fixtures, including the heal-consumed
      `freebuffVersion`, routes, DOM gaps and classifications. → Wave 79
- [x] Self-test the ledger gate with negative fixtures. → Wave 57

## 9. CI / automation / scale

- [x] Cron job: fetch latest Freebuff AppImage, run audit, open PR with deltas
      (`upstream-proof.yml:4-5,41-105`).
- [x] Release cut from a verified live receipt: `scripts/release-gate.mjs` dedupes on
      `(payloadVersion, artifactHash)`, `scripts/bump-version.mjs` writes every version
      surface atomically, `release-cut.yml` opens a reviewed bump PR, and
      `release-tag.yml` asserts the marker before pushing the tag. → Wave 61
- [x] Matrix testing across Node versions: the dev toolchain needs >=22.19 (Vitest resolves
      `undici` 8), so `ci.yml`'s `node-matrix` runs typecheck + tests on 22 and 24. The
      user-facing runtime floor stays >=20 and is exercised by `upstream-proof.yml`
      (build + audit + headless E2E). → Wave 60
- [x] Dependabot for all deps: npm only (`.github/dependabot.yml`); the `github-actions`
      ecosystem is now tracked too. → Wave 60
- [x] Signed releases (cosign) for the extension bundle: keyless signing of the tarball,
      with the signature and certificate attached to the GitHub release. → Wave 60
- [x] SBOM generation: `scripts/gen-sbom.mjs` emits an SPDX 2.3 document; `npm run sbom`.
      → Wave 60
- [x] Reproducible builds: the release tarball pins entry order, mtime and ownership and
      uses a timestamp-free gzip header (`release.yml`). → Wave 60
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
- [x] Troubleshooting guide with common failures — `docs/INSTALLATION.md:68-99`,
      `docs/SHIELD.md:220-237`, linked from `README.md:208`. → Wave 67 truth pass
- [x] Security policy (SECURITY.md).
- [x] Contributing guide with PR checklist — `CONTRIBUTING.md` now spells out
      the required boxes, including `npm run audit:deltas`. → Wave 67

## 12. Community & scale

- [x] Issue template for new ad surfaces: `.github/ISSUE_TEMPLATE/ad-surface.md` asks
      for payload version, surface kind, location, evidence and expected
      classification. → Wave 60
- [x] PRs gated on audit truth: `ci.yml`'s required `audit-delta-gate` reproduces
      every baseline classification, and the PR template now carries an audit
      checkbox (`scripts/docs-check.mjs` fails when it disappears). → Wave 67
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
- [x] `ci: SBOM in release` — `scripts/gen-sbom.mjs` writes an SPDX 2.3 document into the
      bundle and attaches it to the GitHub release.
- [x] `ci: cosign the release tarball` — keyless sign + verify steps in `release.yml`.
- [x] `ci: reproducible release tarball` — sorted entries, pinned mtime/owner, `gzip -n`.
- [x] `ci: dependabot for GitHub Actions` — `.github/dependabot.yml`.
- [x] `ci: Node 22/24 test matrix` — `node-matrix` job in `ci.yml`; Node 20 stays covered by `upstream-proof`.
- [x] `docs: ad-surface issue template` — `.github/ISSUE_TEMPLATE/ad-surface.md` asks for
      payload version, surface kind, location, evidence, and expected classification.
- [x] `ci: gate PRs on audit deltas` — `scripts/audit-delta-check.mjs` (+ `npm run audit:deltas`,
      `ci.yml`'s `audit-delta-gate` job) runs the shipped delta through `verifyDelta` and
      reproduces every baseline classification from `classifyRoute`, so a hand-edited
      `config/endpoint-baseline.json` or `config/generated-rules.json` fails CI.
- [x] `fix(launcher): sanitize Electron env vars` — `sanitize_env` in `scripts/launch-freebuff.sh`
      drops `ELECTRON_RUN_AS_NODE`/`ELECTRON_NO_ASAR`, runtime/log overrides, and
      `NODE_OPTIONS`/`NODE_PATH`/`LD_PRELOAD` before any helper or `exec`; the headless
      E2E launcher mirrors the same deny list, and `tests/launcher-env.test.ts` proves
      neither leaks.
- [x] `feat(bootstrap): confirm extension load on boot` — `activate()` writes
      `load-receipt.json` (status/pid/version/at) in the profile-aware config dir,
      `deactivate()` and a refused activation clear it, and `scripts/check-runtime-load.mjs`
      fails on a missing/stale/dead/corrupt receipt. The headless E2E asserts it and
      records `loadConfirmed`/`loaded`.
- [x] `fix(config): honor profile in the watcher` — `watchConfig` reloads `loadConfig(profileId)`
      (`src/config.ts:199`); `tests/config-profile-watch.test.ts`.
- [x] `build: harden the page-client sanitizer guard` — `scripts/page-client-guard.mjs`
      parses `dist/dashboard-client.js` with the TypeScript AST, removes only tsc's
      `Object.defineProperty(exports, "__esModule", ...)` marker (whole line when it
      stands alone), and rejects surviving `exports`/`module`/`require`/Node-global
      references, `globalThis.<forbidden>` access, dynamic `import()`, `import.meta`,
      and import/export declarations, while tolerating names the script binds itself.
      The smoke test drains microtasks with an `unhandledRejection` hook and an
      `importModuleDynamically` callback, so an async throw or dynamic import fails
      the build instead of escaping as an unhandled rejection;
      `finalize-dist.mjs` publishes `dist/package.json` only after validation and
      fails when tsc does not emit the client at all, and `npm run dist:test`
      enforces the built artifact in CI (`FAR_REQUIRE_DIST=1`).

### Wave 61 — Zero manual landing (policy-gated)
- [x] `ci: auto-merge the bot PR train` — policy decided, gate implemented and
      proven live: PR #238 (`ci/feed-publish`) landed via `--auto --merge` at
      2026-11-26T16:13:35Z (merge commit `5411bdc`) after a fresh approval and
      five green checks. Only same-repo
      `github-actions[bot]` PRs on `ci/feed-publish`, `ci/live-receipt`,
      `ci/proof-publish` or `ci/upstream-heal-*` carrying the `bot-train` label.
      `scripts/auto-merge-gate.mjs` requires the reviewer's latest substantive
      state to be an approval pinned to `commit_id` (else newer than the latest
      commit), so a later `CHANGES_REQUESTED` vetoes; it also requires the latest
      run of all five required checks to be SUCCESS on the current head SHA,
      clean or behind merge state, conventional subjects of at most 6 words
      authored by `10xdev4u-alt` (read from `commit.author.name`, as the REST
      API does), and no co-author trailer. `auto-merge-bot.yml` checks out
      `main` and enables `gh pr merge --auto --merge`; already-enabled PRs are
      re-evaluated and auto-merge is disabled again on a hold label or bad
      commit. Dependabot, human PRs and release-cut PRs are excluded. Bot PRs opened by `GITHUB_TOKEN` get
      `action_required` CI runs with zero jobs, so the runner dispatches
      `ci.yml` and `heal-proof.yml` (in `checks_only` mode, so no receipt PR is
      mutated) on the PR branch when checks are the only blocker. The four bot
      PR steps pin `author` to `10xdev4u-alt` to match the gate's identity
      rule. Existing bot PRs can be opted in with the `bot-train` label and a
      fresh approval; the gate revokes auto-merge on a hold label, stale
      approval or bad commit.
- [x] `ci: auto-cut a release from a verified live receipt` — policy decided:
      cut when the newest live-e2e receipt's `(payloadVersion, artifactHash)` differs
      from `release/last-cut.json`, MINOR on a payload change and PATCH otherwise; a
      newer timestamp alone never mints a version. `scripts/release-gate.mjs`
      re-verifies freshness (≤7d), pass, provenance, probes, and both hashes before
      computing a strictly increasing version, failing closed on stale, ambiguous,
      regressed or malformed input. `scripts/bump-version.mjs` validates every
      surface token before writing atomically to `package.json`, the README badge,
      the top CHANGELOG entry, all landing version/hash claims and the marker.
      `release-cut.yml` opens a reviewed `ci/release-vX.Y.Z` PR; `release-tag.yml`
      asserts the marker against the committed receipt and only then pushes the tag;
      the ledger checks marker ↔ package ↔ receipt freshness/probes/hashes/newest
      receipt. `release.yml`'s verify-artifact
      E2E now pins `FREEBUFF_PAYLOAD_VERSION`.

### Wave 62 — Network matching truth
- [x] `fix(match): collapse duplicate slashes on the path-only branch` —
      `matchRoute` lowercased and percent-decoded URLs but only `canonicalize`
      collapsed runs of `/`, so a production `/api//ad/break` bypassed blocking.
      `tests/url-match-canonicalization.test.ts` covers absolute and path-only
      URLs, query/case variants, pattern-side slashes and the already-passing
      guards. No endpoint or AD_ENDPOINTS change.
- [x] `fix(redirect): preserve ad flag across re-record` — a re-armed request
      event could overwrite an in-flight chain and clear a previously detected
      ad hop. `tests/redirect-chain-canonicalization.test.ts` covers re-record,
      duplicate-slash redirect hops and the clean-chain/completion guards.

### Wave 63 — Opt-in update blocking
- [x] `feat(config): opt-in blockUpdates` — `blockUpdates` is a Zod/default-false
      config field and an `ExtensionConfig` member; `DESKTOP_UPDATES_PATH` lives
      outside `AD_ENDPOINTS` and is evaluated as an origin-scoped path rule in
      `AdInterceptor`, including percent-encoded and query/subpath variants.
      `isAdUrl` reflects the toggle so redirect chains also cancel. Tests in
      `tests/block-updates.test.ts` cover defaults, disk load/save, runtime
      toggling, master switch, sibling-path safety and malformed URLs.

### Wave 64 — DOM resilience truth
- [x] `fix(dom): observe late and navigated same-origin iframes` — the generated
      remover now observes iframe documents during the recursive sweep and on a
      capture-phase document `load` handler, re-arms the guard version so an
      already-injected document picks up the change, and removes the listener on
      teardown. `tests/dom-remover-iframe.test.ts` asserts the emitted script.
- [x] `fix(dom): make teardown complete and sweeps hostile-DOM safe` — the
      generated script now uses named popstate/window-load handlers removed on
      teardown, cancels its pending animation frame, and guards recursive
      shadow-root enumeration. `tests/dom-remover-runtime.test.ts` executes the
      script under jsdom to prove no stale instance acts after teardown and a
      throwing shadowRoot query cannot abort removal.
- [x] Section 3 truth pass: MutationObserver removal, shadow piercing, SPA
      re-scan and dynamic-surface coverage were already implemented and are now
      marked done with file:line evidence. Theme-aware hiding and
      skeleton-flicker work remain open.
- [x] `feat(dom): scope hiding to enabled surfaces` — DOM-removal selectors are
      derived from `config.surfaces`, the injected script is re-armed through
      `WebContentsScriptTarget.replaceScript` plus a teardown post on config
      change, and CSS no longer uses the static all-surface fast path when a
      surface is disabled or the registry changed. `tests/per-surface-scoping.test.ts`.

### Wave 65 — Dashboard export truth
- [x] `feat(dashboard): export block log JSON/CSV from the in-app panel` —
      the page client renders `exportJson`/`exportCsv` buttons in its shadow DOM
      and downloads `farblock-*.json`/`.csv` byte-for-byte via browser-only
      `Blob` + object URL. `StatsSnapshot.exportLog` is produced in the main
      process from `BlockLog.toJson()/toCsv()` (capped at 200 recent entries),
      so CSV escaping is never reimplemented in the page. The API stays exactly
      `install`/`update`/`unmount`/`isOpen`, keeping the page-client guard and
      `FAR_REQUIRE_DIST=1` dist test green. `tests/dashboard-export.test.ts`.
- [x] Section 6/7 truth pass — marked the already-shipped sparkline, per-profile
      config and presets done with code evidence, corrected the hot-reload and
      feed-default wording, and removed the unsupported "placement alias map
      done" claim. No deprecated renderer hook was introduced.

### Wave 66 — Test quality
- [x] `test(url): seeded properties for matching, stages and interception` —
      a deterministic mulberry32 generator drives 250 mixed-case/unicode/
      percent-encoded/duplicate-slash inputs through `canonicalize`, `matchRoute`,
      `stageForEndpoint` and `AdInterceptor`, plus per-endpoint normalization
      transforms that pin stage↔intercept agreement. The added equivalence and
      invariance properties exposed two real bugs: an ad token inside a query
      value blocked a path-only control request (`src/url-match.ts:18-24`) and
      `stageForEndpoint` was not invariant under the normalization matching
      applies (`src/types.ts:36-46`); both are fixed. `tests/url-intercept-properties.test.ts`;
      no new dependency and no `AD_ENDPOINTS` change. Snapshot/mutation/visual-regression bullets stay
      open by design (redundant or would add heavy tooling).

### Wave 67 — Docs truth
- [x] `docs: gate human-facing claims against code` — `scripts/docs-check.mjs`
      exports a pure `checkDocs()` with injectable sources of truth and is wired
      into `docs:check` (already required by `release:check`). It fails on stale
      CONFIGURATION shield defaults, a stale ROADMAP Deprecated payload version,
      a missing PR-template audit checkbox and missing ARCHITECTURE surfaces.
      All five live drifts are corrected; `tests/docs-consistency.test.ts` self-tests
      each gate with negative fixtures.
- [x] Section 11 PR-template bullet is no longer `[~]`. The Deprecated section
      records its 0.0.201 verification as historical and names the current
      0.0.205 payload without claiming an unaudited re-verification. Scheduled
      block-list updates and the troubleshooting guide are marked done with
      code evidence; ARCHITECTURE CI-sync remains open (no full sync check).

### Wave 68 — Dashboard top endpoints
- [x] `feat(dashboard): rank top blocked endpoints` — the page client renders a
      top-six list from `snapshot.byEndpoint`, which already crosses the process
      boundary via `Dashboard.push()`. No main-process, IPC, page-API or
      `AD_ENDPOINTS` change; labels use the existing `endpointLabel()` and
      `textContent` so hostile endpoint strings stay inert. `tests/dashboard-endpoints.test.ts`
      covers empty state, zero filtering, descending order with stable ties,
      the cap, HTML-ish labels and re-binding across updates. Four phase agents
      independently confirmed this as the best value/risk ratio among the
      remaining open items.

### Wave 69 — Bot-train REST shape
- [x] `fix(ci): normalize REST PR shape before auto-merge gate` — the list
      endpoint returns `author: null` with `user.login`, so the runner's
      `isBotTrainPr` rejected every real bot PR; `mergeable_state` was also
      unresolved until the per-PR detail call. `scripts/auto-merge-shape.mjs`
      adapts that boundary without changing any gate predicate, and
      `tests/auto-merge-shape.test.ts` pins the live shape. A live runner probe
      now selects both `ci/feed-publish` and `ci/live-receipt` and reports only
      the genuine blockers (missing approval and required checks).
- [x] `ci: auto-merge the bot PR train` — live landing achieved: PR #238
      (`ci/feed-publish`) was approved on its final head, received all five
      required checks, and merged via `gh pr merge --auto --merge` at
      2026-11-26T16:13:35Z (commit `5411bdc`). Config import/export (trust-root
      risk), golden-file audit output, ARCHITECTURE full sync and desktop
      notifications were evaluated by the phase agents and deferred.

### Wave 70 — Dashboard shortcut
- [x] `feat(dashboard): toggle panel with Alt+Shift+D` — a document-level
      keydown handler in the page client calls the existing `setOpen()`; it
      ignores repeats, extra modifiers, non-matching keys and editable targets,
      and is detached on unmount and re-install. The four-key page API, dist
      guard and `AD_ENDPOINTS` are unchanged. `tests/dashboard-client-shortcut.test.ts`
      pins toggle behavior, ignored events, cleanup and guard safety.
- [x] `ci: auto-merge live proof` — PR #238 landed via the bot's
      `--auto --merge` after the branch was rewritten to a conventional
      `10xdev4u-alt` commit, re-approved on the final SHA, and all five checks
      went green. Wave 61's last policy-gated item is now closed.

### Wave 71 — Safe config export
- [x] `feat(cli): export effective config without feed keys` — `config-export
      --out FILE [--profile ID]` validates the profile, refuses to clobber the
      live config (direct or aliased path), serializes the resolved config with
      `feed.publicKey`/`feed.previousPublicKey` removed, and never imports or
      writes back. Unknown commands now return 2 while empty argv still shows
      help. `tests/cli-config-export.test.ts`; no `AD_ENDPOINTS`, page-API or
      launcher change.
- [x] Section 7 import/export bullet is `[~]`: export shipped, import rejected
      with code evidence (trust-root replacement). Health panel, theme sync,
      anti-detection rewrites, alias tracking and golden-file audit output were
      evaluated by five phase agents and deferred as non-atomic or redundant.

### Wave 72 — Network truth pass
- [x] `test(hook): prove transport-agnostic session blocking` — a new test file
      exercises the wildcard `onBeforeRequest` listener with EventSource-style
      GETs, beacon-style POSTs with the real method, `session-created` worker
      sessions, webview guest sessions with `did-finish-load` re-arm, and
      query/case/duplicate-slash variants on both the default session and a
      discovered partition. A config-aware fix makes `network.partitionPattern`
      come from the injected config instead of a fresh `loadConfig()`
      (`src/electron-hook.ts:108`). `tests/section2-network-truth.test.ts`.
- [x] Section 2 transport bullets are closed with code evidence; renderer
      monkey-patching and WebSocket interception remain intentionally out of
      scope (Deprecated section). Request-body blocking stays open.

### Wave 73 — Ghost IPC live
- [x] `feat(ghost): wire the IPC guard into Electron bootstrap` — the bridge
      now carries `ipcMain` when it has callable `on`/`handle`, `ElectronApi`
      accepts it, and `bootstrap.activate()` passes it to `GhostRuntime`.
      Deactivate uninstalls the guard and the config watcher re-arms it on
      preset changes. Behavior is opt-in: default Ghost Mode stays off and
      `standard` has no postMessage signatures.
      `tests/ghost-ipc-bootstrap.test.ts` covers scrubbing on `on`/`handle`,
      pass-through of unrelated payloads, disabled mode, uninstall and hot
      reload. No `AD_ENDPOINTS`, page-API or new bootstrap export.
- [ ] Phase E found a separate real gap for the next wave: `isAdUrl()` ignores
      `enabled`/`blockTracking`, so redirect chains can cancel requests that
      `intercept()` deliberately allows. OS-theme follow, request-body blocking
      and notifications remain deferred with code evidence.

### Wave 74 — Config gates across surfaces
- [x] `fix(interceptor): make isAdUrl honor config gates` — the predicate used
      by redirect-chain tracking and 3xx `Location` cancellation now mirrors
      `intercept()`: master `enabled` off → false, `blockTracking` off plus a
      tracking route → false. Hot-reload via `updateConfig()` takes effect
      immediately. `tests/is-ad-url-gate.test.ts` pins the gate matrix and the
      hook-level redirect cases; no `AD_ENDPOINTS` change.
- [x] Shadow `dryRun` gap (found in Wave 74, closed in Wave 76): `intercept()`
      returns `{blocked:false}` in dry-run, so `isAdUrl()` must agree to keep
      redirect chains and 3xx redirects from cancelling. `tests/is-ad-url-dry-run.test.ts`.

### Wave 76 — Dry-run gate parity
- [x] `fix(interceptor): make isAdUrl respect shadow dryRun` — the shared
      blocking predicate now mirrors `intercept()`'s dry-run short-circuit,
      so passive capture never cancels traffic it deliberately allows.
      `tests/is-ad-url-dry-run.test.ts` pins the gate matrix, live config
      toggle, redirect-chain and 3xx `Location` behavior, plus regression
      guards for normal capture. No `AD_ENDPOINTS`, page-API or launcher change.

### Wave 75 — Outbound config fidelity
- [x] `fix(config): keep outbound through loadConfig and export` — added the
      missing `outbound` Zod schema mirroring `ExtensionConfig`/`DEFAULT_CONFIG`,
      so `loadConfig()` no longer strips it and `config-export` includes it while
      still omitting the feed verification keys. `tests/config-outbound.test.ts`
      pins stored values, defaults, export content and invalid-value fallback.
      No `AD_ENDPOINTS`, page-API or launcher change.

### Wave 77 — OS light scheme
- [x] `feat(dashboard): follow OS prefers-color-scheme` — a CSS-only
      `@media (prefers-color-scheme: light)` block overrides the token-driven
      panel chrome (surfaces, lines, text, shadow); canvas and inline literal
      colors remain dark by design and are documented in `docs/SHIELD.md`.
      No `matchMedia`, markup, page-API or `AD_ENDPOINTS` change.
      `tests/dashboard-client-light-theme.test.ts` asserts the media block,
      token values, computed panel tokens, no `matchMedia` dependency, the
      four-key API and guard/smoke validity.

### Wave 78 — Coverage claim truth
- [x] `docs: gate the ROADMAP coverage claim against index pins` — `docs-check`
      now fails when section 8's quoted lines/branches disagree with the
      ledger-verified pins in `index.html`, and all four figures were corrected
      to the measured 97.5/94.0/91.3/95.7. `tests/docs-coverage-claim.test.ts`
      pins the invariant; no `AD_ENDPOINTS` or source change.

### Wave 79 — Audit JSON contract
- [x] `fix(audit): emit the payload version self-heal consumes` — the audit
      summary now includes `freebuffVersion` (payload `package.json`, `app.asar`
      or baseline fallback), closing the gap where `self-heal.mjs` read a field
      the audit never produced. `tests/audit-golden.test.ts` pins the full
      `--json` output for two fixtures plus the heal-consumed route/DOM fields.
      No `AD_ENDPOINTS`, page-API or launcher change.

### Wave 80 — Launcher config reads
- [x] `fix(cli): make launcher config reads work` — `config-get` now resolves
      dotted keys and accepts `--dir` as either the config file path the
      launcher passes or a directory; an explicit source is authoritative and
      never falls back to the ambient profile. The launcher now invokes
      `bin/farbuff.mjs`, the real CLI entry point, instead of `dist/cli.js`,
      which never self-executed. `tests/cli-config-get.test.ts` pins the
      launcher call shapes, legacy output and the entry point. No
      `AD_ENDPOINTS` or page-API change.

### Wave 81 — CLI entry point
- [x] `fix(cli): let the CLI entry point finish async work` — `bin/farbuff.mjs`
      now sets `process.exitCode` instead of calling `process.exit()` outright,
      so relay submissions can POST and trim their logs before Node tears down.
      It also resolves its path with `fileURLToPath`, so installs under a path
      containing spaces load `dist/cli.js` correctly. `tests/cli-entrypoint.test.ts`
      pins delivery, spaced paths and command exit codes. No `AD_ENDPOINTS`,
      page-API or launcher change.

### Wave 82 — Self-heal install paths
- [x] `fix(scripts): resolve self-heal paths as file URLs` — `scripts/self-heal.mjs`
      now derives its repo root with `fileURLToPath` and imports dist modules
      through `pathToFileURL`, so installs under paths containing spaces or a
      literal `%20` segment no longer fail with `ENOENT`/`ERR_MODULE_NOT_FOUND`.
      `tests/self-heal-path.test.ts` pins plain, spaced and encoded installs
      against a copied fixture tree. No `AD_ENDPOINTS`, page-API or launcher
      change.

### Wave 83 — AppImage self-execution guard
- [x] `fix(scripts): match CLI self-exec paths` —
      `scripts/fetch-latest-appimage.mjs` now uses an exported `isMain` helper
      built on `pathToFileURL(resolve(argv1))`, so the CLI actually runs when
      installed under a path with spaces or a literal `%20` segment; library
      imports still do not execute `main()`. `tests/fetch-latest-appimage-main-guard.test.ts`
      pins plain, spaced, encoded, other-runner and missing-argv paths plus
      import safety. The three workflows that invoke the CLI now pass
      `GITHUB_TOKEN`, since the repaired guard makes their previously-dead
      API calls live. No `AD_ENDPOINTS`, page-API or launcher change.

### Wave 84 — Tracking exception vs host rules
- [x] `fix(interceptor): host rules beat tracking` — with
      `blockTracking: false` (the `minimal` preset), tracking-shaped paths on
      configured or healed ad hosts are now blocked; the tracking exception
      still applies to unconfigured and first-party hosts. Both `intercept()`
      and `isAdUrl()` agree. `tests/tracking-host-rules.test.ts` pins configured,
      healed, unconfigured and first-party hosts. No `AD_ENDPOINTS` or page-API
      change.

### Wave 85 — Export reads the writer config dir
- [x] `fix(cli): export the active profile log` — `cmdExport` now builds
      its `block-log.jsonl` path with `getConfigDir()` (as the writer does),
      so profiles and the homedir fallback export the real entries instead of
      an empty list or a decoy. `tests/cli-export.test.ts` pins profile, HOME
      fallback and explicit-dir cases in JSON and CSV. No `AD_ENDPOINTS` or
      page-API change.

### Wave 86 — Release version claims
- [x] `fix(release): refresh every verified-against claim` —
      `scripts/bump-version.mjs` now updates the receipt panel's
      `✓ verified against Freebuff` line (both the `data-l` attribute and text)
      as well as the eyebrow and embedded metadata, so a payload bump can no
      longer ship a page claiming two versions. `tests/bump-version.test.ts`
      pins the changed-payload and unchanged-payload cases. No `AD_ENDPOINTS`,
      page-API or launcher change.

### Wave 87 — Ghost config toggles
- [x] `fix(ghost): re-arm IPC on config toggle` — `GhostRuntime` now stores
      the IPC binding even while disabled and re-wraps it whenever config
      enables Ghost Mode, so disable→re-enable and off-at-boot→enable both
      restore the guard instead of leaving it silently unwrapped until restart.
      `tests/ghost-extra.test.ts` pins both toggles. No `AD_ENDPOINTS` or
      page-API change.

---

## Milestones

- **M1 (v1.5.x):** Robustness + integrity (section 1). Target: 20 issues.
- **M2 (v1.6.x):** Coverage expansion network+DOM (sections 2-3). Target: 25 issues.
- **M3 (v1.7.x):** Script layer + placement aliases (sections 4-5). Target: 15 issues.
- **M4 (v1.8.x):** Dashboard v2 + config UX (sections 6-7). Target: 20 issues.
- **M5 (v1.9.x):** Testing & CI scale (sections 8-9). Target: 25 issues.
- **M6 (v2.0.x):** Anti-detection + privacy + docs (sections 10-12). Target: 20 issues.

Total tracked items: 100+. Each item = one issue/PR. Target: 1000+ commits over the program.

## Deprecated (verified against 0.0.201 bundle; current payload 0.0.205)
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
