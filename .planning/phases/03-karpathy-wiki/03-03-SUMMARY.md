---
phase: 03-karpathy-wiki
plan: "03"
subsystem: renderer/wiki-ui
tags: [wiki, react, ui, markdown, force-graph, tag-colors]
dependency_graph:
  requires: [03-02]
  provides: [wiki-tab-ui, notecard-tag-dots]
  affects: [renderer]
tech_stack:
  added:
    - react-markdown@10.1.0
    - remark-wiki-link@2.0.1
    - react-force-graph-2d@1.29.1
    - rehype-raw@7.0.0
  patterns:
    - useRef content cache (prevents infinite re-render loop from useCallback deps)
    - ResizeObserver for ForceGraph2D canvas sizing
    - Native HTML color input for tag color picker (no extra package)
    - remark-wiki-link permalinks list for known/new link distinction
key_files:
  created:
    - src/renderer/src/components/WikiMarkdown.tsx
    - src/renderer/src/components/WikiGraph.tsx
    - src/renderer/src/components/WikiSidebar.tsx
    - src/renderer/src/components/WikiPane.tsx
  modified:
    - src/renderer/src/components/WikiTab.tsx
    - src/renderer/src/components/NoteCard.tsx
    - package.json
    - package-lock.json
decisions:
  - useRef (not useState) for content cache in WikiTab — ref mutations don't invalidate useCallback deps, preventing infinite re-render loop
  - remark-wiki-link permalinks derived from existingFiles array — distinguishes known vs new wiki links
  - ResizeObserver drives explicit width/height props for ForceGraph2D — CSS sizing alone doesn't work for canvas
  - Native <input type="color"> for tag color picker — works in Electron renderer with no extra package
metrics:
  duration_seconds: 173
  completed_date: "2026-04-15"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 8
---

# Phase 03 Plan 03: Wiki UI Components Summary

**One-liner:** Full WikiTab UI with remark-wiki-link Markdown reader, ForceGraph2D graph toggle, color-coded sidebar with native color picker, and NoteCard tag color dots.

## What Was Built

Plan 03-03 delivers the complete renderer-side wiki experience. WikiTab transforms from a placeholder into a functional two-column Obsidian-like reader. NoteCard gains colored tag indicator dots, closing the CONTEXT.md decision that "tag colors propagate across sidebar, graph nodes, and note annotations."

### Components Created

**WikiMarkdown.tsx** — react-markdown renderer with remark-wiki-link plugin. Passes `permalinks` list (filenames without .md) so the plugin correctly marks known vs. new links. Intercepts `wiki-link` class anchors, calling `onNavigate(href + '.md')` on click. External links open in default browser.

**WikiGraph.tsx** — ForceGraph2D canvas wrapper. Uses ResizeObserver on the container div to derive explicit `width`/`height` props — required because ForceGraph2D does not auto-size from CSS. Node colors come from tag color palette; node click calls `onNodeClick(id + '.md')`.

**WikiSidebar.tsx** — Groups concept files by first tag, sorted alphabetically. Each tag section shows a colored square indicator. Right-click on a tag header opens a `position: fixed` popover with a native `<input type="color">`. Files starting with `_` are excluded (hides `_context.md`). Active file gets indigo background with left color border.

**WikiPane.tsx** — Right pane composing WikiMarkdown and WikiGraph with a toolbar. Back (←) and forward (→) buttons are disabled at history bounds. "Graph" button toggles between views with active state styling.

**WikiTab.tsx (replaced)** — 2-column layout owner. Loads all kb files, caches content in `contentCacheRef` (useRef, not useState — critical for preventing infinite loops), derives graph nodes/links from cache, manages history stack with `cursor` index. Subscribes to `window.api.kb.onUpdated` for live sidebar refresh.

### Component Updated

**NoteCard.tsx** — Added `tags` and `tagColors` state. Fetches tag colors on mount via `window.api.kb.getTagColors()` and refreshes when `kb:updated` fires. Subscribes to `window.api.onAiUpdate` to capture tags from AI processing for the specific note ID. Renders a row of small colored circles (w-2 h-2 rounded-full) below annotation text.

## Key Technical Decisions

**useRef for content cache (not useState):** If the content cache were `useState`, updates to it would invalidate `useCallback` deps for `loadFilesWithTags`, causing the `useEffect` to re-subscribe, triggering another load — an infinite loop. `useRef` mutations are transparent to React's dependency tracking. This is the most subtle correctness requirement in the plan.

**remark-wiki-link permalinks:** Without passing the `permalinks` option, all wikilinks render with `newClassName` (red/unresolved styling) even when the concept file exists. The plugin needs the slug list to distinguish known from new links.

**ResizeObserver for graph sizing:** ForceGraph2D requires explicit `width`/`height` integer props on the canvas element. Passing CSS sizing alone produces a 0×0 invisible canvas. ResizeObserver tracks the container's pixel dimensions and feeds them directly.

**Native color picker:** `<input type="color">` renders natively in Electron's Chromium renderer. No react-colorful or similar package needed.

## Deviations from Plan

None — plan executed exactly as written. All components match the specified interfaces and acceptance criteria.

## Build Verification

- `npm run build` exits 0 after all three tasks
- TypeScript typecheck passes for both node and web targets
- No ESM/CJS issues with installed packages
- Bundle size: renderer 1,532 KB (ForceGraph2D + react-markdown are the primary additions)

## Self-Check: PASSED

Created files verified:
- src/renderer/src/components/WikiMarkdown.tsx — FOUND
- src/renderer/src/components/WikiGraph.tsx — FOUND
- src/renderer/src/components/WikiSidebar.tsx — FOUND
- src/renderer/src/components/WikiPane.tsx — FOUND
- src/renderer/src/components/WikiTab.tsx — MODIFIED
- src/renderer/src/components/NoteCard.tsx — MODIFIED

Commits verified:
- d452985: feat(03-03): install wiki packages and create WikiMarkdown + WikiGraph leaf components
- adeffed: feat(03-03): build WikiSidebar, WikiPane, and replace WikiTab with full 2-column layout
- ddc539a: feat(03-03): update NoteCard with colored tag indicator dots
