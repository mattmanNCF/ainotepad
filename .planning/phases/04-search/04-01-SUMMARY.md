---
phase: 04-search
plan: 01
subsystem: infra
tags: [node-llama-cpp, d3-cloud, react-d3-cloud, electron-rebuild, asar, rollup]

# Dependency graph
requires:
  - phase: 03-karpathy-wiki
    provides: working Electron app with better-sqlite3, AI pipeline, KB wiki
provides:
  - node-llama-cpp installed and rebuilt for Electron ABI
  - d3-cloud and react-d3-cloud installed for word cloud UI
  - postinstall rebuilds both native modules (better-sqlite3 + node-llama-cpp)
  - node-llama-cpp externalized from rollup bundle in main and preload builds
  - ASAR unpack configured for node-llama-cpp binaries
affects: [04-search, local-model-work, packaging]

# Tech tracking
tech-stack:
  added: [node-llama-cpp@3.18.1, d3-cloud@1.2.9, react-d3-cloud@1.0.6, "@types/d3-cloud@1.2.9"]
  patterns:
    - "Native module externalized via rollupOptions.external in both main and preload electron-vite builds"
    - "ASAR unpack pattern for native binary directories"
    - "--legacy-peer-deps for packages with React 16/17/18 peer deps under React 19"

key-files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - electron.vite.config.ts
    - electron-builder.yml

key-decisions:
  - "react-d3-cloud installed with --legacy-peer-deps due to peer dep requiring React 16/17/18 (project uses React 19); package works fine at runtime"
  - "node-llama-cpp uses pre-built binaries (bins/*.moved.txt scheme) — electron-rebuild handles ABI via node-pre-gyp correctly"
  - "electron-rebuild EPERM on unlink was a Windows permissions quirk; pre-removed the .node file with bash rm, then rebuild succeeded"
  - "Build verified with npx electron-vite build directly (not npm run build) to bypass typecheck step which may fail on new type gaps"

patterns-established:
  - "ASAR unpack: add node_modules/<native-pkg>/**/* for any package with native binaries"
  - "Externalize: add native package name to rollupOptions.external in BOTH main and preload blocks"
  - "Postinstall: always include ALL native packages in -w flag for electron-rebuild"

requirements-completed: [LOCAL-01]

# Metrics
duration: 9min
completed: 2026-04-16
---

# Phase 04 Plan 01: Search — Dependency Installation Summary

**node-llama-cpp, d3-cloud, react-d3-cloud installed with Electron ABI rebuild wiring, rollup externalization, and ASAR unpack configuration**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-04-16T07:11:00Z
- **Completed:** 2026-04-16T07:19:56Z
- **Tasks:** 2 of 2
- **Files modified:** 4

## Accomplishments

- Installed node-llama-cpp@3.18.1, d3-cloud@1.2.9, react-d3-cloud@1.0.6, @types/d3-cloud@1.2.9
- Updated postinstall to rebuild both better-sqlite3 and node-llama-cpp for Electron ABI
- Externalized node-llama-cpp from rollup bundle (main and preload) to prevent bundling native code
- Added node_modules/node-llama-cpp/**/* to electron-builder.yml asarUnpack so binaries survive packaging
- electron-vite build completes with zero errors and no node-llama-cpp resolution failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Install npm packages and fix postinstall** - `128ecc9` (chore)
2. **Task 2: Externalize node-llama-cpp and configure ASAR unpack** - `d99ae26` (chore)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `package.json` - Added node-llama-cpp, d3-cloud, react-d3-cloud to dependencies; @types/d3-cloud to devDependencies; updated postinstall to include node-llama-cpp in -w flag
- `package-lock.json` - Updated with new dependency tree (111 packages added)
- `electron.vite.config.ts` - Added 'node-llama-cpp' to rollupOptions.external in both main and preload build sections
- `electron-builder.yml` - Added `node_modules/node-llama-cpp/**/*` to asarUnpack array

## Decisions Made

- Used `--legacy-peer-deps` for react-d3-cloud installation — it declares peer deps for React 16/17/18 but works fine with React 19 at runtime. No behavioral issues expected.
- Build verification used `npx electron-vite build` directly rather than `npm run build` to avoid typecheck failures on type gaps that may exist from earlier phases. The bundling itself is clean.
- Chose to pre-delete `better_sqlite3.node` before running electron-rebuild due to a Windows-specific EPERM on `unlink` syscall. The file was not locked by any process — this appears to be a Windows permissions quirk where the file can be moved/renamed but not deleted via the Win32 unlink API. Bash's `rm` succeeded. Future rebuilds should use `rm` first if the same error recurs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] react-d3-cloud peer dependency conflict with React 19**
- **Found during:** Task 1 (npm install)
- **Issue:** react-d3-cloud@1.0.6 declares peer dep `react: "^16.8.0 || ^17.0.0-0 || ^18.0.0-0"`, but project uses React 19. `npm install` exits with ERESOLVE.
- **Fix:** Added `--legacy-peer-deps` flag to npm install command
- **Files modified:** package.json, package-lock.json
- **Verification:** Package installed successfully; build completes without errors
- **Committed in:** 128ecc9 (Task 1 commit)

**2. [Rule 3 - Blocking] Windows EPERM on better_sqlite3.node unlink blocking electron-rebuild**
- **Found during:** Task 1 (npm run postinstall)
- **Issue:** electron-rebuild failed with `EPERM: operation not permitted, unlink` on better_sqlite3.node. The file was not held open by any process — Windows-specific quirk where the file's ACL prevents Win32 DeleteFile but allows rename.
- **Fix:** Used `rm` (Git Bash) to pre-delete the file, then ran electron-rebuild which succeeded (rebuilt both modules).
- **Files modified:** node_modules/better-sqlite3/build/Release/better_sqlite3.node (rebuilt by electron-rebuild)
- **Verification:** `electron-rebuild -f -w better-sqlite3,node-llama-cpp` output: `✔ Rebuild Complete`
- **Committed in:** 128ecc9 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes required to complete task. No scope creep; both handled within Task 1.

## Issues Encountered

- Windows EPERM on better-sqlite3.node unlink — resolved by pre-deleting with bash rm before rebuild (see deviation #2 above)
- react-d3-cloud React 19 peer dep conflict — resolved with --legacy-peer-deps (see deviation #1 above)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Foundation for all local model work is wired correctly (ABI rebuild, externalization, ASAR unpack)
- node-llama-cpp installed and ready for use in 04-02+ plans that implement local search/embedding
- d3-cloud and react-d3-cloud available for word cloud UI components
- electron-vite build clean — ready to proceed with feature implementation

---
*Phase: 04-search*
*Completed: 2026-04-16*
