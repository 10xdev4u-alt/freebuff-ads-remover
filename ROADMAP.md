# Roadmap — freebuff-ads-remover

Vision: a self-healing, auditable, multi-surface ad blocker for Freebuff Desktop that
survives near-daily upstream releases, never breaks the host app, and stays honest via
automated verification. Scaled for 100+ issues, 1000+ commits, 1000s of PRs.

Last updated: 2026-11-25 (Wave 64; Freebuff 0.0.205).

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
- [ ] Intercept SSE (EventSource) ad streams, not just fetch/XHR.
- [ ] Intercept WebSocket ad channels.
- [ ] Intercept `navigator.sendBeacon` ad calls (via preload patch).
- [ ] Block ad requests issued from service workers (session-level, already partial).
- [ ] Block ad requests from `webview` tags.
- [ ] Cover `persist:freebuff-hosted-v1-*` partitions fully (currently discovered lazily).
- [ ] Cover new partitions naming schemes without code changes (regex match).
- [ ] Handle ad requests with query-string variants (`?placement=...`).
- [ ] Handle ad requests with trailing slashes / case differences.
- [x] Normalize duplicate slashes in paths — `src/url-match.ts:5,9` for absolute
      URLs and `:20-22` for the path-only branch used in production. Regression
      tests in `tests/url-match-canonicalization.test.ts`. → Wave 59, verified Wave 62
- [x] Block by host in addition to path (allowlist of ad hosts). → Wave 59
- [ ] Block by request body content (sponsored task payloads).
- [x] Block redirect chains that land on ad endpoints — `createChainTracker`
      (`src/redirect-chain.ts:8-31`) preserves an ad flag across re-record, and
      `tests/redirect-chain-canonicalization.test.ts` covers re-arm duplicates
      and duplicate-slash ad hops. → Wave 59, hardened Wave 62
- [ ] Block prefetch/preload of ad assets.
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
      lines/functions/branches/statements, and the suite holds 97.1/93.8/91.3/95.4.
      → Wave 59
- [ ] Contract tests for config schema migrations.
- [ ] Golden-file tests for audit output.
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
- [ ] Troubleshooting guide with common failures.
- [x] Security policy (SECURITY.md).
- [ ] Contributing guide with PR checklist.

## 12. Community & scale

- [x] Issue template for new ad surfaces: `.github/ISSUE_TEMPLATE/ad-surface.md` asks
      for payload version, surface kind, location, evidence and expected
      classification. → Wave 60
- [~] PRs gated on audit truth: `ci.yml`'s required `audit-delta-gate` reproduces every
      baseline classification, but `.github/pull_request_template.md` still has no
      audit checkbox. → Wave 60
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
- [~] `ci: auto-merge the bot PR train` — policy decided and gate implemented,
      awaiting a real bot PR landing via `--auto --merge`. Only same-repo
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
      rule. Existing bot PRs need the `bot-train` label backfilled and a
      fresh approval; flip to `[x]` after a real auto-merge lands.
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
- [x] Section 3 truth pass: MutationObserver removal, shadow piercing, SPA
      re-scan and dynamic-surface coverage were already implemented and are now
      marked done with file:line evidence. Per-surface DOM scoping, theme-aware
      hiding and skeleton-flicker work remain open.

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
