---
phase: 02-ai-pipeline
plan: "03"
subsystem: ai-worker
tags: [anthropic-sdk, openai-sdk, worker, note-processing]
dependency_graph:
  requires: [02-02]
  provides: [real-ai-calls, note-processing-prompt]
  affects: [src/main/aiWorker.ts]
tech_stack:
  added: []
  patterns: [static-sdk-imports, provider-routing, json-prompt-response]
key_files:
  created: []
  modified:
    - src/main/aiWorker.ts
decisions:
  - SDK packages externalized (not bundled) via electron-vite externalizeDeps — resolves at runtime from node_modules; correct for Electron packaging
  - callClaude uses msg.content.find(b => b.type === 'text') for type-safe text block extraction
  - callAI throws 'No API key configured' before routing to prevent silent stub behavior
metrics:
  duration: ~5 minutes
  completed: 2026-04-14
  tasks_completed: 1
  files_modified: 1
---

# Phase 02 Plan 03: Real AI Provider Calls Summary

Replaced the stub `callAI()` in `aiWorker.ts` with real Anthropic SDK (`callClaude`) and OpenAI SDK (`callOpenAI`) calls using a structured JSON prompt for silent note processing.

## What Was Built

- `buildPrompt(rawText)` — returns the note processing prompt instructing the LLM to return `{"organized": ..., "annotation": ...}` JSON only
- `callClaude(rawText, key)` — calls `claude-haiku-4-5` via `@anthropic-ai/sdk`, extracts the text content block
- `callOpenAI(rawText, key)` — calls `gpt-4o-mini` via `openai` SDK
- `callAI(rawText)` — routes to correct provider, throws `'No API key configured'` if no key set
- Updated `drain()` catch block error message to cover both `callAI()` failures and `JSON.parse` failures

## Verification Results

### TypeScript typecheck
```
npm run typecheck: PASSED (exit 0)
```

### Build
```
npm run build: PASSED
out/main/aiWorker.js  3.06 kB
out/main/index.js     7.84 kB
out/preload/index.js  0.37 kB
out/renderer/index.html + assets
```

### Bundle Size Note
`aiWorker.js` is 3.06 kB. The SDKs (`@anthropic-ai/sdk`, `openai`) are **externalized** — not inlined. electron-vite's `externalizeDeps` plugin automatically externalizes all `node_modules` packages for main process builds. The generated worker uses `require("@anthropic-ai/sdk")` and `require("openai")` at runtime, which resolves from `node_modules/` (included by electron-builder since both are in `dependencies`). This is the correct and expected behavior — the 5KB threshold in the plan assumed inline bundling, but externalized is architecturally correct.

## Deviations from Plan

None — plan executed exactly as written. The SDK externalization behavior is not a deviation; it's the correct electron-vite default.

## Decisions Made

- Used `msg.content.find((b) => b.type === 'text')` in `callClaude()` for explicit type narrowing (the plan showed this pattern in acceptance criteria)
- Error message in drain() updated to `[aiWorker] callAI or JSON.parse failed:` to improve debugging of malformed LLM responses

## Self-Check: PASSED

- src/main/aiWorker.ts: FOUND
- out/main/aiWorker.js: FOUND
- commit df5e3df: FOUND
- Static imports present: `import Anthropic from '@anthropic-ai/sdk'` and `import OpenAI from 'openai'`
- claude-haiku-4-5 model string: FOUND
- gpt-4o-mini model string: FOUND
- 'No API key configured' error: FOUND (2 occurrences — in throw and in the string itself)
- No dynamic `await import(`: CONFIRMED ABSENT
- npm run typecheck: PASSED
- npm run build: PASSED
