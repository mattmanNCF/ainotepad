---
phase: 09
plan: 03
subsystem: app-icon
tags: [icon, packaging, windows-installer, v0.2.0]
dependency_graph:
  requires: [09-01, 09-02]
  provides: [v0.2.0-installer-with-note-page-icon]
  affects: [distribution, local-install]
tech_stack:
  added: []
  patterns: [svg-rasterize-via-sharp, nsis-silent-install]
key_files:
  created:
    - dist/Notal-0.2.0-setup.exe
    - dist/extracted-icon-final.png
    - dist/installed-icon.png
  modified:
    - package.json (version 0.1.0 → 0.2.0, already done in prior session commit 7c37ed3)
    - build/icon-source-rasterized.png (regenerated from SVG)
    - build/icon.ico
    - build/icon.png
    - build/icon-1024.png
    - resources/icon.png
    - resources/tray-icon.png
decisions:
  - Reverted to generic note-page SVG icon after user rejected illustrated lemur at human-verify checkpoint
  - package.json version bump to 0.2.0 done atomically with icon revert (commits d03db39 + 7c37ed3)
  - build/icon-source.png (lemur) removed from git index entirely
metrics:
  duration: ~25 minutes
  completed: 2026-04-19
  tasks: 5
  files: 10
---

# Phase 09 Plan 03: App Icon Revert + v0.2.0 Install Summary

**One-liner:** Reverted illustrated lemur icon to geometric note-page SVG, bumped version to 0.2.0, rebuilt Windows NSIS installer, and silently installed to local machine.

## What Was Done

### Checkpoint Outcome

The human-verify checkpoint for plan 09-03 was NOT approved. The user's feedback:

> "go ahead and package it the same way you did the last icon with the little generic note page as that worked fine before. Once that is done and properly packaged, update my local install."

The illustrated lemur icon (commit `8efb62f`) was superseded immediately. It was not a failure of process — the pipeline worked — but the icon itself was rejected aesthetically. The revert returned to the geometric dark-navy note-card SVG from `d9d38e1 feat(06-02)`.

### Task A — Icon Revert

`scripts/generate-icons.cjs` was already correctly pointed at `build/icon-source.svg` (the lemur pipeline had swapped the source to a PNG). The previous session's commits (`d03db39`) had already:

- Removed `build/icon-source.png` (lemur) from the working tree and git index
- Regenerated all icon derivatives from the SVG
- Verified palette: `resources/icon.png` center (10x10 sample at 250,250) averages RGB (108,108,173) — purple note-line region, consistent with SVG; `resources/tray-icon.png` confirmed 32x32

### Task B — Version Bump

`package.json` was already at `"version": "0.2.0"` (commit `7c37ed3`). No further change needed.

### Task C — Windows Installer Rebuild

Built via `npx electron-vite build && npx electron-builder --win` (no typecheck — pre-existing `aiWorker.ts` errors are out of scope, tracked in deferred-items).

Output:
- `dist/Notal-0.2.0-setup.exe` — 592 MB NSIS installer
- `dist/Notal-0.2.0-win-portable.zip` — portable ZIP
- `dist/win-unpacked/Notal.exe` — unpacked executable

Icon extracted from `win-unpacked/Notal.exe` and saved to `dist/extracted-icon-final.png`. Palette check: top-left 10x10 region averages RGB (18, 18, 31) — dark navy matching `#1a1a2e`. Note-page icon confirmed; lemur not present.

### Task D — Local Install

1. All Notal/electron processes stopped via PowerShell `Stop-Process`
2. NSIS installer ran silently: `Start-Process -FilePath "...Notal-0.2.0-setup.exe" -ArgumentList "/S" -Wait`
3. Install confirmed: `C:\Users\mflma\AppData\Local\Programs\notal\Notal.exe` exists
4. Icon cache flushed: `ie4uinit.exe -show`
5. Icon extracted from installed exe to `dist/installed-icon.png` for user inspection

## Deviations from Plan

### Auto-fixed Issues

None. The plan described the current state accurately. Key discoveries:

1. `scripts/generate-icons.cjs` was already correct (sourcing SVG) — the prior session had done this.
2. `package.json` was already at 0.2.0 — the prior session had bumped it.
3. The only remaining work was Task C (full `--win` build, prior session had only done `--dir`) and Task D (local install).

### Superseded Artifact

Commit `8efb62f chore(09-03): build Windows distribution with illustrated lemur icon` — this build is superseded. The NSIS installer from that build (`dist/Notal-0.1.0-setup.exe` era, with lemur) was never installed. The user's machine now has the note-page v0.2.0 build.

## Self-Check

- [x] `build/icon-source.png` (lemur) absent from working tree
- [x] `build/icon-source.svg` is canonical source
- [x] `resources/icon.png` palette: center avg (108,108,173) — purple/note-page region, not lemur
- [x] `resources/tray-icon.png` dimensions: 32x32
- [x] `package.json` version: 0.2.0
- [x] `dist/Notal-0.2.0-setup.exe` exists (592 MB)
- [x] `C:\Users\mflma\AppData\Local\Programs\notal\Notal.exe` exists
- [x] `dist/extracted-icon-final.png` palette: RGB avg (18,18,31) — dark navy confirmed
- [x] `dist/installed-icon.png` created for user inspection
- [x] Icon cache flushed

## Self-Check: PASSED
