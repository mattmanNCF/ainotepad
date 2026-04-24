# Notal Mobile PWA

Static PWA that captures notes on mobile and writes them to Google Drive appDataFolder.
The desktop Notal app polls Drive every 60 seconds and ingests each note via the shared
createNote() code path, then deletes the source file.

## Architecture

See `.planning/phases/12-mobile-extension/12-RESEARCH.md` in the main repo for the full
architecture writeup.

- **Auth**: Google Identity Services (GIS) token model. Access tokens only, no refresh
  tokens in the browser. Re-auth on each session open.
- **Transport**: Drive `appDataFolder` (OAuth-client-private, shared across clients in
  the same GCP project).
- **Offline**: IndexedDB queue via `idb@8`.
- **Hosting**: GitHub Pages at https://mattmanNCF.github.io/notal-mobile/

## Local dev

```bash
cd mobile-pwa
cp .env.example .env.local
# Edit .env.local and paste your Web OAuth client ID from GCP
npm install --legacy-peer-deps
npm run dev
```

The Vite dev server binds to `0.0.0.0:5173` so you can connect from a phone on the same
LAN (`http://<your-mac-ip>:5173/notal-mobile/`). Note: GIS will reject localhost OAuth
redirects — add `http://localhost:5173` and your LAN IP as Authorized JavaScript origins
in the Web OAuth client's GCP settings for local testing.

## Production deploy

Automated via `.github/workflows/deploy-mobile.yml`:

- **Trigger**: push to `main` touching `mobile-pwa/**`.
- **Secret**: `GOOGLE_WEB_CLIENT_ID` must be set in repo Settings -> Secrets -> Actions.
- **GitHub Pages Source**: Settings -> Pages -> Source must be "GitHub Actions" (not
  "Deploy from a branch").

Manual deploy: Settings -> Actions -> Deploy Notal Mobile PWA -> Run workflow.

## Build output

Vite builds to `../docs/notal-mobile/` at the repo root. Contents:
- `index.html` — HTML shell with apple-touch-icon + GIS script tag
- `manifest.webmanifest` — PWA manifest (scope + start_url both `/notal-mobile/`)
- `sw.js` + `workbox-*.js` — service worker (auto-update on deploy)
- `assets/*` — hashed JS/CSS bundles
- `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png`

## iOS home-screen install

1. Open the site in Safari.
2. Share -> Add to Home Screen.
3. Installed PWAs are exempt from the 7-day IndexedDB eviction cap (per WebKit storage
   policy). The queue persists across tab close + reopen.

## Limits

- Per-note text: 16 KiB max (enforced by desktop ajv validation on ingest).
- Drive appDataFolder: warn at 10 MB, hard-stop at 100 MB (stuck-loop protection).
- Access tokens: 1-hour TTL; re-auth required via in-app Connect button.

## VITE_GOOGLE_WEB_CLIENT_ID

This environment variable must be set at build time. In CI it is read from the
`GOOGLE_WEB_CLIENT_ID` repository secret. Locally, set it in `.env.local`:

```
VITE_GOOGLE_WEB_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
```

GitHub Pages URL must be added to the Web OAuth client's Authorized JavaScript origins
in GCP: `https://mattmanNCF.github.io`
