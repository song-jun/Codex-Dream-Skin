#!/bin/bash
set -Eeuo pipefail

ACTION="${1:-}"
THEME_ID="${2:-}"
HERE="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$HERE/../../../macos" 2>/dev/null && pwd -P)"
if [ -d "$HERE/../macos/scripts" ]; then ROOT="$(cd "$HERE/../macos" && pwd -P)"; fi
INSTALLED="$HOME/.codex/codex-dream-skin-studio"
if [ -x "$INSTALLED/scripts/start-dream-skin-macos.sh" ]; then ROOT="$INSTALLED"; fi

case "$ACTION" in
  status)
    exec "$ROOT/scripts/status-dream-skin-macos.sh" --json
    ;;
  use-theme)
    [[ "$THEME_ID" =~ ^[A-Za-z0-9_-]{1,80}$ ]] || { printf 'invalid theme id\n' >&2; exit 2; }
    exec "$ROOT/scripts/switch-theme-macos.sh" --id "$THEME_ID"
    ;;
  set-image)
    [ -n "$THEME_ID" ] || { printf 'image path is required\n' >&2; exit 2; }
    exec "$ROOT/scripts/customize-theme-macos.sh" --image "$THEME_ID" --name "自定义主题" --no-apply
    ;;
  update-theme)
    exec /bin/bash "$ROOT/scripts/update-theme-macos.sh" "$THEME_ID"
    ;;
  start|resume)
    exec "$ROOT/scripts/start-dream-skin-macos.sh" --restart-existing
    ;;
  pause)
    exec "$ROOT/scripts/pause-dream-skin-macos.sh"
    ;;
  restore)
    exec "$ROOT/scripts/restore-dream-skin-macos.sh" --restore-base-theme --restart-codex
    ;;
  *)
    printf 'unsupported action: %s\n' "$ACTION" >&2
    exit 2
    ;;
esac
