# Freebuff Ads Remover — Master Plan

> **Mission:** Build a pluggable extension (or better, simpler, more efficient tool) that removes the ads shown inside the Freebuff Desktop app. The ads are annoying. We kill them. Cleanly.

---

## 1. Team & Identity

| Role | Identity |
|------|----------|
| Auth / Owner | `10xdev4u-alt` (GitHub) |
| Email | `10xdev4u@gmail.com` |
| Co-author (every commit) | `the-ai-developer` |
| Reviewer (every PR) | `the-ai-developer` |

### Git Config (local)
```bash
git config user.name "10xdev4u-alt"
git config user.email "10xdev4u@gmail.com"
```

### Co-author trailer (every commit)
```
Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>
```

---

## 2. Workflow — Agentic Git Issues-PR Driven Development

This is the **only** way work gets done. No exceptions. No direct pushes to main.

### The Loop (repeat forever)

```
research → evaluate → issues → validate idea → implement →
local validation → commit & push → PR → review (the-ai-developer) →
validate → merge (no squash) → cleanup branches → next issue
```

### Stage Gate Rules

1. **Research first** — Deep dive, understand the codebase, the ads flow, the architecture. Write findings.
2. **Raise issues** — Before a single commit, raise all issues (60-70+). Each issue = one atomic unit of work.
3. **Validate the idea** — For each issue, document the proposed solution approach in the issue body. Get clarity before code.
4. **Implement** — Follow TDD: write test first (RED), implement (GREEN), refactor (IMPROVE).
5. **Local validation** — Lint, typecheck, test. All green before commit.
6. **Commit** — Conventional commits, max 6 words in the subject line. Co-author trailer mandatory.
7. **Push & PR** — Push branch, open PR with comprehensive description.
8. **Review** — `the-ai-developer` reviews. Address all comments.
9. **Merge** — No squash merge. Merge commit preserves history.
10. **Cleanup** — Delete local branch, remote branch, stale branches. Repeat.

### Conventional Commit Format (strict)

```
<type>: <description>
```

- **type:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `style`
- **description:** max 6 words, imperative mood, no period at end
- **body:** what changed, why, research references
- **trailer:** `Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>`

### Examples
```
feat: add network interception layer

Implement Electron session webRequest interceptor that blocks
all ad-related API endpoints. Covers /api/ad/*, /api/ads/*,
and the remote agentic offer endpoint.

Research: REA analysis of orchestrator routes, ad-context.cjs
Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>
```

```
test: verify sponsor break never renders

Add integration test ensuring that when ad API returns null,
the SponsorBreak component is never mounted in the renderer.

Co-authored-by: the-ai-developer <88466089+the-ai-developer@users.noreply.github.com>
```

---

## 3. Research Findings — Freebuff Desktop Ads Architecture

### 3.1 App Structure

Freebuff Desktop is an **Electron app** with a **Bun orchestrator server**:

- **Electron main** (`electron/main.cjs`) — window management, IPC, session control
- **Bun orchestrator** (`resources/orchestrator/orchestrator.js`) — local HTTP server on `127.0.0.1:5174`, serves the renderer UI and all API endpoints
- **Renderer** (`resources/orchestrator/ui/assets/index-2i3uvof6.js`) — bundled React UI (3.3MB minified)
- **Preload** (`electron/preload.cjs`) — minimal IPC bridge

### 3.2 Ads Flow (end to end)

```
Renderer (React UI)
  → POST /api/ad/break {threadId, placementId}  (local orchestrator)
    → orchestrator.breakAd() → orchestrator.auction()
      → POST {FREEBUFF_WEB_HOST}/api/v1/ads/agentic/offer  (remote)
    ← {ad: {impUrl, heroImageUrl, advertiserName, ...}}
  ← Renderer stores in zustand: state.sponsorBreak
  → Renderer mounts ad component (SponsorBreak / Billboard / Intermission / Spotlight / Showcase)
```

### 3.3 Ad Placement IDs (surfaces)

| Placement ID | Surface | Component |
|---|---|---|
| `Desktop-Intermission` | Intermission between turns | `Intermission` |
| `Desktop-Inline-Chat` | Inline in chat | `SponsorBreak` (spotlight format) |
| `Desktop-Below-Chat` | Below chat slot | `SponsorBreak` |
| `Desktop-Showcase` | Showcase ads | `Showcase` |
| `Desktop-Billboard-Sidebar` | Sidebar billboard | `Billboard` |
| `Desktop-Billboard-Panel` | Panel billboard | `Billboard` |

### 3.4 Ad API Endpoints (orchestrator)

| Endpoint | Purpose |
|---|---|
| `POST /api/ad/policy` | Fetch ad policy (arms, placement IDs) |
| `POST /api/ad/break` | Fetch ad break (main ad fetch) |
| `POST /api/ad/break-event` | Report ad events (show, dismiss, click) |
| `POST /api/ad/billboard` | Fetch billboard ads |
| `POST /api/ad/intermission` | Fetch intermission ad |
| `POST /api/ad/impression` | Impression tracking |
| `POST /api/ad/click` | Click tracking |
| `POST /api/ad/click-return` | Click return tracking |
| `POST /api/ad/engagement` | Engagement tracking |
| `POST /api/ad/proposal` | Ad proposal |
| `POST /api/ad/proposal-prefs` | Proposal preferences |
| `POST /api/ad/partner` | Partner ads |
| `POST /api/ad/slot` | Slot ads |
| `POST /api/ad/invitation/*` | Ad invitations |

### 3.5 Key Source Files (from AppImage analysis)

| File | Role |
|---|---|
| `electron/ad-context.cjs` | Builds client context for ad requests (window state, editors, etc.) |
| `electron/preload.cjs` | Exposes `ads:context` IPC to renderer |
| `electron/main.cjs` | Handles `ads:context` IPC |
| `orchestrator.js` | Ad service: `breakAd()`, `auction()`, `policy()`, `billboardAd()`, `intermissionAd()`, `partnerAd()` |
| `ui/assets/index-2i3uvof6.js` | Renderer: zustand store (`sponsorBreak`, `adPolicy`, `intermission`), ad components |

### 3.6 Renderer State (zustand)

```js
{
  adPolicy: null,           // loaded via loadAdPolicy()
  sponsorBreak: null,       // active sponsor break ad
  sponsorBreakRequestedAt: null,
  intermission: null,       // active intermission ad
  intermissionLastShownAt: null,
}
```

### 3.7 Ad Components (renderer)

- `SponsorBreak` — full-screen break ad with dismiss lock
- `Billboard` — sidebar/panel billboard
- `Intermission` — between-turn intermission
- `Spotlight` — spotlight format ad
- `Showcase` — showcase ads
- `SponsoredTask` — sponsored task card
- `SponsoredRun` — sponsored run card

---

## 4. Solution Architecture — Pluggable Extension

### 4.1 Approach Options (evaluated)

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **A. Electron session interception** | Clean, no bundle patching, pluggable | Requires extension loading mechanism | ✅ **Primary** |
| **B. Bundle patching** | Direct, guaranteed | Fragile, breaks on update, not pluggable | ❌ |
| **C. CSS/DOM injection** | Simple | Doesn't stop network requests, ads still fetched | ⚠️ Fallback only |
| **D. Hosts-level blocking** | System-wide | Affects other apps, not pluggable | ❌ |
| **E. Proxy interception** | Powerful | Complex setup, not user-friendly | ❌ |

### 4.2 Chosen Architecture: **Electron Extension via Session Interception + CSS Fallback**

The extension is a **pluggable module** that hooks into the Electron session layer:

1. **Network Interception Layer** — Uses `session.webRequest.onBeforeRequest` to intercept all ad-related API requests and return empty/null responses. This stops ads at the source.
2. **CSS Fallback Layer** — Injects CSS into the renderer to hide any ad containers that might render before the network block takes effect.
3. **Config System** — JSON config to toggle individual ad surfaces on/off.

### 4.3 Extension Structure

```
freebuff-ads-remover/
├── src/
│   ├── index.ts              # Extension entry point
│   ├── interceptor.ts        # Network interception (session.webRequest)
│   ├── css-injector.ts       # CSS fallback injection
│   ├── config.ts             # Extension configuration
│   └── types.ts              # Type definitions
├── config/
│   └── default.json          # Default extension config
├── tests/
│   ├── interceptor.test.ts   # Interception logic tests
│   ├── css-injector.test.ts  # CSS injection tests
│   └── config.test.ts        # Config validation tests
├── package.json
├── tsconfig.json
└── README.md
```

### 4.4 Extension Loading Mechanism

The extension needs to be loaded into the Electron app. Options:

1. **Electron `--require` flag** — Load extension as a Node module before app ready
2. **Electron `--extension-path`** — Load as an unpacked extension
3. **Patch the asar** — Inject extension code into the app bundle (last resort)
4. **Separate launcher** — A wrapper script that launches the app with the extension

The cleanest approach: **Electron `--require` flag** via a custom launcher script, combined with **session-level interception** that works without modifying the app bundle.

---

## 5. Quality Standards

### 5.1 Potato Principles (from `potato` skill)
- Simple over complex
- Explicit over implicit
- Small functions, small files
- No clever code
- Tests for everything

### 5.2 Matt Pocock Principles (from `matt-pocock` skill)
- Types are documentation
- If it compiles, it works (mostly)
- Refactor mercilessly
- Delete code aggressively
- The best code is no code

### 5.3 Testing Requirements
- **Minimum 80% coverage**
- Unit tests for all logic
- Integration tests for interception
- E2E tests for the full flow

### 5.4 Code Style
- No comments unless absolutely necessary
- Self-documenting code
- Small functions (<50 lines)
- Small files (<800 lines)
- No deep nesting (>4 levels)

---

## 6. Deliverables

1. **Core extension** — Pluggable Electron extension that intercepts and blocks ad requests
2. **CSS fallback** — Hides ad containers as safety net
3. **Config system** — Toggle individual ad surfaces
4. **Launcher script** — Easy one-command launch with extension loaded
5. **Landing page** — Professional product page with "infinite creativity and unreal design"
6. **Documentation** — Comprehensive README, architecture docs, research findings
7. **Tests** — 80%+ coverage, unit + integration + E2E

---

## 7. Landing Page

A professional landing page with:
- Hero section with product value proposition
- Feature showcase (what ads are removed)
- Architecture diagram
- Installation instructions
- Research findings showcase
- Team section
- "Infinite creativity and unreal design" — push the limits

---

## 8. Work Stages

### Phase 0: Research & Planning ✅ (this phase)
- [x] Clone repos
- [x] Extract and analyze AppImage
- [x] Map ads architecture
- [x] Evaluate solution approaches
- [x] Create repo
- [x] Raise issues

### Phase 1: Foundation
- [ ] Project scaffolding (TypeScript, testing, linting)
- [ ] Extension config system
- [ ] Type definitions
- [ ] CI/CD pipeline

### Phase 2: Core Engine
- [ ] Network interception layer
- [ ] CSS fallback injection
- [ ] Extension loading mechanism
- [ ] Launcher script

### Phase 3: Ad Surface Coverage
- [ ] SponsorBreak blocking
- [ ] Billboard blocking
- [ ] Intermission blocking
- [ ] Spotlight blocking
- [ ] Showcase blocking
- [ ] Tracking endpoint blocking

### Phase 4: Testing & Quality
- [ ] Unit tests (80%+ coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance benchmarks

### Phase 5: Product
- [ ] Landing page
- [ ] Documentation
- [ ] Release pipeline

---

## 9. Issue Tracking

All work is tracked via GitHub issues. Each issue follows this format:

```markdown
## Title
[Conventional commit type]: [6-word description]

## Description
What needs to be done and why.

## Research
Links to research findings, code references, analysis.

## Approach
Proposed solution with technical details.

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Tests pass
- [ ] Lint passes
- [ ] Coverage >= 80%

## Labels
`research`, `implementation`, `testing`, `documentation`
```

---

## 10. Non-Negotiables

1. **No commits to main** — All work via PR
2. **No squash merge** — Merge commit preserves history
3. **Co-author on every commit** — `the-ai-developer`
4. **Reviewer on every PR** — `the-ai-developer`
5. **6-word conventional commits** — Strict format
6. **Research before code** — No code without research
7. **Test before implementation** — TDD mandatory
8. **80%+ coverage** — No exceptions
9. **Use /tmp for all scratch work** — Low internal disk space
10. **Professional quality** — Enterprise-grade output
