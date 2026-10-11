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

### Extra flags

Everything after the script name is passed to Freebuff, e.g. the runtime
verifier below needs the DevTools endpoint:

```bash
./scripts/launch-freebuff.sh --remote-debugging-port=9222
```

## Option 2: Manual launch

If Freebuff is already patched (any previous launcher run), you can start the
extracted binary directly:

```bash
FREEBUFF_ADS_REMOVER_ENTRY="$PWD/dist/index.js" \
  /tmp/freebuff-ads-remover-extract/squashfs-root/@codebufffreebuff-desktop \
  --no-sandbox
```

## Verification

1. Launch Freebuff with the DevTools endpoint open:
   ```bash
   ./scripts/launch-freebuff.sh --remote-debugging-port=9222
   ```
2. In another terminal, run the end-to-end probe:
   ```bash
   node scripts/verify-remover.mjs
   ```
   Expected output: `[verify] PASS — ad requests are blocked, the app still works`
3. Check the log: `cat ~/.config/freebuff-ads-remover/extension.log`
   — you should see `Electron session hook activated` and, with
   `"logLevel": "debug"`, one `Blocked ad request:` line per ad call.

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
- Run `node scripts/verify-remover.mjs` to confirm the block is active

## Uninstall

```bash
# Restore the original app payload (keeps your Freebuff install intact)
mv /tmp/freebuff-ads-remover-extract/squashfs-root/resources/app.asar.orig \
   /tmp/freebuff-ads-remover-extract/squashfs-root/resources/app.asar
rm -rf /tmp/freebuff-ads-remover-extract/squashfs-root/resources/app

# Remove extension state
rm -rf ~/.config/freebuff-ads-remover
```

Non-AppImage installs: move `<resources>/app.asar.orig` back to
`<resources>/app.asar` and delete `<resources>/app`.

Then launch Freebuff normally — the next AppImage update also discards the
patch automatically.
