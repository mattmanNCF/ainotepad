---
status: partial
phase: 07-note-card-visual-redesign
source: [07-VERIFICATION.md]
started: 2026-04-17T00:00:00.000Z
updated: 2026-04-17T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Compact card visual layout
expected: Cards render at ~120px tall in a dense grid; text is truncated to 3 lines with a soft fade gradient at the bottom (no hard cut); grid has tighter spacing than before
result: [pending]

### 2. Historical tag colors at launch
expected: On fresh app launch (before submitting any new notes), all existing notes show colored left borders and colored dot indicators matching their wiki tag colors; untagged notes show gray (#6b7280) border
result: [pending]

### 3. Hover expand without layout reflow
expected: Hovering a card opens a 300x300px overlay at the card's position; all other cards stay exactly where they are (no layout shift); overlay shows full rawText, AI divider line, aiAnnotation and aiInsights
result: [pending]

### 4. Card-to-overlay cursor transit
expected: Moving cursor from the compact card onto the expanded overlay keeps the overlay open (does not close during transit); moving cursor fully away from overlay closes it after ~120ms
result: [pending]

### 5. PAT-01 — Patterns tab at 800x600
expected: At 800x600 window size, the Patterns tab shows: period toggle, word cloud, AI narrative, AND stats pills — all visible without scrolling
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
