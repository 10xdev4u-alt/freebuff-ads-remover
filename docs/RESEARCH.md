# Freebuff Desktop Ads — Research Findings

> Reverse-engineered from Freebuff Desktop AppImage v0.0.167 using REA (Reverse Engineer Anything) methodology.

## 1. App Architecture

Freebuff Desktop is an **Electron + Bun** application:

| Layer | Technology | Location |
|-------|-----------|----------|
| Main process | Electron (CJS) | `electron/main.cjs` |
| Orchestrator | Bun server (bundled) | `resources/orchestrator/orchestrator.js` (9.5MB) |
| Renderer | React (bundled) | `resources/orchestrator/ui/assets/index-2i3uvof6.js` (3.3MB) |
| Preload | Electron preload | `electron/preload.cjs` |

The renderer is served from the local Bun orchestrator at `http://127.0.0.1:5174`.

## 2. Ads Flow (End to End)

```
Renderer (React UI)
  → POST /api/ad/break {threadId, placementId}
    → orchestrator.breakAd()
      → orchestrator.auction()
        → POST {FREEBUFF_WEB_HOST}/api/v1/ads/agentic/offer
      ← {ads: [{impUrl, heroImageUrl, advertiserName, ...}]}
    ← {ad: {...}}
  ← Renderer stores in zustand: state.sponsorBreak
  → Renderer mounts ad component
```

## 3. Ad Placement IDs

| Placement ID | Surface | Component |
|---|---|---|
| `Desktop-Intermission` | Between turns | `Intermission` |
| `Desktop-Inline-Chat` | Inline in chat | `SponsorBreak` (spotlight) |
| `Desktop-Below-Chat` | Below chat | `SponsorBreak` |
| `Desktop-Showcase` | Showcase | `Showcase` |
| `Desktop-Billboard-Sidebar` | Sidebar | `Billboard` |
| `Desktop-Billboard-Panel` | Panel | `Billboard` |

## 4. Ad API Endpoints (Orchestrator)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ad/policy` | POST | Fetch ad policy (arms, placement IDs) |
| `/api/ad/break` | POST | Fetch ad break (main ad fetch) |
| `/api/ad/break-event` | POST | Report ad events |
| `/api/ad/billboard` | POST | Fetch billboard ads |
| `/api/ad/intermission` | POST | Fetch intermission ad |
| `/api/ad/impression` | POST | Impression tracking |
| `/api/ad/click` | POST | Click tracking |
| `/api/ad/click-return` | POST | Click return tracking |
| `/api/ad/engagement` | POST | Engagement tracking |
| `/api/ad/proposal` | POST | Ad proposal |
| `/api/ad/proposal-prefs` | POST | Proposal preferences |
| `/api/ad/partner` | POST | Partner ads |
| `/api/ad/slot` | POST | Slot ads |
| `/api/ad/invitation/click` | POST | Invitation click |
| `/api/ad/invitation/displayed` | POST | Invitation displayed |
| `/api/ad/invitation/recheck` | POST | Invitation recheck |
| `/api/ads` | GET | Ads root |
| `/api/ads/first-party/creative-image/` | GET | Creative images |
| `/api/v1/ads/agentic/offer` | POST | Remote auction (FREEBUFF_WEB_HOST) |

## 5. Renderer State (Zustand)

```typescript
{
  adPolicy: null,              // loaded via loadAdPolicy()
  sponsorBreak: null,          // active sponsor break ad
  sponsorBreakRequestedAt: null,
  intermission: null,          // active intermission ad
  intermissionLastShownAt: null,
}
```

## 6. Ad Components

| Component | References | Description |
|---|---|---|
| `SponsorBreak` | 6 | Full-screen break ad with dismiss lock |
| `Billboard` | 6 | Sidebar/panel billboard |
| `Intermission` | 10 | Between-turn intermission |
| `Spotlight` | 3 | Spotlight format ad |
| `Showcase` | 5 | Showcase ads |
| `SponsoredTask` | 2 | Sponsored task card |
| `SponsoredRun` | 2 | Sponsored run card |

## 7. Ad Context (Client-Side)

`electron/ad-context.cjs` builds `RawAdWindowContext` with:
- Window state: focused, maximized, fullscreen, widthDip, displays
- Power: onBattery, thermal, idleSeconds, locked
- Editors: vscode, cursor, zed detection
- System: scaleFactor, zoomPercent, gpu, launchAtLogin
- App: appUptimeSeconds, resumedSecondsAgo, channel, installMethod

## 8. Key Constants

```typescript
DESKTOP_INTERMISSION_PLACEMENT_ID = "Desktop-Intermission"
DESKTOP_INLINE_PLACEMENT_ID = "Desktop-Inline-Chat"
DESKTOP_BELOW_CHAT_PLACEMENT_ID = "Desktop-Below-Chat"
SHOWCASE_PLACEMENT_ID = "Desktop-Showcase"
BILLBOARD_SIDEBAR_PLACEMENT_ID = "Desktop-Billboard-Sidebar"
BILLBOARD_PANEL_PLACEMENT_ID = "Desktop-Billboard-Panel"
BILLBOARD_SHAPES = ["sidebar", "panel_tall", "panel_portrait", "panel_square", "panel_landscape"]
PARTNER_AD_TTL_MS = 1800000  // 30 min
AD_FETCH_TIMEOUT_MS = 10000  // 10 sec
SUPABASE_INVITATION_COOLDOWN_MS = 600000  // 10 min
GENERIC_INVITATION_COOLDOWN_MS = 1800000  // 30 min
```

## 9. Source File Index

| File | Role |
|---|---|
| `electron/ad-context.cjs` | Client context builder for ad requests |
| `electron/preload.cjs` | Exposes `ads:context` IPC |
| `electron/main.cjs` | Handles `ads:context` IPC |
| `orchestrator.js` | Ad service: breakAd, auction, policy, billboardAd, intermissionAd, partnerAd |
| `ui/assets/index-2i3uvof6.js` | Renderer: zustand store, ad components |

## 10. Blocking Strategy

The extension intercepts at the **Electron session level** using `session.webRequest.onBeforeRequest`:

1. **Network layer**: Block all `/api/ad/*`, `/api/ads/*`, and `/api/v1/ads/agentic/offer` requests
2. **CSS fallback**: Hide ad containers as safety net

## 11. Version Delta: 0.0.204 -> 0.0.205 (2026-11-23)

Verified by extracting both AppImages (`--appimage-extract`) and diffing the payload trees,
then confirming with `scripts/audit-endpoints.mjs`.

**Ad-surface verdict: no regression.** Both versions report 15/15 ad routes blocked, the same 15
ad candidates, 1/1 app ad selectors covered, and the same 50/57 CSS classes (the 7 unmatched
`.ad-cta*` / `.inline-link-ad*` classes are unchanged review items). `electron/ad-context.cjs`
is byte-identical, and the renderer's `ads:context` bridge is present and unchanged.

| Area | 0.0.204 | 0.0.205 |
|---|---|---|
| Resources tree | 233 files / 190 MB | 235 files / 311 MB |
| `orchestrator/orchestrator.js` | 10,911,110 B | 10,971,250 B |
| `app.asar` | 21,685,395 B | 21,754,119 B |
| Build identity | `commitSha`, `builtAt` | adds `apiOrigin=https://www.codebuff.com`, `webOrigin=https://freebuff.com` |

**Non-ad deltas that matter**

- Four new first-party routes, none ad-shaped: `/api/v1/generate-image`,
  `/api/diagnostics/error-screen`, `/api/desktop-notifications/stream`,
  `/api/desktop-notifications/read`.
- New Electron modules: `cloud-notifications.cjs` (localhost SSE notifications),
  `secret-service.cjs` (freedesktop keyring read for browser import),
  `build-backend.cjs` (staging-only host overrides).
- Removed notification IPC: `notify:needsYou`, `notify:openNeedsYou`, `window:requestAttention`,
  `window:clearAttention`. This was 0.0.204's sponsored-run "needs you" nag; its removal is
  the only ad-related change in the release.
- `resources/node/node` now ships a bundled Node runtime (126 MB), which is why the payload
  grew by ~120 MB.

**Audit blind spots (pre-existing, both versions).** Two paid-placement surfaces are invisible
to the heuristic audit and were left out of this adoption on purpose:

1. `/api/v1/gravity-index` is a recommendation endpoint whose response carries tracked
   advertiser links (`recommendation.click_url`), but its path has no ad token.
2. The orchestrator hardcodes destination URLs with `utm_medium=paid` / `bfcid={bfcid}`
   (e.g. `https://app.coderabbit.ai/?utm_source=freebuff&utm_medium=paid_display...`). The
   ad signals live entirely in the query string, which the audit strips before classification.

Both should be revisited as product decisions, not folded into a version bump.

**Adoption result.** `self-heal` against the 0.0.205 resources produced a passing heal gate
with a zero-rule delta (artifact hash unchanged), and the headless live E2E passed all 42
corpus probes. Corpus `golden.jsonl` stayed byte-identical; only the manifest version,
endpoint baseline, receipts, and landing claim moved to 0.0.205.
3. **Config-driven**: Toggle individual surfaces via JSON config
