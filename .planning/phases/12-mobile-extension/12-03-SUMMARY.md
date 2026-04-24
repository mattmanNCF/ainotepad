---
phase: "12"
plan: "03"
subsystem: mobile-pwa
tags: [mobile, pwa, vite, react, gis, drive, idb, offline-queue]
dependency_graph:
  requires: ["12-01", "12-02"]
  provides: [mobile-pwa-build, docs/notal-mobile, offline-queue, pollForIngestion]
  affects: ["12-05"]
tech_stack:
  added:
    - vite 6.4.2 (mobile-pwa standalone)
    - react 19.2.5 (mobile-pwa standalone)
    - idb 8.0.3 (IndexedDB typed wrapper)
    - vite-plugin-pwa 1.2.0 (service worker + manifest)
    - "@vitejs/plugin-react" 4.7.0
    - typescript 5.9.3
  patterns:
    - GIS initTokenClient access-token-only model (no refresh tokens)
    - idb v8 DBSchema typed store for offline queue
    - Fire-and-forget pollForIngestion after Drive upload (MOB-UX-01)
    - Multipart Drive upload to appDataFolder
key_files:
  created:
    - mobile-pwa/package.json
    - mobile-pwa/package-lock.json
    - mobile-pwa/vite.config.ts
    - mobile-pwa/tsconfig.json
    - mobile-pwa/index.html
    - mobile-pwa/src/main.tsx
    - mobile-pwa/src/styles.css
    - mobile-pwa/src/App.tsx
    - mobile-pwa/src/envelope.ts
    - mobile-pwa/src/auth/gisClient.ts
    - mobile-pwa/src/queue/noteQueue.ts
    - mobile-pwa/src/drive/driveUpload.ts
    - mobile-pwa/public/apple-touch-icon-180x180.png
    - mobile-pwa/public/pwa-192x192.png
    - mobile-pwa/public/pwa-512x512.png
    - mobile-pwa/public/favicon.ico
    - mobile-pwa/scripts/gen-icons.cjs
    - mobile-pwa/.env.example
  modified:
    - .gitignore (added mobile-pwa/node_modules and docs/)
decisions:
  - "Stub App.tsx created in Task 1 (Rule 3 deviation) to make build pass before Task 2 full UI was written; replaced in Task 2 commit"
  - "Icons generated from build/icon.png via sharp from root node_modules (not installed inside mobile-pwa); gen-icons.cjs uses ../../node_modules/sharp path"
  - "vite-plugin-pwa 1.2.0 confirmed available on npm — no fallback needed"
  - "GIS token model: access tokens only, zero refresh_token references anywhere in mobile-pwa/src/"
  - "pollForIngestion fires void (fire-and-forget) from drainQueue — queue processing not stalled by 60s poll window"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-23"
  tasks_completed: 2
  tasks_total: 2
  files_created: 18
  files_modified: 1
---

# Phase 12 Plan 03: Mobile PWA Summary

Standalone Vite 6 + React 19 PWA with GIS OAuth, IndexedDB offline queue, Drive appDataFolder upload, and pollForIngestion for MOB-UX-01 ingested state detection.

## What Was Built

Mobile PWA at `mobile-pwa/` — a standalone Vite sub-project with its own package.json, node_modules, and build pipeline. Outputs to `docs/notal-mobile/` for GitHub Pages hosting at `https://mattmanNCF.github.io/notal-mobile/`.

### Resolved Dependency Versions

| Package | Version |
|---------|---------|
| vite | 6.4.2 |
| react | 19.2.5 |
| idb | 8.0.3 |
| vite-plugin-pwa | 1.2.0 |
| @vitejs/plugin-react | 4.7.0 |
| typescript | 5.9.3 |

### Build Output (npm run build)

```
../docs/notal-mobile/registerSW.js       0.16 kB
../docs/notal-mobile/manifest.webmanifest  0.41 kB
../docs/notal-mobile/index.html           1.02 kB │ gzip: 0.48 kB
../docs/notal-mobile/assets/index-*.css   0.99 kB │ gzip: 0.50 kB
../docs/notal-mobile/assets/index-*.js  203.24 kB │ gzip: 64.32 kB
sw.js + workbox-8c29f6e4.js generated
PWA v1.2.0 — generateSW mode — 11 entries precached (1096 KiB)
```

### Manual Smoke Test

Not run against real phone (requires LAN access + VITE_GOOGLE_WEB_CLIENT_ID set at build time). Dev server URL for Plan 12-06 testing: run `cd mobile-pwa && npm run dev` then open `http://<LAN-IP>:5173/notal-mobile/` on mobile device.

### Confirmed Absent: refresh_token

```
grep -r "refresh_token" mobile-pwa/src/ → 0 matches
```

GIS token model delivers access tokens only; no refresh token is requested, stored, or referenced anywhere in mobile-pwa/src/.

### MOB-UX-01: pollForIngestion Confirmed

- `pollForIngestion` implemented in `mobile-pwa/src/queue/noteQueue.ts`
- Polls `GET https://www.googleapis.com/drive/v3/files/{fileId}` every 5000 ms (12 attempts max = ~60 s window)
- HTTP 404 → `updateStatus(queueId, 'ingested')` and stop
- HTTP 401/403 or any error → stop silently (leave at `on-drive`)
- Called from `drainQueue` as `void pollForIngestion(token, fileId, note.id).catch(() => {})` — fire-and-forget, non-blocking

### Architecture

```
mobile-pwa/
  src/
    envelope.ts         — Mirrored NoteEnvelope schema (no ajv — desktop validates)
    auth/gisClient.ts   — GIS initTokenClient wrapper, onAuthChange listeners, 55-min TTL
    queue/noteQueue.ts  — idb v8 typed store: local→uploading→on-drive→ingested/failed
    drive/driveUpload.ts — multipart POST to Drive upload API, appDataFolder parent
    App.tsx             — Capture-only: textarea, Save, delivery badges, Connect Google
    main.tsx            — React 19 StrictMode mount
    styles.css          — Dark minimal CSS, safe-area padding, .badge.* state styles
  public/
    pwa-192x192.png     — Generated from build/icon.png via sharp
    pwa-512x512.png
    apple-touch-icon-180x180.png
    favicon.ico         — Copied from build/icon.ico
  vite.config.ts        — base='/notal-mobile/', VitePWA, outDir='../docs/notal-mobile'
  index.html            — apple-touch-icon link + GIS script tag (async defer)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Stub App.tsx created in Task 1**
- **Found during:** Task 1 pre-build check
- **Issue:** Task 1 creates `main.tsx` which imports `./App`, but App.tsx was not in Task 1's file list (deferred to Task 2). Build would fail with "Cannot find module './App'".
- **Fix:** Created minimal stub `App.tsx` returning `<div>Loading…</div>` in Task 1; replaced in Task 2 with full implementation.
- **Files modified:** `mobile-pwa/src/App.tsx` (created stub in Task 1, replaced in Task 2)
- **Commits:** ab2ecdd (stub created), 8e7376c (replaced with full UI)

**2. [Rule 3 - Blocking] Icon generation uses root node_modules/sharp**
- Not a deviation per se — gen-icons.cjs uses `../../node_modules/sharp` as specified in the plan. Sharp is confirmed present in root node_modules (from the main Electron project). Icons generated successfully.

## Requirements Satisfied

| Requirement | Status |
|-------------|--------|
| MOB-AUTH-01 | Satisfied — GIS initTokenClient, drive.appdata scope, access tokens only |
| MOB-TRANS-01 | Satisfied — multipart Drive upload to appDataFolder confirmed by Plan 12-01 gate |
| MOB-PWA-01 | Satisfied — VitePWA manifest with scope+start_url=/notal-mobile/, installable |
| MOB-PWA-02 | Satisfied — GIS script + apple-touch-icon in index.html, iOS meta tags |
| MOB-UX-01 | Satisfied — pollForIngestion wired from drainQueue; 'ingested' badge shown in UI |

## Self-Check: PASSED

All 17 key files exist on disk. Both feat(12-03) commits exist:
- ab2ecdd: feat(12-03): scaffold mobile-pwa sub-project with VitePWA + icons
- 8e7376c: feat(12-03): mobile PWA capture UI, GIS auth, idb queue, Drive upload, ingest poll

Build verified: `cd mobile-pwa && npm run build` exits 0. docs/notal-mobile/index.html present.
