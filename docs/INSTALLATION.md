# Installation Guide

## Prerequisites

- Freebuff Desktop installed ([download](https://freebuff.com/desktop))
- Node.js 20+ (for building from source)
- Bash (for launcher script)

## Option 1: One-Command Launcher (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/10xdev4u-alt/freebuff-ads-remover/main/scripts/launch-freebuff.sh -o launch-freebuff.sh
chmod +x launch-freebuff.sh
./launch-freebuff.sh
```

The launcher auto-detects your Freebuff installation and starts it with the extension loaded.

## Option 2: Build from Source

```bash
git clone https://github.com/10xdev4u-alt/freebuff-ads-remover.git
cd freebuff-ads-remover
npm install
npm run build
```

Then launch Freebuff with the extension:

```bash
freebuff --require ./dist/index.js
```

## Option 3: AppImage Direct

```bash
/path/to/freebuff.AppImage --require /path/to/freebuff-ads-remover/dist/index.js --no-sandbox
```

## Verification

1. Launch Freebuff using one of the methods above
2. Open a chat thread
3. No ads should appear
4. Check logs: `cat ~/.config/freebuff-ads-remover/extension.log`

## Troubleshooting

### Extension not loading

- Ensure you're using `--require` (not `--require-module`)
- Check that `dist/index.js` exists (run `npm run build`)
- Check `~/.config/freebuff-ads-remover/extension.log` for errors

### Freebuff not found

- Set `FREEBUFF_CMD` environment variable: `export FREEBUFF_CMD=/path/to/freebuff`
- Or edit the launcher script to hardcode the path

### Ads still appearing

- Ensure config has `"enabled": true` in `~/.config/freebuff-ads-remover/config.json`
- Try toggling `"cssFallback": true`
- Restart the app after config changes

## Uninstall

```bash
rm -rf ~/.config/freebuff-ads-remover
rm dist/  # if built from source
```

Then launch Freebuff normally without `--require`.
