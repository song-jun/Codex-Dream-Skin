#!/bin/bash

set -Eeuo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PATCH_JSON="${1:-}"
[ -n "$PATCH_JSON" ] || fail "Theme JSON is required."
discover_codex_app
require_macos_runtime
ensure_state_root

"$NODE" - "$THEME_DIR/theme.json" "$PATCH_JSON" <<'NODE'
const fs = require("node:fs");
const [file, patchJson] = process.argv.slice(2);
const patch = JSON.parse(patchJson);
if (!patch || typeof patch !== "object" || !patch.art || typeof patch.art !== "object") {
  throw new Error("Theme art settings are missing.");
}
const theme = JSON.parse(fs.readFileSync(file, "utf8"));
theme.art = theme.art && typeof theme.art === "object" ? theme.art : {};
if (patch.art.maskOpacity !== undefined) {
  const opacity = Number(patch.art.maskOpacity);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Mask opacity must be between 0 and 1.");
  theme.art.maskOpacity = opacity;
}
for (const key of ["maskOpacityLight", "maskOpacityDark"]) {
  if (patch.art[key] === undefined) continue;
  const opacity = Number(patch.art[key]);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Mask opacity must be between 0 and 1.");
  theme.art[key] = opacity;
}
if (patch.art.caretColor !== undefined) {
  const color = String(patch.art.caretColor).trim();
  if (!/^(#[\da-f]{3,8}|(rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i.test(color)) throw new Error("Caret color is invalid.");
  theme.art.caretColor = color;
}
for (const key of ["caretColorLight", "caretColorDark"]) {
  if (patch.art[key] === undefined) continue;
  const color = String(patch.art[key]).trim();
  if (!/^(#[\da-f]{3,8}|(rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i.test(color)) throw new Error("Caret color is invalid.");
  theme.art[key] = color;
}
for (const key of ["accent", "accentInk"]) {
  if (patch.art[key] === undefined) continue;
  if (patch.art[key] === null) {
    delete theme.art[key];
    continue;
  }
  const color = String(patch.art[key]).trim();
  if (!/^(#[\da-f]{3,8}|(rgba?|hsla?|oklch|oklab)\([^;{}]{1,96}\)|var\(--[A-Za-z0-9_-]{1,80}\)|transparent)$/i.test(color)) throw new Error("Theme color is invalid.");
  theme.art[key] = color;
}
if (patch.art.imageLuma !== undefined) {
  if (patch.art.imageLuma === null) {
    delete theme.art.imageLuma;
  } else {
    const imageLuma = Number(patch.art.imageLuma);
    if (!Number.isFinite(imageLuma) || imageLuma < 0 || imageLuma > 1) throw new Error("Image luma must be between 0 and 1.");
    theme.art.imageLuma = imageLuma;
  }
}
const temporary = `${file}.${process.pid}.tmp`;
try {
  fs.writeFileSync(temporary, `${JSON.stringify(theme, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
} finally {
  try { fs.rmSync(temporary, { force: true }); } catch {}
}
NODE

printf 'Dream Skin theme settings updated.\n'
