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

## Version Correction

**Date:** 2026-04-18
**Reason:** User clarified versioning cadence after v0.2.0 was shipped: each packaged update is a minor bump. The icon update (note-page revert + rebuild) is the SECOND packaged update since v0.1.0, making it v0.3.0 — not v0.2.0. The v0.2.0 tag and git history are preserved; v0.2.0 was never externally distributed, so no external changelog entry was needed.

**Files updated:**
- `package.json`: `0.2.0` → `0.3.0`
- `package-lock.json`: top-level `"version"` and `packages[""].version` fields updated from `0.1.0` → `0.3.0`
  (package-lock.json had drifted to 0.1.0 — corrected to 0.3.0 to match)
- `src/main/index.ts`: already uses `app.getVersion()` — no change needed
- `.vscode/launch.json` `"version": "0.2.0"` — VS Code schema version, NOT app version; left unchanged
- No CHANGELOG.md exists in this repo

**Build output:**
- `dist/Notal-0.3.0-setup.exe` (565 MB NSIS installer)
- `dist/Notal-0.3.0-win-portable.zip`
- Icon palette confirmed: top-left 10x10 avg RGB (18, 18, 31) = #1a1a2e (dark navy, note-page icon)

**Install:**
- v0.2.0 uninstalled silently via `Uninstall Notal.exe /S`
- v0.3.0 installed silently via `Notal-0.3.0-setup.exe /S`
- `C:\Users\mflma\AppData\Local\Programs\notal\Notal.exe` ProductVersion: `0.3.0.0`
- Icon cache flushed via `ie4uinit.exe -show`
- Installed icon palette: RGB (18, 18, 31) — note-page confirmed

**Commits:**
- `bee8079` — `chore(09-03): correct version 0.2.0 -> 0.3.0 (second packaged update since v0.1.0 ship)`
- docs commit (this file + STATE.md update) — see final commit SHA

**Status:** Ready for user visual verification. Tag v0.3.0 and push to main after user confirms.

---

## Final Correction — Restored Lemur Icon

**Date:** 2026-04-19

**Why this correction was needed:**

The orchestrator misread the user's feedback. The phrase "go ahead and package it the same way you did the last icon with the little generic note page as that worked fine before" referred to the *packaging approach* (the build pipeline, NSIS installer, silent install method), NOT a request to use a different icon. The user had all along wanted the illustrated lemur as the app icon. This was a communication failure on the orchestrator's end.

The user's clarifying message:

> "I wanted the new lemur picture as the icon. I just was saying that there should be no reason to really try to give significant testing to this as it should be a simple switch of an image source in the code and this is trivial. So go ahead and update to the lemur picture properly for me and make sure I am updated to this install."

**What was done:**

1. Restored `build/icon-source.png` (1,270,007 bytes, illustrated red-ruffed lemur) from git history (blob in commit `8150102`) via `git checkout 8150102 -- build/icon-source.png`.
2. Updated `scripts/generate-icons.cjs` to read from the lemur PNG (`build/icon-source.png`) instead of the SVG. The `icon-source.svg` file is preserved on disk as a historical asset.
3. Regenerated all icon derivatives via `node scripts/generate-icons.cjs` — all outputs now derive from the lemur.
4. Rebuilt Windows NSIS installer: `npx electron-vite build && npx electron-builder --win`.
5. Uninstalled the note-page v0.3.0 silently, installed lemur v0.3.0 silently.
6. Flushed icon cache (`ie4uinit.exe -show`, `Stop-Process explorer`, `Start-Process explorer`).

**Palette verification:**
- `resources/icon.png` top-left 10x10 avg RGB: (254, 254, 254) — transparent border, NOT note-page navy
- `dist/extracted-icon-lemur.png` (from built exe) top-left 10x10 avg RGB: (230, 219, 207) — warm cream/beige, lemur confirmed
- `dist/installed-icon-lemur.png` (from installed exe) top-left 10x10 avg RGB: (230, 219, 207) — lemur confirmed

**Commits:**
- `f96092f` — `fix(09-03): restore illustrated lemur as canonical icon source`
- Final docs commit — see closing SHA in git log

**Final artifacts:**
- `dist/Notal-0.3.0-setup.exe` — 592,974,978 bytes, lemur embedded
- Installed at `C:\Users\mflma\AppData\Local\Programs\notal\Notal.exe` — ProductVersion `0.3.0.0`, lemur icon
- `dist/extracted-icon-lemur.png` — extracted icon from built exe (user inspection)
- `dist/installed-icon-lemur.png` — extracted icon from installed exe (user inspection)

**Status:** Notal v0.3.0 installed locally with lemur icon. Awaiting user visual confirmation before tagging `v0.3.0` and pushing to main.
