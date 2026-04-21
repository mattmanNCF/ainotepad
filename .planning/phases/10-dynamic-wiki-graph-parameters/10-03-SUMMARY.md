---
phase: 10-dynamic-wiki-graph-parameters
plan: "03"
subsystem: graph-params-panel
tags: [react, radix-ui, d3-force, presets, undo-history, keyboard-shortcut]
dependency_graph:
  requires: [Plans-10-01, Plans-10-02]
  provides: [PRESETS-constant, PRESET_ORDER, preset-buttons, Reset-button, undo-history-stack, Ctrl+Z-undo]
  affects: [Plans-10-04, Phase-11-settings-integrations]
tech_stack:
  added: []
  patterns:
    - "PRESETS record + PRESET_ORDER readonly tuple for stable UI render order"
    - "historyRef (useRef<GraphParams[]>) for undo stack — mutations don't trigger re-renders"
    - "pushHistoryAndSet shared helper: pushes prev onto stack (slice to HISTORY_CAP) then setState"
    - "Ctrl+Z scoped via document keydown + closest('[data-graph-params-panel]') focus check"
    - "data-graph-params-panel attribute on outermost panel wrapper div for focus-scope selector"
key_files:
  created: []
  modified:
    - src/renderer/src/types/graphParams.ts
    - src/renderer/src/components/GraphParamsPanel.tsx
    - src/renderer/src/components/WikiPane.tsx
    - src/renderer/src/components/WikiGraph.tsx
    - src/renderer/src/components/WikiTab.tsx
decisions:
  - "Tasks 2/3/4-wiring folded into one commit to keep typecheck green (same sequencing pattern as Plan 10-02 deviation #3)"
  - "History-push granularity: tick-level (every onValueChange tick during slider drag). Plan 10-04 free to refine to commit-only (push on pointer release) if undo UX feels coarse"
  - "DEFAULT_GRAPH_PARAMS imported in GraphParamsPanel but used only via void statement — placeholder import for Plan 10-04 tooltip/aria-description work; avoids re-edit of panel file later"
  - "Ctrl+Z focus-scope uses closest('[data-graph-params-panel]') on document.activeElement — cleaner than onKeyDown on a wrapper because GraphParamsPanel renders inside WikiGraph's relative container"
metrics:
  duration: "~3 minutes"
  completed_date: "2026-04-21"
  tasks_completed: 4
  files_modified: 5
---

# Phase 10 Plan 03: Presets, Reset, and Ctrl+Z Undo Summary

Add 3 named presets (Dense, Spacious, Hierarchical), an always-visible Reset button, and a 10-entry Ctrl+Z undo history to the graph parameters panel, closing GRAPH-UX-01.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Define PRESETS constant and PRESET_ORDER in graphParams types | 7639c00 | src/renderer/src/types/graphParams.ts |
| 2 | Add preset buttons + Reset button to GraphParamsPanel | 6c3b232 | src/renderer/src/components/GraphParamsPanel.tsx |
| 3 | WikiTab history stack (max 10) + Ctrl+Z undo scoped to panel focus | 6c3b232 | src/renderer/src/components/WikiTab.tsx |
| 4 | Forward preset/reset callbacks through WikiPane → WikiGraph → GraphParamsPanel + data attribute | 361288f | WikiPane.tsx, WikiGraph.tsx, GraphParamsPanel.tsx |

## Final Preset Values

| Preset | linkForce | centerForce | repelForce | edgeThickness | nodeSize |
|--------|-----------|-------------|------------|---------------|----------|
| Dense | 2.0 | 1.5 | 0.5 | 1.2 | 0.8 |
| Spacious | 0.6 | 0.3 | 2.2 | 0.8 | 1.1 |
| Hierarchical | 1.8 | 0.2 | 1.5 | 1.0 | 1.0 |

Values are first-pass targets from roadmap intent. Plan 10-04 is free to tune literals after visual testing on a live fixture.

## History-Push Granularity

**Tick-level (every onChange).** Each slider `onValueChange` tick calls `pushHistoryAndSet`, so a fast drag fills history slots rapidly. This satisfies the requirement text literally ("last 10 parameter changes") but may feel coarse during undo. Plan 10-04 may refine to commit-only (push once on pointer release / `onValueCommit`) — if so, the `onDragEnd` callback from Plan 10-02 can be repurposed to push the start-of-drag snapshot.

Similarly, typing into a numeric input pushes a history entry on each keystroke. Plan 10-04 can add a debounced-commit pattern if needed.

## Ctrl+Z Focus-Scope Mechanism

Handler attached via `document.addEventListener('keydown', ...)` in a WikiTab `useEffect`. The handler fires only when:
1. `e.ctrlKey || e.metaKey` is true
2. `e.shiftKey` is false (excludes redo / excludes global `CommandOrControl+Shift+Space` shortcut)
3. `e.key.toLowerCase() === 'z'`
4. `document.activeElement.closest('[data-graph-params-panel]')` is truthy

The `data-graph-params-panel=""` attribute is placed on the outermost wrapper div of `GraphParamsPanel` — the div that wraps both the collapsed pill and the expanded card. This means `closest(...)` matches from any focusable descendant (slider thumb, numeric input, preset button, Reset button, or the collapsed pill toggle).

Typing Ctrl+Z in CaptureBuffer or any other text input will NOT affect graph params because `closest('[data-graph-params-panel]')` returns null for those elements.

## Edge Cases

**Clicking a preset twice in a row:** Each click fires `pushHistoryAndSet`, so the first click pushes the pre-preset state and applies the preset; the second click pushes the (identical) preset state and re-applies the same preset. Result: two history entries, both undoable. This is benign — second Ctrl+Z restores to the pre-preset state, as expected.

**Pressing Reset while already at defaults:** Pushes DEFAULT_GRAPH_PARAMS onto history (even though it's the current value). One "wasted" history slot; not harmful.

**Panel collapsed state on WikiGraph remount (from Plan 10-02):** The panel resets to expanded state when tag colors change (colorKey-triggered remount). History in WikiTab's `historyRef` survives the remount because it lives in WikiTab, not in GraphParamsPanel.

## Deviations from Plan

### Auto-fixed Issues (Sequencing)

**1. [Sequencing] Tasks 2/3/4-wiring folded into one commit to keep typecheck green**
- **Found during:** Task 2 typecheck after adding `onPresetClick`/`onReset` to `GraphParamsPanelProps`
- **Issue:** WikiGraph passes props to GraphParamsPanel; adding required props to the panel immediately broke WikiGraph typecheck. Same pattern as Plan 10-02 deviation #3.
- **Fix:** Extended `WikiGraph.tsx`, `WikiPane.tsx` prop interfaces (Task 4 Steps A+B) in the same commit as Tasks 2+3. Task 4's final commit is only the `data-graph-params-panel` attribute.
- **Files modified:** GraphParamsPanel.tsx, WikiGraph.tsx, WikiPane.tsx, WikiTab.tsx
- **Commit:** 6c3b232

## Self-Check: PASSED

- src/renderer/src/types/graphParams.ts: FOUND (PRESETS + PRESET_ORDER)
- src/renderer/src/components/GraphParamsPanel.tsx: FOUND (onPresetClick, onReset, data-graph-params-panel)
- src/renderer/src/components/WikiTab.tsx: FOUND (historyRef, HISTORY_CAP, pushHistoryAndSet, Ctrl+Z handler)
- src/renderer/src/components/WikiPane.tsx: FOUND (onGraphParamsPresetClick, onGraphParamsReset forwarded)
- src/renderer/src/components/WikiGraph.tsx: FOUND (onGraphParamsPresetClick, onGraphParamsReset forwarded)
- Commits 7639c00, 6c3b232, 361288f: verified via git log
- npm run typecheck: PASSED
- npm run build: PASSED
