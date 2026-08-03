#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd -P)"

if [[ -z "${LOCALAPPDATA:-}" ]]; then
  printf '%s\n' 'Dream Skin 未启动，请先启动皮肤。' >&2
  exit 1
fi

STATE_PATH_NATIVE="${LOCALAPPDATA%/}/CodexDreamSkin/state.json"
STATE_PATH="$STATE_PATH_NATIVE"
if command -v cygpath >/dev/null 2>&1; then
  STATE_PATH="$(cygpath -u "$STATE_PATH")"
  STATE_PATH_NATIVE="$(cygpath -w "$STATE_PATH")"
fi
if [[ ! -f "$STATE_PATH" ]]; then
  printf '%s\n' 'Dream Skin 未启动，请先启动皮肤。' >&2
  exit 1
fi

# ponytail: 复用现有 Node 运行时解析 JSON，避免引入 jq 依赖。
if ! STATE_VALUES="$(node - "$STATE_PATH_NATIVE" <<'NODE'
const fs = require('node:fs');

const statePath = process.argv[2];
let state;
try {
  state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
} catch {
  console.error('Dream Skin 状态不完整，请先启动皮肤。');
  process.exit(1);
}

if (!state || typeof state !== 'object' || Array.isArray(state) ||
    !state.port || !state.browserId || !state.themeDir) {
  console.error('Dream Skin 状态不完整，请先启动皮肤。');
  process.exit(1);
}

process.stdout.write([
  state.port,
  state.browserId,
  state.themeDir,
  state.pauseFile || '',
].map(String).join('\n'));
NODE
)"; then
  exit 1
fi

mapfile -t STATE <<< "$STATE_VALUES"
PORT="${STATE[0]:-}"
BROWSER_ID="${STATE[1]:-}"
THEME_DIR="${STATE[2]:-}"
PAUSE_FILE="${STATE[3]:-}"

if [[ -z "$PORT" || -z "$BROWSER_ID" || -z "$THEME_DIR" ]]; then
  printf '%s\n' 'Dream Skin 状态不完整，请先启动皮肤。' >&2
  exit 1
fi

INJECTOR="$PROJECT_ROOT/windows/scripts/injector.mjs"
if [[ ! -f "$INJECTOR" ]]; then
  printf 'Dream Skin injector 不存在: %s\n' "$INJECTOR" >&2
  exit 1
fi

ARGS=(
  "$INJECTOR"
  --once
  --port "$PORT"
  --browser-id "$BROWSER_ID"
  --theme-dir "$THEME_DIR"
)
[[ -n "$PAUSE_FILE" ]] && ARGS+=(--pause-file "$PAUSE_FILE")

# ponytail: 仅在交互终端格式化摘要，管道和 CI 保留原始 JSON。
if [[ -t 1 && -z "${NO_COLOR:-}" && "${TERM:-}" != "dumb" ]]; then
  set +e
  node "${ARGS[@]}" 2>&1 | node --input-type=commonjs -e '
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};
const paint = (color, value) => `${colors[color]}${value}${colors.reset}`;
const chunks = [];

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const output = chunks.join("").trim();
  if (!output) return;

  let report;
  try {
    report = JSON.parse(output);
  } catch {
    process.stdout.write(`${paint("red", output)}\n`);
    return;
  }

  const targets = Array.isArray(report.targets) ? report.targets : [];
  const passed = targets.length > 0 && targets.every((target) =>
    !target.error && (report.mode === "remove" ? target.result === true : target.result?.pass === true));
  const title = passed ? paint("green", "inject success") : paint("red", "inject failed");
  console.log(`${paint("bold", "Dream Skin")} ${title}`);
  console.log(`${paint("dim", "mode")} ${report.mode ?? "unknown"}  ${paint("dim", "port")} ${report.port ?? "-"}  ${paint("dim", "targets")} ${targets.length}`);

  for (const [index, target] of targets.entries()) {
    const result = target.result && typeof target.result === "object" ? target.result : {};
    const targetPassed = !target.error && (report.mode === "remove" ? target.result === true : result.pass === true);
    const label = targetPassed ? paint("green", "PASS") : paint("red", "FAIL");
    const id = target.targetId ?? target.id ?? `target-${index + 1}`;
    console.log(`  ${label} ${id}`);

    const markers = Object.entries(result.markers ?? {});
    if (markers.length) {
      const markerText = markers.map(([name, value]) => value ? paint("green", name) : paint("red", name)).join(" ");
      console.log(`    ${paint("dim", "checks")} ${markerText}`);
    }

    const overflow = result.documentOverflow;
    if (overflow && typeof overflow === "object") {
      const clear = overflow.x === false && overflow.y === false;
      console.log(`    ${paint("dim", "overflow")} ${clear ? paint("green", "clear") : paint("yellow", "detected")}`);
    }
    if (target.error) console.log(`    ${paint("red", target.error)}`);
  }
});
'
  injector_status=${PIPESTATUS[0]}
  set -e
  exit "$injector_status"
fi

exec node "${ARGS[@]}"
