# Freebuff Ads Remover

**Pluggable extension to remove all ads from Freebuff Desktop.**

No config editing. No bundle patching. No app modification. Just one command.

## What It Does

Freebuff Desktop shows text ads to support free access to AI models. This extension removes them:

- SponsorBreak ads (full-screen breaks)
- Billboard ads (sidebar + panel)
- Intermission ads (between turns)
- Spotlight ads
- Showcase ads
- Sponsored task/run cards
- In-chat sponsored cards (`sponsored-ad` creatives)
- Partner ads
- Ad invitations
- All ad tracking/impression/click endpoints
- Plus a live **shield dashboard** in the app: blocks per funnel stage,
  top surfaces and latest stops (toggle with `"dashboard": false`)

## How It Works

The extension hooks into the Electron session layer and intercepts all ad-related network requests before they reach the server. A CSS fallback hides any ad containers that render before the network block takes effect.

```
Your App → Extension intercepts → Ad requests blocked → Clean UI
                    ↓
              Non-ad requests pass through normally
```

## Installation

### One-command launcher (recommended)

```bash
git clone https://github.com/10xdev4u-alt/freebuff-ads-remover.git
cd freebuff-ads-remover
npm install
npm run build
./scripts/launch-freebuff.sh
```

The launcher patches Freebuff's app payload (Electron ignores `--require` for
packaged apps), starts it with the extension loaded, and is safe to re-run.

It also survives Freebuff's in-app auto-updates: the updater restarts the
app from a temp download, bypassing the launcher — on the next start the
launcher adopts the newer live payload and re-patches it automatically, so
point your desktop icon at the launcher and forget about it.

### Verify it works

```bash
./scripts/launch-freebuff.sh --remote-debugging-port=9222
node scripts/verify-remover.mjs   # -> PASS — ad requests are blocked
```

## Configuration

Config file: `~/.config/freebuff-ads-remover/config.json`

```json
{
  "enabled": true,
  "blockTracking": true,
  "cssFallback": true,
  "dashboard": true,
  "surfaces": {
    "sponsorBreak": true,
    "billboard": true,
    "intermission": true,
    "spotlight": true,
    "showcase": true,
    "sponsoredTask": true,
    "sponsoredRun": true,
    "partner": true,
    "invitation": true,
    "sponsoredCard": true
  },
  "logLevel": "info",
  "logToFile": true
}
```

Toggle any surface by setting it to `false`. Changes hot-reload.

## Development

```bash
npm install
npm run build
npm test
npm run lint
npm run typecheck
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for component diagrams and data flow.

See [docs/RESEARCH.md](docs/RESEARCH.md) for the complete reverse-engineering research.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

---

**Team:** 10xdev4u-alt (owner) + the-ai-developer (co-author/reviewer)

**Repo:** https://github.com/10xdev4u-alt/freebuff-ads-remover
