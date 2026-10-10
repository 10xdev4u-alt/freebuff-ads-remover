#!/usr/bin/env bash
set -euo pipefail

EXTENSION_DIR="${FREEBUFF_ADS_REMOVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
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

extract_appimage() {
  local appimage="$1"
  local extract_dir="$2"

  if [[ -f "$extract_dir/AppRun" ]]; then
    echo "$extract_dir"
    return 0
  fi

  mkdir -p "$extract_dir"
  "$appimage" --appimage-extract >/dev/null 2>&1 || true

  local squashfs_root="$extract_dir/squashfs-root"
  if [[ -f "$squashfs_root/AppRun" ]]; then
    echo "$squashfs_root"
    return 0
  fi

  return 1
}

find_electron_binary() {
  local extract_dir="$1"

  local electron_bin
  electron_bin=$(find "$extract_dir" -maxdepth 1 -type f -executable -size +50M | head -1)

  if [[ -n "$electron_bin" ]]; then
    echo "$electron_bin"
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

  local extension_entry="$EXTENSION_DIR/dist/index.js"
  if [[ ! -f "$extension_entry" ]]; then
    echo "Extension not built. Run: npm install && npm run build" >&2
    exit 1
  fi

  echo "Freebuff Ads Remover"
  echo "Extension: $extension_entry"
  echo "Freebuff:  $app_path"
  echo ""

  if [[ "$app_path" == *.AppImage ]]; then
    local extract_dir="/tmp/freebuff-ads-remover-extract"
    local squashfs_root
    if ! squashfs_root=$(extract_appimage "$app_path" "$extract_dir"); then
      echo "Failed to extract AppImage" >&2
      exit 1
    fi

    local electron_bin
    if ! electron_bin=$(find_electron_binary "$squashfs_root"); then
      echo "Failed to find Electron binary in AppImage" >&2
      exit 1
    fi

    echo "Electron:  $electron_bin"
    echo ""

    exec "$electron_bin" \
      --require "$extension_entry" \
      --no-sandbox \
      "$@"
  else
    exec "$FREEBUFF_CMD" \
      --require "$extension_entry" \
      "$@"
  fi
}

main "$@"
