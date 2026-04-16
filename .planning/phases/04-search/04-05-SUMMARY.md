---
phase: 04-search
plan: 05
subsystem: ui
tags: [electron, react, safeStorage, electron-conf, ipc, settings, local-model, brave-api]

# Dependency graph
requires:
  - phase: 04-04
    provides: getBraveKey null stub in ipc.ts, localModel.ts with detectModelTier/findExistingModel/getModelStoragePath
  - phase: 04-03
    provides: localModel.ts module, node-llama-cpp integration
provides:
  - getBraveKey() real safeStorage decrypt/encrypt implementation
  - settings:save IPC handler accepting braveKey parameter (encrypted, persisted)
  - settings:get IPC handler returning hasBraveKey boolean and modelTier string
  - localModel:getStatus IPC handler (tier, modelPath, ready)
  - digests:getLatest IPC handler querying digests table by period
  - preload localModel.getStatus() channel
  - preload digest.getLatest() and digest.onUpdated() channels
  - preload onAiUpdate type extended with insights field
  - preload settings.save accepts optional 4th param braveKey
  - SettingsPanel Local (Gemma 4) provider radio (4th option)
  - SettingsPanel hardware tier recommendation for local provider
  - SettingsPanel Brave Search API key input (all providers, clearly optional)
affects: [05-agent-layer, any future digest/search UI consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conf type extended with new fields alongside existing settings — backward compatible"
    - "preload/index.d.ts is the authoritative Window.api type declaration for renderer TypeScript"
    - "canSave logic: ollama and local providers bypass API key requirement"

key-files:
  created: []
  modified:
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
    - src/renderer/src/components/SettingsPanel.tsx

key-decisions:
  - "preload/index.d.ts must be kept in sync with preload/index.ts — renderer TypeScript resolves Window.api types from .d.ts, not from the preload source directly"
  - "settings:get returns hasKey=true for both 'ollama' and 'local' providers (no API key needed)"
  - "settings:save posts modelPath to worker in settings-update message when provider=local"

patterns-established:
  - "Pattern: Window.api type declared in src/preload/index.d.ts; both preload implementation and .d.ts must be updated together"
  - "Pattern: canSave conditional covers both ollama and local as no-key providers"

requirements-completed: [LOCAL-01, INSIGHT-03]

# Metrics
duration: 4min
completed: 2026-04-16
---

# Phase 04 Plan 05: Settings Extension — Local Model + Brave API Key

**Brave key storage via safeStorage, local model provider radio in SettingsPanel, and new IPC channels (localModel:getStatus, digests:getLatest, digest:updated) wired through preload**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-16T07:33:26Z
- **Completed:** 2026-04-16T07:36:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Replaced getBraveKey() null stub with real safeStorage encrypt/decrypt implementation
- Extended settings:save and settings:get with Brave key and model tier fields
- Added localModel:getStatus and digests:getLatest IPC handlers in main process
- Extended preload with localModel, digest namespaces and updated onAiUpdate/settings types
- Added Local (Gemma 4) as 4th provider option in SettingsPanel with tier recommendation UI
- Added Brave Search API key input field (shown for all providers, labeled optional)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend ipc.ts — Brave key storage, local model settings, new IPC handlers** - `c98a71c` (feat)
2. **Task 2: Extend preload and SettingsPanel — new IPC surface, local provider UI** - `4e892b4` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/main/ipc.ts` - getBraveKey() real impl, Conf type extended, settings handlers extended, localModel:getStatus + digests:getLatest handlers added
- `src/preload/index.ts` - localModel/digest namespaces added, onAiUpdate type extended with insights, settings.save/get signatures extended
- `src/preload/index.d.ts` - Window.api type declarations synced with preload implementation
- `src/renderer/src/components/SettingsPanel.tsx` - Local (Gemma 4) radio, model status UI, Brave key input, handleSave extended

## Decisions Made
- `preload/index.d.ts` is authoritative for renderer TypeScript — must be kept in sync with preload source manually; renderer resolves `Window.api` from this .d.ts file
- `settings:get` treats `local` provider same as `ollama` for `hasKey` (no API key required)
- `settings:save` posts `modelPath` in settings-update worker message when `provider === 'local'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated preload/index.d.ts in addition to preload/index.ts**
- **Found during:** Task 2 (typecheck:web failed)
- **Issue:** Renderer TypeScript uses `src/preload/index.d.ts` for `Window.api` type resolution, not the preload source. Plan did not mention this file.
- **Fix:** Updated `src/preload/index.d.ts` to match all new types (localModel, digest, extended settings, extended onAiUpdate)
- **Files modified:** src/preload/index.d.ts
- **Verification:** `npm run typecheck:web` passes (only pre-existing WikiGraph.tsx warning remains)
- **Committed in:** 4e892b4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for TypeScript correctness in renderer. No scope creep.

## Issues Encountered
- `npm run typecheck:web` initially failed because `src/preload/index.d.ts` was not updated alongside `src/preload/index.ts`. Fixed by updating the .d.ts type declarations to match the implementation (Rule 2 auto-fix).
- Pre-existing `WikiGraph.tsx` unused variable warning present before this plan — out of scope, not fixed.

## User Setup Required
None - no external service configuration required. Brave API key field is optional and set via UI.

## Next Phase Readiness
- Settings panel now has full local model provider support and Brave key input
- All IPC channels for local model status and digest notifications are exposed in preload
- Ready for Phase 04-06 (digest renderer UI or next search feature)

---
*Phase: 04-search*
*Completed: 2026-04-16*
