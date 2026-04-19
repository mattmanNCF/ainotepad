---
phase: quick-260418-vru
plan: 01
subsystem: wiki-graph
tags: [wiki, graph, frontmatter, tags, dead-code-removal]
dependency_graph:
  requires: []
  provides: [shared-tag-graph-edges]
  affects: [WikiTab.tsx]
tech_stack:
  added: []
  patterns: [useMemo-from-files-state]
key_files:
  modified:
    - src/renderer/src/components/WikiTab.tsx
decisions:
  - "Use files[].tags parsed from frontmatter directly — no new IPC call needed; tags already loaded in files state"
  - "Case-insensitive tag matching via .toLowerCase() on both sides"
  - "Deduplicate edges using sorted-pair key joined by null byte"
metrics:
  duration: "5m"
  completed: "2026-04-18"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260418-vru: Fix Wiki Graph Edges — Shared-Tag Linking

**One-liner:** Replaced broken co-occurrence graph linking (required unreliable allTags IPC) with direct shared-frontmatter-tag linking using the already-loaded `files` state — no new IPC needed.

## What Was Done

Rewrote `WikiTab.tsx` graph edge logic in a single task:

- **Deleted** `buildCooccurrenceLinks` (28 lines) — depended on `allNoteTags` state loaded via `window.api.notes.allTags()`, which was unreliable
- **Deleted** `allNoteTags` useState declaration
- **Deleted** the `useEffect` that called `window.api.notes.allTags()` and subscribed to `onAiUpdate`
- **Added** `buildSharedTagLinks(files: KbFileEntry[])` — groups node IDs by lowercased tag, emits one deduped edge per pair of pages sharing a tag
- **Simplified** `graphLinks` useMemo to `useMemo(() => buildSharedTagLinks(files), [files])` — updates whenever KB reloads, no extra state

## Verification

- `npx tsc --noEmit` — passed with no errors
- `allNoteTags` — not referenced anywhere in WikiTab.tsx after removal
- `buildCooccurrenceLinks` — removed entirely
- `window.api.notes.allTags` — no longer called from WikiTab

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| ec4a651 | fix(wiki): replace co-occurrence with shared-tag linking for graph edges |

## Self-Check: PASSED

- `src/renderer/src/components/WikiTab.tsx` — exists and modified
- Commit `ec4a651` — present in git log
- No `allNoteTags` references remain in WikiTab.tsx
- `buildSharedTagLinks` function present and called in `graphLinks` useMemo
