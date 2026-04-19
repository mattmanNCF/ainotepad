---
phase: 09-app-icon
plan: 01
subsystem: ui
tags: [sharp, electron-icon-builder, png, ico, tray, icons, assets]

# Dependency graph
requires: []
provides:
  - Canonical illustrated lemur-with-notepad source PNG at build/icon-source.png (1.27 MB)
  - Multi-resolution ICO with 16/24/32/48/64/128/256 entries at build/icon.ico
  - 1024x1024 PNG at build/icon-1024.png for future ICNS regeneration
  - 512x512 PNG at build/icon.png (electron-builder macOS/Linux source)
  - 512x512 PNG at resources/icon.png (imported via ?asset in src/main/index.ts)
  - 32x32 tray PNG at resources/tray-icon.png for Windows system tray
  - Reproducible generator script at scripts/generate-icons.cjs
affects: [09-02, electron-builder, windows-release]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Icon pipeline: single illustrated source PNG -> sharp resize -> electron-icon-builder ICO; all derivatives reproducible via node scripts/generate-icons.cjs"

key-files:
  created:
    - build/icon-source.png
    - resources/tray-icon.png
    - scripts/generate-icons.cjs
  modified:
    - build/icon-1024.png
    - build/icon.png
    - build/icon.ico
    - resources/icon.png

key-decisions:
  - "electron-icon-builder --flatten on Windows emits ICO to {output}/icons/icon.ico (not icons/win/icon.ico as documented); script corrected to use actual output path"
  - "electron-icon-builder exits with code 2 on success on Windows (CLI quirk); script checks artifact existence rather than exit code"
  - "Windows spawnSync requires shell:true for .cmd wrapper scripts; icon generation uses shell:true on win32 only"
  - "sharp contain+transparent-pad strategy preserves lemur composition without cropping at any target size"

patterns-established:
  - "generate-icons.cjs: always check artifact existence rather than exit code when calling electron-icon-builder on Windows"
  - "Icon generation is idempotent: re-running scripts/generate-icons.cjs regenerates all derivatives safely"

requirements-completed: [ICON-01]

# Metrics
duration: 25min
completed: 2026-04-18
---

# Phase 09 Plan 01: App Icon Source + ICO Generation Summary

**Illustrated red-ruffed lemur-with-notepad art installed as canonical icon source; multi-resolution ICO (7 entries: 16-256px) and 32x32 tray PNG generated via reproducible scripts/generate-icons.cjs using sharp + electron-icon-builder**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-04-18T23:57:00Z
- **Completed:** 2026-04-19T00:22:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced placeholder SVG-derived icon pipeline with ChatGPT-illustrated lemur art (1,270,007 bytes)
- Generated all derivative PNGs (1024x1024, 512x512, 32x32) via sharp with contain+transparent-pad
- Created multi-resolution ICO with 7 entries (16, 24, 32, 48, 64, 128, 256) verified via binary header inspection
- Written idempotent scripts/generate-icons.cjs so icon can be regenerated from source at any time

## Task Commits

Each task was committed atomically:

1. **Task 1: Copy lemur source and generate 1024/512 PNG derivatives** - `8150102` (feat)
2. **Task 2: Write generate-icons.cjs and regenerate ICO + tray PNG** - `4ae8318` (feat)

## Files Created/Modified
- `build/icon-source.png` - Canonical 1.27 MB illustrated lemur source (from Downloads)
- `build/icon-1024.png` - 1024x1024 PNG derivative (1,672,386 bytes)
- `build/icon.png` - 512x512 PNG for electron-builder (431,198 bytes)
- `build/icon.ico` - Multi-resolution ICO with 7 entries 16-256px (361,102 bytes)
- `resources/icon.png` - 512x512 PNG imported via ?asset in src/main/index.ts (431,198 bytes)
- `resources/tray-icon.png` - NEW: 32x32 PNG for Windows system tray (2,536 bytes)
- `scripts/generate-icons.cjs` - NEW: Reproducible icon generator (CommonJS, uses sharp + electron-icon-builder)

## Decisions Made
- Used `fit: 'contain'` with transparent alpha padding to preserve lemur composition without cropping at any target size
- electron-icon-builder on Windows requires `shell: true` for .cmd wrapper scripts
- Checked artifact existence rather than exit code since electron-icon-builder exits 2 on success (Windows CLI quirk)
- ICO emitted to `{output}/icons/icon.ico` not `{output}/icons/win/icon.ico` as plan assumed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] electron-icon-builder output path differs from plan assumption**
- **Found during:** Task 2 (generate-icons.cjs execution)
- **Issue:** Plan specified `{output}/icons/win/icon.ico` but electron-icon-builder `--flatten` on Windows actually emits to `{output}/icons/icon.ico`
- **Fix:** Updated generatedIco path in script from `path.join(tmpDir, 'icons', 'win', 'icon.ico')` to `path.join(tmpDir, 'icons', 'icon.ico')`
- **Files modified:** scripts/generate-icons.cjs
- **Verification:** Script runs cleanly, ICO copied correctly, binary header confirmed 7 entries
- **Committed in:** 4ae8318 (Task 2 commit)

**2. [Rule 1 - Bug] electron-icon-builder requires shell:true on Windows for spawnSync**
- **Found during:** Task 2 (first script run, exit code null / EINVAL)
- **Issue:** Calling .cmd binary via spawnSync without `shell:true` returns EINVAL on Windows Node 24
- **Fix:** Added `shell: process.platform === 'win32'` to spawnSync options
- **Files modified:** scripts/generate-icons.cjs
- **Verification:** Script now runs and completes successfully
- **Committed in:** 4ae8318 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug, Windows platform-specific behavior)
**Impact on plan:** Both fixes necessary for script to execute on Windows. No scope change.

## Issues Encountered
- electron-icon-builder exits with code 2 on success on Windows; script uses artifact-existence check as the true success signal rather than exit code

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All icon assets are in place for Plan 09-02 which wires tray-icon.png into the main process and wires icon.ico into electron-builder config
- scripts/generate-icons.cjs is available for future art updates (just replace build/icon-source.png and re-run)

---
*Phase: 09-app-icon*
*Completed: 2026-04-18*
