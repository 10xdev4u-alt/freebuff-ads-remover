#!/usr/bin/env bash
set -euo pipefail

EXTENSION_DIR="${FREEBUFF_ADS_REMOVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
FREEBUFF_CMD="${FREEBUFF_CMD:-freebuff}"
EXTRACT_ROOT="${FREEBUFF_EXTRACT_DIR:-/tmp/freebuff-ads-remover-extract}"

is_appimage() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  local magic
  magic=$(xxd -l 4 -p "$file" 2>/dev/null || od -A n -t x1 -N 4 "$file" 2>/dev/null | tr -d ' ')
  [[ "$magic" == "7f454c46" ]]
}

find_appimage() {
  local paths=(
    "$HOME/.local/bin/freebuff-app"
    "$HOME/Applications/freebuff.AppImage"
    "/opt/freebuff/freebuff.AppImage"
    "/usr/local/bin/freebuff-app"
  )

  for path in "${paths[@]}"; do
    if is_appimage "$path"; then
      echo "$path"
      return 0
    fi
  done

  if command -v "$FREEBUFF_CMD" &>/dev/null; then
    local resolved
    resolved=$(readlink -f "$(command -v "$FREEBUFF_CMD")" 2>/dev/null || command -v "$FREEBUFF_CMD")
    if is_appimage "$resolved"; then
      echo "$resolved"
      return 0
    fi
    echo "$resolved"
    return 0
  fi

  return 1
}

# Extracts the AppImage (re-extracting when it changed, so app updates get a
# fresh app.asar for the patch step to inject into).
extract_appimage() {
  local appimage="$1"
  local extract_dir="$2"
  local squashfs_root="$extract_dir/squashfs-root"
  local stamp="$extract_dir/.appimage-sha"

  local sum
  sum=$(sha256sum "$appimage" | awk '{print $1}')

  if [[ -f "$squashfs_root/AppRun" && -f "$stamp" && "$(cat "$stamp")" == "$sum" ]]; then
    echo "$squashfs_root"
    return 0
  fi

  rm -rf "$extract_dir"
  mkdir -p "$extract_dir"

  local prev_dir
  prev_dir=$(pwd)
  cd "$extract_dir"
  "$appimage" --appimage-extract >/dev/null 2>&1 || true
  cd "$prev_dir"

  if [[ ! -f "$squashfs_root/AppRun" ]]; then
    return 1
  fi

  echo "$sum" >"$stamp"
  echo "$squashfs_root"
}

find_electron_binary() {
  local extract_dir="$1"

  local electron_bin
  electron_bin=$(find "$extract_dir" -maxdepth 1 -type f -executable -size +50M 2>/dev/null | head -1)

  if [[ -n "$electron_bin" ]]; then
    echo "$electron_bin"
    return 0
  fi

  return 1
}

# Prints "<name> <version>" for a payload resources dir, or nothing.
payload_version() {
  "$NODE_BIN" "$EXTENSION_DIR/scripts/payload-version.mjs" "$1" 2>/dev/null || true
}

# 0 when $1 is a strictly newer version than $2.
is_newer_version() {
  [[ -n "${1:-}" && -n "${2:-}" && "$1" != "$2" ]] || return 1
  [[ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" == "$1" ]]
}

# Prints FUSE mount roots that back currently running AppImage payloads.
find_live_payloads() {
  local exe target root
  for exe in /proc/[0-9]*/exe; do
    target=$(readlink "$exe" 2>/dev/null || true)
    case "$target" in
      /tmp/.mount_*/*)
        root=$(dirname "$target")
        if [[ -d "$root/resources" ]]; then
          echo "$root"
        fi
        ;;
    esac
  done | sort -u
}

# The in-app updater restarts Freebuff straight from its temp download,
# bypassing this launcher — leaving the AppImage on disk (and our extract)
# a version behind. When a running Freebuff payload is newer than the
# extract, copy it over and use it from now on.
adopt_live_payload() {
  local extract_dir="$1"
  local squashfs_root="$extract_dir/squashfs-root"

  # Fast path: no live AppImage mounts, nothing to adopt.
  if ! compgen -G "/tmp/.mount_*" >/dev/null; then
    return 1
  fi

  local current_ver=""
  if [[ -d "$squashfs_root/resources" ]]; then
    current_ver=$(payload_version "$squashfs_root/resources" | awk '{print $2}')
  fi

  local mount_roots
  mapfile -t mount_roots < <(find_live_payloads)
  local mount_root mount_info mount_name mount_ver
  for mount_root in ${mount_roots[@]+"${mount_roots[@]}"}; do
    mount_info=$(payload_version "$mount_root/resources")
    mount_name=$(awk '{print $1}' <<<"$mount_info")
    mount_ver=$(awk '{print $2}' <<<"$mount_info")
    case "$mount_name" in
      *[Ff]reebuff*) ;;
      *) continue ;;
    esac
    if [[ -z "$current_ver" ]] || is_newer_version "$mount_ver" "$current_ver"; then
      echo "Adopting running Freebuff $mount_ver payload (updater bypassed the launcher)"
      local stage_dir="$extract_dir.adopt-tmp"
      rm -rf "$stage_dir"
      mkdir -p "$stage_dir"
      if ! cp -a "$mount_root/." "$stage_dir/squashfs-root/"; then
        echo "Payload copy failed; keeping existing install." >&2
        rm -rf "$stage_dir"
        return 1
      fi
      echo "$mount_ver" >"$stage_dir/.adopted-version"
      rm -rf "$extract_dir"
      mv "$stage_dir" "$extract_dir"
      return 0
    fi
  done
  return 1
}

patch_resources() {
  local resources_dir="$1"

  if [[ ! -f "$resources_dir/app.asar" && ! -f "$resources_dir/app.asar.orig" ]]; then
    echo "No app.asar found in $resources_dir — cannot install the ads remover into this build." >&2
    return 1
  fi

  echo "Patching:  $resources_dir"
  if ! FREEBUFF_ADS_REMOVER_ENTRY="$EXTENSION_ENTRY" \
    "$NODE_BIN" "$EXTENSION_DIR/scripts/patch-freebuff-app.mjs" "$resources_dir"; then
    echo "Patching failed. Launching unpatched (fail-open)." >&2
    return 1
  fi
}

main() {
  # Freebuff's Electron main process (and its bun orchestrator child) write to
  # stdout/stderr. When launched from a .desktop entry (Terminal=false) those
  # descriptors can end up on a pipe whose read end closes, producing an
  # uncaught "write EPIPE" that Electron surfaces as a "JS Uncaught Exception"
  # dialog. Keep a writable sink so writes never fail.
  FREEBUFF_LOG="${FREEBUFF_LOG:-$HOME/.config/freebuff-desktop/launch.log}"
  mkdir -p "$(dirname "$FREEBUFF_LOG")"
  : >>"$FREEBUFF_LOG"

  # --repair: force a clean re-extract + re-patch (use after a bad update).
  local repair=0
  if [[ "${1:-}" == "--repair" ]]; then
    repair=1
    shift
  fi
  if (( repair )) && [[ -d "$EXTRACT_ROOT" ]]; then
    echo "Repair mode: clearing extract dir $EXTRACT_ROOT" >&2
    rm -rf "$EXTRACT_ROOT"
  fi

  local app_path
  if ! app_path=$(find_appimage); then
    echo "Freebuff Desktop not found. Install it first: https://freebuff.com/desktop" >&2
    exit 1
  fi

  EXTENSION_ENTRY="$EXTENSION_DIR/dist/bootstrap.js"
  if [[ ! -f "$EXTENSION_ENTRY" ]]; then
    echo "Extension not built. Run: npm install && npm run build" >&2
    exit 1
  fi

  # Prefer a working node binary: GUI sessions often expose a broken
  # wrapper (e.g. DeepSeek harness) ahead of the real runtime.
  NODE_BIN=""
  for candidate in \
    /usr/bin/node \
    /usr/local/bin/node \
    "$HOME/.local/share/mise/shims/node" \
    "$HOME/.nvm/versions/node"/*/bin/node \
    "$(command -v node 2>/dev/null || true)"; do
    [[ -x "$candidate" ]] || continue
    if "$candidate" --version >/dev/null 2>&1; then
      NODE_BIN="$candidate"
      break
    fi
  done
  if [[ -z "$NODE_BIN" ]]; then
    echo "node is required to patch the app. Install Node.js >= 20 first." >&2
    exit 1
  fi

  echo "Freebuff Ads Remover"
  echo "Extension: $EXTENSION_ENTRY"
  echo "Freebuff:  $app_path"
  echo ""

  # Self-heal after in-place updater restarts (see adopt_live_payload).
  adopt_live_payload "$EXTRACT_ROOT" || true

  # Electron ignores --require / NODE_OPTIONS for packaged apps; the extension
  # is loaded by patching the app payload (see scripts/patch-freebuff-app.mjs).
  # ELECTRON_RUN_AS_NODE would turn the app into a plain Node process — drop it.
  unset ELECTRON_RUN_AS_NODE || true
  export FREEBUFF_ADS_REMOVER_ENTRY="$EXTENSION_ENTRY"

  if is_appimage "$app_path"; then
    local squashfs_root
    if [[ -f "$EXTRACT_ROOT/.adopted-version" && "$app_path" -ot "$EXTRACT_ROOT/.adopted-version" && -f "$EXTRACT_ROOT/squashfs-root/AppRun" ]]; then
      echo "Using adopted Freebuff $(cat "$EXTRACT_ROOT/.adopted-version") payload (AppImage on disk is older)"
      squashfs_root="$EXTRACT_ROOT/squashfs-root"
    else
      rm -f "$EXTRACT_ROOT/.adopted-version"
      if ! squashfs_root=$(extract_appimage "$app_path" "$EXTRACT_ROOT"); then
        echo "Failed to extract AppImage" >&2
        exit 1
      fi
    fi

    local electron_bin
    if ! electron_bin=$(find_electron_binary "$squashfs_root"); then
      echo "Failed to find Electron binary in AppImage" >&2
      exit 1
    fi

    # Feed sync (opt-in): fetch + verify + materialize a signed heal manifest.
    # Fail-open: any failure leaves the existing rules in place.
    FEED_ENABLED="$("$NODE_BIN" -e "try{const c=require(process.argv[1]);console.log(c.feed&&c.feed.enabled?'true':'false')}catch{console.log('false')}" "$EXTENSION_DIR/../config/config.json" 2>/dev/null || echo false)"
    # config lives in user config dir, not extension dir; check there too
    USER_CONFIG="${FREEBUFF_CONFIG_DIR:-$HOME/.config/freebuff-ads-remover}/config.json"
    FEED_ENABLED="$("$NODE_BIN" -e "try{const c=require(process.argv[1]);console.log(c.feed&&c.feed.enabled?'true':'false')}catch{console.log('false')}" "$USER_CONFIG" 2>/dev/null || echo "$FEED_ENABLED")"
    if [[ "$FEED_ENABLED" == "true" && -n "${FREEBUFF_FEED_URL:-}" ]]; then
      FEED_PUBLIC_KEY="${FREEBUFF_FEED_PUBLIC_KEY:-}" "$NODE_BIN" "$EXTENSION_DIR/scripts/feed-sync.mjs" --manifest "$FREEBUFF_FEED_URL" --config-dir "${FREEBUFF_CONFIG_DIR:-$HOME/.config/freebuff-ads-remover}" || echo "Feed sync failed; continuing with existing rules." >&2
    fi

    # Inbound relay (opt-in): submit redacted miss envelopes. Fail-open.
    INBOUND_ENABLED="$("$NODE_BIN" -e "try{const c=require(process.argv[1]);console.log(c.inbound&&c.inbound.enabled?'true':'false')}catch{console.log('false')}" "$USER_CONFIG" 2>/dev/null || echo false)"
    if [[ "$INBOUND_ENABLED" == "true" && -n "${FREEBUFF_INBOUND_URL:-}" ]]; then
      "$NODE_BIN" "$EXTENSION_DIR/dist/cli.js" submit-misses --url "$FREEBUFF_INBOUND_URL" >/dev/null 2>&1 || echo "Inbound submit failed; continuing." >&2
    fi

    patch_resources "$squashfs_root/resources"

    # Integrity check: confirm the loader marker survived into the repacked asar.
    # If an updater or a partial write stripped it, re-patch (idempotent).
    if ! "$NODE_BIN" "$EXTENSION_DIR/scripts/check-injection.mjs" "$squashfs_root/resources/app.asar" 2>/dev/null; then
      echo "Injection marker missing after patch — re-patching..." >&2
      patch_resources "$squashfs_root/resources" || echo "Re-patch failed; launching unpatched (fail-open)." >&2
    fi

    # Audit at patch time: catch new ad surfaces before launch.
    if [[ -x "$NODE_BIN" && -f "$EXTENSION_DIR/scripts/audit-endpoints.mjs" ]]; then
      if ! "$NODE_BIN" "$EXTENSION_DIR/scripts/audit-endpoints.mjs" "$squashfs_root/resources" >>"$FREEBUFF_LOG" 2>&1; then
        echo "WARNING: audit found gaps in the patched payload — see $FREEBUFF_LOG" >&2
      fi
    fi

    echo "Electron:  $electron_bin"
    echo ""

    exec "$electron_bin" --no-sandbox "$@" >>"$FREEBUFF_LOG" 2>&1
  fi

  # Non-AppImage install: look for the app payload next to the binary.
  local resolved
  resolved=$(readlink -f "$(command -v "$FREEBUFF_CMD")" 2>/dev/null || command -v "$FREEBUFF_CMD")
  local resources_dir
  for candidate in \
    "$(dirname "$resolved")/resources" \
    "$(dirname "$resolved")/../resources" \
    "$(dirname "$resolved")/../lib/freebuff/resources" \
    "$(dirname "$resolved")/../lib/freebuff-desktop/resources"; do
    if [[ -f "$candidate/app.asar" || -f "$candidate/app.asar.orig" ]]; then
      resources_dir="$candidate"
      break
    fi
  done

  if [[ -z "${resources_dir:-}" ]]; then
    echo "Could not locate Freebuff's app.asar next to $resolved." >&2
    echo "Ads removal needs the AppImage build, or an install where the app payload is writable." >&2
    exit 1
  fi

  patch_resources "$resources_dir"
  exec "$FREEBUFF_CMD" "$@" >>"$FREEBUFF_LOG" 2>&1
}

main "$@"
