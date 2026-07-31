# Codex Dream Skin Desktop

Vue 3 + Electron + Element Plus control app for the existing Codex Dream Skin runtime.

## Run locally

```powershell
cd desktop-app
npm install
npm run dev
```

The app expects the existing platform runtime under `windows/` or `macos/`, or an installed runtime in the managed Dream Skin path. It does not modify the official Codex installation. `npm run build` is available for packaging, but is intentionally not part of the normal development workflow.
