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
- Partner ads
- Ad invitations
- All ad tracking/impression/click endpoints

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
curl -fsSL https://raw.githubusercontent.com/10xdev4u-alt/freebuff-ads-remover/main/scripts/launch-freebuff.sh -o launch-freebuff.sh
chmod +x launch-freebuff.sh
./launch-freebuff.sh
```

### Manual

```bash
# From this repo's root
freebuff --require ./dist/index.js
```

## Configuration

Config file: `~/.config/freebuff-ads-remover/config.json`

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
