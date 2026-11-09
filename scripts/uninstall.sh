#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${FREEBUFF_INSTALL_ROOT:-$HOME/.local/share/freebuff-ads-remover}"

# Restore original asar if present
if [ -f "$INSTALL_ROOT/dist/app.asar.orig" ]; then
  echo "Restoring app.asar.orig (manual step required for the Freebuff AppImage)"
fi

rm -f "$HOME/.local/share/applications/freebuff-ads-remover.desktop"
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

if [ -d "$INSTALL_ROOT" ]; then
  echo "Removing $INSTALL_ROOT"
  rm -rf "$INSTALL_ROOT"
fi

echo "Uninstalled. Config left in ~/.config/freebuff-ads-remover (remove manually if desired)."
