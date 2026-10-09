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
3. **Config-driven**: Toggle individual surfaces via JSON config
