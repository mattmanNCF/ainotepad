---
phase: 10-dynamic-wiki-graph-parameters
plan: "01"
subsystem: graph-params-infrastructure
tags: [ipc, electron-conf, preload, types, radix-ui]
dependency_graph:
  requires: []
  provides: [GraphParams-contract, graph-params-ipc, window.api.graphParams]
  affects: [Plans-10-02, Plans-10-03, Plans-10-04, Phase-11-settings-integrations]
tech_stack:
  added: ["@radix-ui/react-slider@1.3.6 (--legacy-peer-deps)"]
  patterns: ["separate electron-conf Conf instance per domain (parallels tagColors.ts)", "ambient .d.ts stays importless to avoid module collision"]
key_files:
  created:
    - src/renderer/src/types/graphParams.ts
    - src/main/graphParams.ts
  modified:
    - src/main/ipc.ts
    - src/preload/index.ts
    - src/preload/index.d.ts
    - package.json
    - package-lock.json
decisions:
  - "@radix-ui/react-slider requires --legacy-peer-deps (same React 19 conflict as react-d3-cloud and sharp)"
  - "GraphParams type file lives in renderer/src/types/ and is imported via import type in main — erased at compile time, no runtime cross-boundary dependency"
  - "index.d.ts inlines the 5-field shape rather than importing GraphParams — keeps file ambient, avoids module-declaration collision"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-04-21"
  tasks_completed: 3
  files_modified: 7
---

# Phase 10 Plan 01: IPC + Persistence Layer for Graph Parameters Summary

Install `@radix-ui/react-slider@1.3.6` and scaffold the IPC + persistence layer for the wiki graph parameters overlay — `GraphParams` interface (5 multiplier fields all defaulting to 1.0), electron-conf module (`graphParams.ts`), two IPC handlers (`graph-params:get` / `graph-params:save`), and `window.api.graphParams.{get,save}` preload surface.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Install @radix-ui/react-slider + define GraphParams contract | 2a74659 | package.json, src/renderer/src/types/graphParams.ts |
| 2 | Create graphParams.ts persistence module + register IPC handlers | ccdf555 | src/main/graphParams.ts, src/main/ipc.ts |
| 3 | Expose graphParams surface in preload + TypeScript declarations | acc45a8 | src/preload/index.ts, src/preload/index.d.ts |

## GraphParams Contract (LOCKED for Plans 02/03/04)

```typescript
export interface GraphParams {
  linkForce: number      // multiplier over baseline link distance/strength
  centerForce: number    // multiplier over d3 center force strength
  repelForce: number     // multiplier over d3 charge (negative) strength
  edgeThickness: number  // multiplier over per-link stroke width
  nodeSize: number       // multiplier over nodeRelSize + canvas radius
}

export const DEFAULT_GRAPH_PARAMS: GraphParams = {
  linkForce: 1.0,
  centerForce: 1.0,
  repelForce: 1.0,
  edgeThickness: 1.0,
  nodeSize: 1.0,
}
```

Slider ranges: `linkForce/repelForce` [0.1–3.0, step 0.05], `centerForce` [0.0–3.0, step 0.05], `edgeThickness/nodeSize` [0.2–3.0, step 0.05].

Import path for Plans 02/03/04: `import { GraphParams, DEFAULT_GRAPH_PARAMS, SLIDER_RANGES, PARAM_LABELS } from '../types/graphParams'`

## New IPC Channels

| Channel | Direction | Handler |
|---------|-----------|---------|
| `graph-params:get` | renderer → main | Returns `GraphParams` (defaults on first call) |
| `graph-params:save` | renderer → main | Persists `GraphParams` via electron-conf |

Persistence file: `%APPDATA%/notal/graphParams.json` (electron userData directory).

## Preload Surface

```typescript
window.api.graphParams.get()   // Promise<GraphParams>
window.api.graphParams.save(params)  // Promise<void>
```

Full TypeScript inference via `src/preload/index.d.ts` (inline shape, no import — stays ambient).

## Dependency Install Note

`@radix-ui/react-slider@1.3.6` required `--legacy-peer-deps` due to React 19 peer dep conflict (same pattern as `react-d3-cloud` and `sharp` noted in STATE.md lines 126, 145). Plan 04 (a11y work, axe-core) should use `--legacy-peer-deps` if any peer conflict appears.

## Deviations from Plan

None — plan executed exactly as written. Install conflict was anticipated and documented in the plan; `--legacy-peer-deps` applied on first retry.

## Self-Check: PASSED

- src/renderer/src/types/graphParams.ts: FOUND
- src/main/graphParams.ts: FOUND
- src/main/ipc.ts graph-params:get handler: FOUND
- src/preload/index.ts graphParams surface: FOUND
- src/preload/index.d.ts graphParams types: FOUND
- Commits 2a74659, ccdf555, acc45a8: FOUND
- npm run typecheck: PASSED
- npm run build: PASSED
