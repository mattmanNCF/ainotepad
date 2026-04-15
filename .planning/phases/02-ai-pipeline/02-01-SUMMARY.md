---
phase: 02-ai-pipeline
plan: "01"
subsystem: dependencies-schema
tags: [ai, schema, drizzle, sqlite, typescript]
dependency_graph:
  requires: []
  provides: [organizedText-column, ai-sdk-deps, note-record-types]
  affects: [02-02, 02-03, 02-04]
tech_stack:
  added:
    - "@anthropic-ai/sdk ^0.89.0"
    - "openai ^6.34.0"
    - "electron-conf ^1.3.0"
  patterns:
    - "Idempotent ALTER TABLE migration in try-catch before drizzle()"
    - "Forward-compatible preload type stubs for future plans"
key_files:
  created: []
  modified:
    - package.json
    - drizzle/schema.ts
    - src/main/db.ts
    - src/preload/index.d.ts
    - src/renderer/src/components/NoteCard.tsx
    - src/renderer/src/components/NotesTab.tsx
decisions:
  - "All three AI packages installed in dependencies (not devDependencies) — electron-builder only bundles dependencies in production"
  - "ALTER TABLE migration wrapped in try-catch for idempotency across app launches"
  - "preload/index.d.ts includes optional stubs for onAiUpdate and settings to keep plans 02-02 and 02-04 type-safe from day one"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 6
---

# Phase 02 Plan 01: AI Dependencies and Schema Extension Summary

Installed three AI runtime packages and extended the SQLite schema, Drizzle ORM definition, and all NoteRecord TypeScript interfaces with the `organizedText` column that the AI worker pipeline (plans 02-02 through 02-04) will populate.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install AI dependencies | bd1a2d7 | package.json, package-lock.json |
| 2 | Add organizedText to schema and all interfaces | 5b9895d | drizzle/schema.ts, src/main/db.ts, src/preload/index.d.ts, NoteCard.tsx, NotesTab.tsx |

## What Was Installed

| Package | Version | Purpose |
|---------|---------|---------|
| @anthropic-ai/sdk | ^0.89.0 | Claude API client for AI worker |
| openai | ^6.34.0 | OpenAI API client for AI worker |
| electron-conf | ^1.3.0 | Persistent settings storage (API keys, provider) |

All three installed as `dependencies` (not `devDependencies`) — electron-builder only packages `dependencies` into the production app.

## Files Modified

**drizzle/schema.ts** — Added `organizedText: text('organized_text')` after `aiAnnotation`. Full column list: id, rawText, submittedAt, aiState, aiAnnotation, organizedText.

**src/main/db.ts** — Added idempotent inline migration immediately after CREATE TABLE block, before `_db = drizzle(...)`:
```typescript
try {
  sqlite.exec('ALTER TABLE notes ADD COLUMN organized_text TEXT')
} catch {
  // Column already exists — safe to ignore
}
```

**src/preload/index.d.ts** — Extended NoteRecord with `organizedText: string | null`. Added optional forward stubs `onAiUpdate` and `settings` to Window.api so plans 02-02 and 02-04 compile without additional type changes.

**NoteCard.tsx** — NoteRecord interface extended with `organizedText: string | null` (type only; rendering deferred to later plan).

**NotesTab.tsx** — NoteRecord interface extended with `organizedText: string | null`; optimistic object in `handleSubmit` includes `organizedText: null`.

## TypeScript Check Result

`npm run typecheck` exits with code 0 — zero errors across both `typecheck:node` and `typecheck:web`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- drizzle/schema.ts contains `organizedText` — FOUND
- src/main/db.ts contains `ALTER TABLE notes ADD COLUMN organized_text TEXT` — FOUND
- src/preload/index.d.ts contains `organizedText` — FOUND
- NoteCard.tsx contains `organizedText` — FOUND
- NotesTab.tsx contains `organizedText` — FOUND
- Commits bd1a2d7 and 5b9895d — FOUND
- `npm run typecheck` — PASSED
