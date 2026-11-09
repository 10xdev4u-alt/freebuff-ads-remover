#!/usr/bin/env bash
set -euo pipefail

INSTALL_ROOT="${FREEBUFF_INSTALL_ROOT:-$HOME/.local/share/freebuff-ads-remover}"
REPO_URL="${FREEBUFF_REPO_URL:-https://github.com/10xdev4u-alt/freebuff-ads-remover.git}"
REF="${FREEBUFF_REF:-$(git ls-remote --tags --sort=-v:refname "$REPO_URL" | head -1 | sed "s/.*refs\/tags\///;s/\^{}//")}"

echo "Installing freebuff-ads-remover into $INSTALL_ROOT"

if [ ! -d "$INSTALL_ROOT/.git" ]; then
  git clone "$REPO_URL" "$INSTALL_ROOT"
fi

cd "$INSTALL_ROOT"
git fetch --tags --force
git checkout "$REF"
if [ -z "$REF" ]; then echo "could not resolve ref"; exit 1; fi
git pull --ff-only || true

if [ ! -d node_modules ]; then
  npm ci
else
  npm install --prefer-offline
fi

npm run build

# Desktop entry
DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/freebuff-ads-remover.desktop" << DESK
[Desktop Entry]
Type=Application
Name=Freebuff Ads Remover
Comment=Remove ads from Freebuff
Exec=$INSTALL_ROOT/scripts/launch-freebuff.sh
Icon=$INSTALL_ROOT/icon.png
Terminal=false
Categories=Utility;
StartupWMClass=freebuff-ads-remover
DESK
update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo "Installed. Launch with: $INSTALL_ROOT/scripts/launch-freebuff.sh"
