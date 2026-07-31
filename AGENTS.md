# Codex Dream Skin: Project Memory

This file is durable project context for future coding sessions. Update it when
the architecture or safety boundaries change.

## Product

Codex Dream Skin is an unofficial, reversible visual skin for the official
OpenAI Codex desktop app. It injects CSS and small DOM integration layers into
the live renderer through Chromium DevTools Protocol (CDP). The app remains the
official native app: sidebar, navigation, project selector, cards, composer,
task content, and keyboard focus must remain real and interactive.

The project provides a continuous UI-free 16:9 wallpaper, adaptive readability
layers, saved themes, image import, pause/resume, verification, and one-click
restore to the stock appearance.

## Repository Layout

- `macos/`: macOS shell scripts, signed-runtime checks, injector, assets,
  presets, menu-bar controls, and tests.
- `windows/`: Windows PowerShell scripts, Store-package discovery, injector,
  assets, presets, system-tray controls, and tests.
- `docs/`: project notes, platform contracts, QA references, and background
  image generation guidance.
- `README.md` and `README.en.md`: user-facing overview and quick start.

The two platform implementations share the same visual and safety contract but
use platform-native process discovery, installation, state storage, and launch
mechanisms.

## Runtime Locations

macOS installed runtime:

- Engine: `~/.codex/codex-dream-skin-studio`
- State and logs: `~/Library/Application Support/CodexDreamSkinStudio`

Windows installed runtime:

- Engine: `%LOCALAPPDATA%\CodexDreamSkin\engine`
- State, themes, imported images, pause marker, and logs:
  `%LOCALAPPDATA%\CodexDreamSkin`

The installed runtime must be usable after the source checkout is moved or
removed. Shortcuts and tray/menu-bar helpers must point at the managed runtime,
not the repository.

## Non-Negotiable Safety Rules

- Never modify the official `.app`, `app.asar`, WindowsApps files, executable,
  package signature, or Store installation.
- CDP must bind to `127.0.0.1` and targets must be verified as the current
  Codex renderer. Loopback CDP has no same-user authentication, so only trusted
  local software may run while the skin is active.
<!-- - Never read, write, or silently change API keys, provider settings, Base URLs,
  relay configuration, authentication state, threads, plugins, or user data. -->
- Do not execute an untrusted or unexplained local process as part of theme
  operation.
- Keep install, start, restore, and verify operations serialized with the
  platform operation lock.
- Restore must close the debug session and return the official appearance.

## Theme Contract

- Backgrounds must be pure UI-free images: no window chrome, sidebar, cards,
  composer, logo, text, watermark, or screenshot content.
- Prefer 2560x1440, 16:9 images. Keep image import limits and metadata checks
  enforced by the existing platform scripts.
- Decorative layers use `pointer-events: none`; native controls must remain
  above them and clickable.
- `appearance: auto` follows native Codex/system appearance. Image brightness
  must not silently flip the user's light/dark mode.
- Home routes may be expressive; task routes should reduce visual interference
  so code, messages, and input remain readable.
- Preserve focus, responsive layout, native project selection, and the real
  composer. Never replace the whole window with a static screenshot.

## Important Platform Behavior

### macOS

- Use the bundled signed Node.js runtime only after the existing validation.
- Entry commands live under `macos/` and are also exposed as `.command` files.
- Theme customization and switching are handled by scripts such as
  `customize-theme-macos.sh`, `load-image-theme-macos.sh`, and
  `switch-theme-macos.sh`.

### Windows

- The target is the Microsoft Store `OpenAI.Codex` package. Discover the
  registered package dynamically; do not rely on a hard-coded WindowsApps path.
- The managed runtime is installed by `scripts/install-dream-skin.ps1` and
  launched by `scripts/start-dream-skin.ps1`.
- Use `scripts/restore-dream-skin.ps1` for rollback and
  `scripts/verify-dream-skin.ps1` for live verification.
- Installed scripts and shortcuts use `RemoteSigned`, never `Bypass`. Do not
  alter the user's persistent execution policy.
- Preserve `config.toml` as strict UTF-8 and use the existing atomic, guarded
  configuration helpers for any appearance-only migration.

## Validation

Before considering a platform change complete, run the relevant syntax and
regression checks, then verify both the Codex home screen and a normal task:

```powershell
cd windows
powershell -NoProfile -File tests\run-tests.ps1
node --check scripts\injector.mjs
node --check assets\renderer-inject.js
```

```bash
cd macos
bash tests/run-tests.sh
node --check scripts/injector.mjs
node --check assets/renderer-inject.js
```

Live verification must cover native sidebar, project selector, composer,
suggestion/card content, continuous wallpaper, no horizontal overflow, and
non-interactive decoration. Restore should be tested after live injection.

## Change Discipline

- Prefer the existing scripts, state formats, theme contract, and platform
  helpers over new abstractions.
- Keep macOS and Windows behavior aligned unless the platform plumbing requires
  a documented difference.
- Update user docs and `docs/PROJECT.md` when a user-visible workflow,
  persistent path, or safety boundary changes.
- Never commit credentials, auth files, private screenshots, or local runtime
  state.
