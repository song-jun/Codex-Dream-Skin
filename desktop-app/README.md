# Codex Dream Skin Desktop

Vue 3 + Electron + Element Plus control app for the existing Codex Dream Skin runtime.

## Run locally

```powershell
cd desktop-app
npm install
npm run dev
```

The app expects the existing platform runtime under `windows/` or `macos/`, or an installed runtime in the managed Dream Skin path. It does not modify the official Codex installation. `npm run build` packages the app and automatically increments the patch version. The generated Windows installer and macOS disk image include that version in their filenames.

The top-bar `开启 / 关闭 Codex` button only opens or closes the official Codex app. Closing immediately terminates the verified official Codex process, so unsaved Codex input can be lost. `启动 / 重启皮肤` retains the separate Dream Skin injection and restart workflow.
