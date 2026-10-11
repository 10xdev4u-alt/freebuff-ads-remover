<div align="center">
  <img src="assets/logo.svg" width="72" alt="Freebuff Shield logo">

  # Freebuff Ads Remover

  **Pluggable extension to remove all ads from Freebuff Desktop — with a live shield dashboard.**

  [![CI](https://github.com/10xdev4u-alt/freebuff-ads-remover/actions/workflows/ci.yml/badge.svg)](https://github.com/10xdev4u-alt/freebuff-ads-remover/actions)
  [![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
  [![Platform: Linux](https://img.shields.io/badge/platform-linux-lightgrey)](docs/INSTALLATION.md)
</div>

![Freebuff Shield dashboard](assets/shield-panel.png)

## What It Does

Freebuff Desktop shows ads to support free access to AI models. This extension removes them — network requests die at the Electron session layer, leftovers are hidden by CSS, and a **shield dashboard** in the app shows every stop per funnel stage:

| Surface | What disappears |
|---|---|
| SponsorBreak | Full-screen breaks |
| Billboard | Sidebar + panel units |
| Intermission | Between-turn ads |
| Spotlight / Showcase | Spotlight + showcase formats |
| Sponsored tasks / runs | Sponsored cards in timelines |
| In-chat sponsored cards | Server-rendered `sponsored-ad` creatives |
| Partner / Invitations | Partner ads, ad invites |
| Tracking | All impression / click / engagement endpoints |

## How It Works

```
Your App → Extension intercepts → Ad requests blocked → Clean UI
                    ↓
              Non-ad requests pass through normally
```

The extension hooks `session.webRequest.onBeforeRequest`, matches URLs against ad patterns, and cancels hits. A CSS fallback hides ad containers that render anyway. Block counts stream into the in-app dashboard once per second.

It also **survives Freebuff's in-app auto-updates**: the updater restarts the app from a temp download, bypassing the launcher — on the next start the launcher adopts the newer live payload and re-patches it automatically. Point your desktop icon at the launcher and forget about it.

## Requirements

- Linux with a Freebuff Desktop **AppImage** install
- Node.js ≥ 20 (only needed to run the patch step)
- 80%+ test coverage enforced in CI — see [Contributing](CONTRIBUTING.md)

## Quickstart

```bash
git clone https://github.com/10xdev4u-alt/freebuff-ads-remover.git
cd freebuff-ads-remover
npm install
npm run build
./scripts/launch-freebuff.sh
```

### Verify it works

```bash
./scripts/launch-freebuff.sh --remote-debugging-port=9222
node scripts/verify-remover.mjs   # -> PASS — ad requests are blocked
```

Then click the shield badge (bottom-right of the app) to open the dashboard.

## Configuration

Config file: `~/.config/freebuff-ads-remover/config.json` (hot-reloads)

```jsonc
{
  "enabled": true,       // master toggle
  "blockTracking": true, // impression / click / engagement endpoints
  "cssFallback": true,   // hide ad containers via CSS safety net
  "dashboard": true,     // in-app shield panel (badge + stats)
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
  "logLevel": "info",    // debug | info | warn | error
  "logToFile": true
}
```

Full option reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## FAQ

**Do I need to do anything when Freebuff updates?**
No. Restart the app from your icon — the launcher adopts the new payload and re-patches it by itself.

**The dashboard disappeared after an update — is it broken?**
Same cause, same fix: the updater relaunched Freebuff without the patch. One icon restart brings the shield back.

**How do I prove blocking is active?**
Run the verifier above (expects `PASS`), or set `"logLevel": "debug"` and watch `Blocked ad request:` lines in `~/.config/freebuff-ads-remover/extension.log`.

**How do I turn off just the dashboard?**
Set `"dashboard": false`. Blocking keeps working; the badge unmounts.

**Does it modify my Freebuff install?**
No. The AppImage file is never touched — the patch applies to an extracted copy under `/tmp`, with the original archive preserved as `app.asar.orig`. See [Uninstall](docs/INSTALLATION.md#uninstall).

**Does the extension phone home?**
No. It makes zero network calls of its own — local filtering, CSS hiding, file logging. See [SECURITY.md](SECURITY.md).

**Which Freebuff versions work?**
AppImage builds. Verified live on `0.0.169` and `0.0.170`; the launcher re-patches each new payload automatically.

## Docs

| Guide | Contents |
|---|---|
| [Installation](docs/INSTALLATION.md) | Launcher, manual launch, verification, troubleshooting, uninstall |
| [Configuration](docs/CONFIGURATION.md) | Every config key, per-surface table |
| [Architecture](docs/ARCHITECTURE.md) | Components, data flow, updater survival |
| [Research](docs/RESEARCH.md) | Reverse-engineering notes |
| [Changelog](CHANGELOG.md) | Release history (current: `1.2.0`) |
| [Security](SECURITY.md) | Supported versions, private reporting |

## Development

```bash
npm install
npm run build
npm test            # vitest, 154 tests
npm run lint
npm run typecheck
npm run test:coverage  # 80% threshold enforced
```

Work follows the agentic loop in [CONTRIBUTING.md](CONTRIBUTING.md): research → issues → validate → implement → test → commit → PR → review → merge → cleanup.

## License

MIT — see [LICENSE](LICENSE).

---

**Team:** 10xdev4u-alt (owner) + the-ai-developer (co-author/reviewer)

**Repo:** https://github.com/10xdev4u-alt/freebuff-ads-remover &nbsp;·&nbsp; **Site:** https://10xdev4u-alt.github.io/freebuff-ads-remover/
