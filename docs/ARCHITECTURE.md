# Architecture

## Overview

Freebuff Ads Remover is a **pluggable Electron extension** that removes all ads from Freebuff Desktop by intercepting network requests at the session level and injecting CSS as a fallback.

## Design Principles

1. **Pluggable** — Loaded through a tiny injected loader in the app's main
   process entry. Electron provides no preload flag for packaged apps
   (`--require`, `NODE_OPTIONS` and `--app` are all ignored), so the launcher
   patches `resources/app.asar` into a `resources/app/` directory and prepends
   an idempotent `require()` block to `electron/main.cjs`. The original
   archive is kept as `app.asar.orig`, so the install can be restored at any
   time by moving it back.
2. **Non-destructive** — App functionality is never affected. Only ad requests are blocked.
3. **Configurable** — Every ad surface can be toggled individually.
4. **Safe** — Errors are caught and logged. The app never crashes due to the extension.
5. **Performant** — < 1ms overhead per request. < 10MB memory footprint.

## Components

```
┌─────────────────────────────────────────────────────┐
│                  Freebuff Desktop                   │
│                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐   │
│  │  Renderer   │───▶│  Orchestrator (Bun)       │   │
│  │  (React)    │    │  127.0.0.1:5174          │   │
│  └─────────────┘    └──────────────────────────┘   │
│         │                       │                   │
│         │              ┌────────▼────────┐          │
│         │              │  Ad API         │          │
│         │              │  /api/ad/*      │          │
│         │              └────────┬────────┘          │
│         │                       │                   │
│  ┌──────▼───────────────────────▼──────────────┐   │
│  │           Electron Session                  │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │  Ad Interceptor (webRequest)        │    │   │
│  │  │  Blocks: /api/ad/*, /api/ads/*      │    │   │
│  │  │  Blocks: /api/v1/ads/agentic/offer │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │  CSS Injector (fallback)            │    │   │
│  │  │  Hides: all ad containers           │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │  Shield Dashboard (page script)     │    │   │
│  │  │  StatsStore → 1s push → badge/panel │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### Updater survival

Freebuff's in-app updater restarts the app from a temp download, bypassing
the launcher (and the patch). The launcher self-heals on the next start:

```
1. Scan /tmp/.mount_* FUSE payloads behind running processes
2. Read each payload's name+version (scripts/payload-version.mjs)
3. If a Freebuff payload is newer than the extract → copy it over,
   stamp .adopted-version, drop .appimage-sha
4. While the AppImage on disk is older than the adopted stamp, launch
   from the adopted payload (re-patched); a newer AppImage file
   re-arms the normal extract flow
```

## Data Flow

```
1. Launcher extracts the AppImage and patches resources/app.asar:
   extracts it to resources/app/, prepends the loader to electron/main.cjs,
   and moves the original archive aside as app.asar.orig
2. Electron boots resources/app/ and the loader requires the extension
3. Extension reads config from ~/.config/freebuff-ads-remover/config.json
4. Extension hooks into Electron session.webRequest.onBeforeRequest
5. For each request, extension checks URL against ad patterns
6. If ad request → cancel request (return empty)
7. If non-ad request → allow (pass through)
8. CSS fallback (webContents.insertCSS) hides any ad containers
   that render before the network block
```

## Extension API

```typescript
// Activate the extension
activate(session?: Electron.Session): boolean

// Deactivate and clean up
deactivate(): void

// Get blocking statistics
getStats(): { requestCount: number; blockCount: number; patterns: number } | null
```

## Configuration

```json
{
  "enabled": true,
  "blockTracking": true,
  "cssFallback": true,
  "surfaces": {
    "sponsorBreak": true,
    "billboard": true,
    "intermission": true,
    "spotlight": true,
    "showcase": true,
    "sponsoredTask": true,
    "sponsoredRun": true,
    "partner": true,
    "invitation": true
  },
  "logLevel": "info",
  "logToFile": true
}
```

## File Structure

```
freebuff-ads-remover/
├── src/
│   ├── index.ts              # Entry point (activate/deactivate)
│   ├── interceptor.ts        # Network interception engine
│   ├── css-injector.ts       # CSS fallback injection
│   ├── electron-hook.ts      # Electron session integration
│   ├── config.ts             # Config loading/validation
│   ├── logger.ts             # Structured logging
│   ├── performance.ts        # Performance monitoring
│   ├── update-checker.ts     # GitHub releases update check
│   └── types.ts              # Type definitions + constants
├── scripts/
│   └── launch-freebuff.sh    # One-command launcher
├── tests/
│   ├── config.test.ts
│   ├── interceptor.test.ts
│   ├── css-injector.test.ts
│   ├── performance.test.ts
│   └── update-checker.test.ts
├── config/
│   └── default.json          # Default config
└── docs/
    ├── ARCHITECTURE.md       # This file
    └── RESEARCH.md           # Research findings
```
