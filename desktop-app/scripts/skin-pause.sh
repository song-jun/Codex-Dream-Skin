#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
PAUSE_SCRIPT="$PROJECT_ROOT/windows/scripts/pause-dream-skin.ps1"

if [[ ! -f "$PAUSE_SCRIPT" ]]; then
  printf '%s\n' "Pause script not found: $PAUSE_SCRIPT" >&2
  exit 1
fi

POWERSHELL=""
for command_name in powershell.exe pwsh.exe; do
  if command -v "$command_name" >/dev/null 2>&1; then
    POWERSHELL="$command_name"
    break
  fi
done
if [[ -z "$POWERSHELL" ]]; then
  printf '%s\n' 'PowerShell is required to pause Dream Skin.' >&2
  exit 1
fi

set +e
OUTPUT="$("$POWERSHELL" -NoProfile -ExecutionPolicy RemoteSigned -File "$PAUSE_SCRIPT" 2>&1)"
STATUS=$?
set -e

if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
  if [[ "$STATUS" -eq 0 ]]; then
    printf '\033[32m%s\033[0m\n' "$OUTPUT"
  else
    printf '\033[31m%s\033[0m\n' "$OUTPUT" >&2
  fi
else
  if [[ "$STATUS" -eq 0 ]]; then
    printf '%s\n' "$OUTPUT"
  else
    printf '%s\n' "$OUTPUT" >&2
  fi
fi

exit "$STATUS"
