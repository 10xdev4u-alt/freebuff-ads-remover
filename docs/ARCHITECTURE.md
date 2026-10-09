# Architecture

## Overview

Freebuff Ads Remover is a **pluggable Electron extension** that removes all ads from Freebuff Desktop by intercepting network requests at the session level and injecting CSS as a fallback.

## Design Principles

1. **Pluggable** — No app bundle modification. Loaded via `--require` flag.
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
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Extension loads via --require flag
2. Extension reads config from ~/.config/freebuff-ads-remover/config.json
3. Extension hooks into Electron session.webRequest.onBeforeRequest
4. For each request, extension checks URL against ad patterns
5. If ad request → cancel request (return empty)
6. If non-ad request → allow (pass through)
7. CSS fallback hides any ad containers that render before network block
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
