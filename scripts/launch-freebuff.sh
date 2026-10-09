#!/usr/bin/env bash
set -euo pipefail

EXTENSION_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FREEBUFF_CMD="${FREEBUFF_CMD:-freebuff}"

find_appimage() {
  local paths=(
    "$HOME/.local/bin/freebuff-app"
    "$HOME/Applications/freebuff.AppImage"
    "/opt/freebuff/freebuff.AppImage"
    "/usr/local/bin/freebuff-app"
  )

  for path in "${paths[@]}"; do
    if [[ -f "$path" ]]; then
      echo "$path"
      return 0
    fi
  done

  if command -v freebuff &>/dev/null; then
    readlink -f "$(command -v freebuff)" || command -v freebuff
    return 0
  fi

  return 1
}

main() {
  local app_path
  if ! app_path=$(find_appimage); then
    echo "Freebuff Desktop not found. Install it first: https://freebuff.com/desktop" >&2
    exit 1
  fi

  echo "Freebuff Ads Remover"
  echo "Extension: $EXTENSION_DIR"
  echo "Freebuff:  $app_path"
  echo ""

  if [[ "$app_path" == *.AppImage ]]; then
    exec "$app_path" \
      --require "$EXTENSION_DIR/dist/index.js" \
      --no-sandbox \
      "$@"
  else
    exec "$FREEBUFF_CMD" \
      --require "$EXTENSION_DIR/dist/index.js" \
      "$@"
  fi
}

main "$@"
