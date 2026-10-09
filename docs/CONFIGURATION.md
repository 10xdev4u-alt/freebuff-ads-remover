# Configuration Guide

## Config File

Location: `~/.config/freebuff-ads-remover/config.json`

## Full Reference

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

## Options

### `enabled` (default: `true`)

Master toggle. When `false`, the extension does nothing.

### `blockTracking` (default: `true`)

When `true`, blocks all tracking endpoints (impression, click, engagement). Set to `false` to allow tracking (not recommended).

### `cssFallback` (default: `true`)

When `true`, injects CSS to hide ad containers as a safety net alongside network blocking.

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
