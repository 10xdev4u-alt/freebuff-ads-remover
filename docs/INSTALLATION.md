# Installation Guide

## Prerequisites

- Freebuff Desktop installed ([download](https://freebuff.com/desktop))
- Node.js 20+ (build + app patching)
- Bash (for the launcher script)

## Option 1: Launcher (Recommended)

```bash
git clone https://github.com/10xdev4u-alt/freebuff-ads-remover.git
cd freebuff-ads-remover
npm install
npm run build
./scripts/launch-freebuff.sh
```

The launcher auto-detects your Freebuff installation, patches its app payload
(see [Architecture](ARCHITECTURE.md) — Electron ignores `--require` for
packaged apps), and starts the app with the extension loaded.

Re-running the launcher is safe: the patch is idempotent, and the AppImage is
re-extracted automatically when Freebuff updates.

Surviving auto-updates: Freebuff's in-app updater restarts the app straight
from its temp download, bypassing the launcher (no patch, no dashboard).
On the next launcher start it detects the newer live payload behind the
running processes, adopts it into the extract dir (stamped
`.adopted-version`), patches it, and launches it — just restart the app
from your icon after an update and the shield comes back by itself.

### Extra flags

Everything after the script name is passed to Freebuff.

Avoid `--remote-debugging-port`: Freebuff `>= 0.0.186` runs its own scoped CDP
bridge (loopback + per-boot token, deliberately not app-wide) and exits with
status 1 the moment the app-wide flag is present.

## Option 2: Manual launch

If Freebuff is already patched (any previous launcher run), you can start the
extracted binary directly:

```bash
FREEBUFF_ADS_REMOVER_ENTRY="$PWD/dist/index.js" \
  /tmp/freebuff-ads-remover-extract/squashfs-root/freebuff --no-sandbox
```

## Verification

1. Set `"logLevel": "debug"` in `~/.config/freebuff-ads-remover/config.json`
   (hot-reloads — no restart needed).
2. Launch Freebuff from your icon, then check the log:
   ```bash
   grep -E "Ad interceptor activated|Blocked ad request" \
     ~/.config/freebuff-ads-remover/extension.log | tail
   ```
   Expected: `Ad interceptor activated {"patterns":21,...}` and one
   `Blocked ad request:` line per cancelled ad call.
3. The shield badge (bottom-right) counts the same blocks live.

`scripts/verify-remover.mjs` drives the same checks over CDP and still works on
Freebuff `< 0.0.186`; newer builds refuse the app-wide
`--remote-debugging-port` flag, so use the log instead.

## Troubleshooting

### Extension not loading

- Check that `dist/index.js` exists (run `npm run build`)
- Check `~/.config/freebuff-ads-remover/extension.log` for errors
- Re-run the launcher — it re-applies the patch if Freebuff was updated
- If the loader reports a missing entry, make sure `FREEBUFF_ADS_REMOVER_ENTRY`
  points at your `dist/index.js` (the launcher sets it for you)

### Freebuff not found

- Set `FREEBUFF_CMD` environment variable: `export FREEBUFF_CMD=/path/to/freebuff`
- Or edit the launcher script to hardcode the path

### Ads still appearing

- Ensure config has `"enabled": true` in `~/.config/freebuff-ads-remover/config.json`
- Try toggling `"cssFallback": true`
- Restart the app after config changes
- Set `"logLevel": "debug"` and look for `Blocked ad request:` lines in the log

## Uninstall

```bash
# Restore the original app payload (keeps your Freebuff install intact)
mv /tmp/freebuff-ads-remover-extract/squashfs-root/resources/app.asar.orig \
   /tmp/freebuff-ads-remover-extract/squashfs-root/resources/app.asar

# Remove extension state
rm -rf ~/.config/freebuff-ads-remover
```

Non-AppImage installs: move `<resources>/app.asar.orig` back to
`<resources>/app.asar`.

Then launch Freebuff normally — the next AppImage update also discards the
patch automatically.
