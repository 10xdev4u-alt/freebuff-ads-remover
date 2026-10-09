# Demo

## Before (with ads)

```
┌─────────────────────────────────────────────┐
│  Freebuff Desktop                            │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │  SPONSOR BREAK                       │     │
│  │  "Try Claude Pro for just $20/mo"    │     │
│  │  [Dismiss in 5s]                     │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  ┌──────────┐  ┌──────────────────────┐     │
│  │ BILLBOARD│  │  Chat                 │     │
│  │          │  │                       │     │
│  │ "Ad"     │  │  User: ...            │     │
│  │          │  │  AI: ...              │     │
│  └──────────┘  └──────────────────────┘     │
└─────────────────────────────────────────────┘
```

## After (with Freebuff Ads Remover)

```
┌─────────────────────────────────────────────┐
│  Freebuff Desktop                            │
│                                              │
│  ┌─────────────────────────────────────┐     │
│  │  Chat                                │     │
│  │                                      │     │
│  │  User: Build me a React app          │     │
│  │  AI: I'll create a React app...      │     │
│  │                                      │     │
│  │  User: Add dark mode                 │     │
│  │  AI: Adding dark mode...             │     │
│  │                                      │     │
│  └─────────────────────────────────────┘     │
│                                              │
│  No ads. No tracking. Clean UI.              │
└─────────────────────────────────────────────┘
```

## What Gets Blocked

- SponsorBreak full-screen ads
- Sidebar/panel billboards
- Intermission ads between turns
- Spotlight format ads
- Showcase ads
- Sponsored task/run cards
- Partner ads
- Ad invitations
- All impression/click/engagement tracking

## Network View

```
Without extension:
  POST /api/ad/break → 200 (ad returned)
  POST /api/ad/impression → 200 (tracked)
  POST /api/ad/click → 200 (tracked)

With extension:
  POST /api/ad/break → BLOCKED (cancel)
  POST /api/ad/impression → BLOCKED (cancel)
  POST /api/ad/click → BLOCKED (cancel)
```
