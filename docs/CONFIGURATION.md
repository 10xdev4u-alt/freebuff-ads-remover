# Configuration Guide

## Config File

Location: `~/.config/freebuff-ads-remover/config.json`

## Full Reference

```json
{
  "enabled": true,
  "blockTracking": true,
  "blockUpdates": false,
  "adHosts": [],
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

## Options

### `enabled` (default: `true`)

Master toggle. When `false`, the extension does nothing.

### `blockTracking` (default: `true`)

When `true`, blocks tracking endpoints (impression, click, click-return,
engagement, report, break-event, invitation click/event, and their `/api/v1/ads`
equivalents). Set to `false` to let those through so the ad server still
sees analytics from an ad-free client — useful for comparing dashboards.
Ad delivery, policy, slot, creative and proposal routes stay blocked either
way.

### `blockUpdates` (default: `false`)

Opt-in block for Freebuff's own desktop update check
(`https://freebuff.com/api/desktop/updates`). Off by default: blocking updates
can strand the app on an old payload. When `true`, that path (including query
and subpath variants) is cancelled as an ad request; no other first-party
route is affected. This is a path rule because host-based rules deliberately
exempt first-party hosts, and presets never turn it on implicitly.

### `adHosts` (default: `[]`)

A list of hostnames blocked regardless of path, for ad assets whose URL is not
ad-shaped (an image or script on an ad CDN). Entries are hostnames
(`ads.example.com`) or origins (`https://ads.example.com/`); matching is
case-insensitive. First-party Freebuff hosts (`freebuff.com` and its subdomains,
`localhost`, `127.0.0.1`) are never blocked, even if listed.

The default is empty because Freebuff 0.0.204 serves every ad from first-party
hosts. `scripts/audit-endpoints.mjs` reports non-first-party hosts that serve
ad-shaped routes under `routes.hostCandidates`; the self-heal loop promotes one
into the shipped rule set (`config/generated-rules.json`) as a host rule, and
you can also list it here to block it immediately.

### `cssFallback` (default: `true`)

When `true`, injects CSS to hide ad containers as a safety net alongside network blocking.

### `dashboard` (default: `true`)

When `true`, mounts the in-app shield dashboard (badge + expandable panel with per-stage stats). Set to `false` to remove it — blocking keeps working.

### `surfaces`

Toggle individual ad surfaces:

| Surface | Description | Default |
|---|---|---|
| `sponsorBreak` | Full-screen break ads | `true` |
| `billboard` | Sidebar/panel billboards | `true` |
| `intermission` | Between-turn ads | `true` |
| `spotlight` | Spotlight format ads | `true` |
| `showcase` | Showcase ads | `true` |
| `sponsoredTask` | Sponsored task cards | `true` |
| `sponsoredRun` | Sponsored run cards | `true` |
| `partner` | Partner ads | `true` |
| `invitation` | Ad invitations | `true` |
| `sponsoredCard` | In-chat sponsored cards (`sponsored-ad` creatives) | `true` |

### `logLevel` (default: `info`)

Log verbosity: `debug`, `info`, `warn`, `error`

### `logToFile` (default: `true`)

When `true`, writes logs to `~/.config/freebuff-ads-remover/extension.log`.

## Hot Reload

Config changes are detected automatically. Edit the config file and save — no restart needed.

## Examples

### Block only billboard and intermission

```json
{
  "surfaces": {
    "sponsorBreak": false,
    "billboard": true,
    "intermission": true,
    "spotlight": false,
    "showcase": false,
    "sponsoredTask": false,
    "sponsoredRun": false,
    "partner": false,
    "invitation": false
  }
}
```

### Debug mode

```json
{
  "logLevel": "debug",
  "logToFile": true
}
```

### Disable CSS fallback

```json
{
  "cssFallback": false
}
```

## shield

- `autoHeal` (boolean, default false): allow the runtime to promote observed ad-shaped misses into the block list after the static and live gates pass.
- `promoteAfter` (number, default 5): number of launches an observed route must survive before promotion.
- `maxPromotedRules` (number, default 10): hard cap on promoted routes.
- `rollbackOnFailure` (boolean, default true): roll back a promoted rule when the live gate fails.
