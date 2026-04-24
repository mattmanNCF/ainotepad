---
phase: 12-mobile-extension
plan: "04"
subsystem: ui
tags: [react, tailwindcss, electron, google-drive, mobile-sync, settings-panel]

# Dependency graph
requires:
  - phase: 12-02
    provides: window.api.drive IPC surface (connect, getStatus, checkQuota, onPendingDrained)
provides:
  - DriveMobileSection component: Settings > Integrations > Mobile Sync (Google Drive) section
  - WakeBanner component: transient top-of-app banner reporting ingested mobile notes
  - SettingsPanel updated with DriveMobileSection mounted below GoogleCalendarSection
  - App.tsx updated with WakeBanner mounted alongside UndoToast
affects: [12-05, 12-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Settings sub-section pattern: border-t divider + uppercase tracking-wider header + health dot + inline error"
    - "Fixed-position transient banner: zIndex 9996, auto-dismiss via setTimeout + click-to-dismiss"
    - "IPC subscription in useEffect with cleanup: store unsubscribe return value, call in cleanup fn"

key-files:
  created:
    - src/renderer/src/components/DriveMobileSection.tsx
    - src/renderer/src/components/WakeBanner.tsx
  modified:
    - src/renderer/src/components/SettingsPanel.tsx
    - src/renderer/src/App.tsx

key-decisions:
  - "DriveMobileSection uses neutral-*/bg-blue-600 Tailwind palette (plan-prescribed); intentionally differs from GoogleCalendarSection gray-*/blue-500/20 palette — document for future restyle"
  - "WakeBanner zIndex 9996 (below UndoToast 9997, above modal overlays 50); both fixed-position, no visual overlap"
  - "Mobile PWA URL displayed as static <code> element, no shell.openExternal gateway (calendar.openLink guarded to calendar.google.com)"

patterns-established:
  - "IPC subscription useEffect: const unsubscribe = window.api.X.onY(cb); return () => { cleanup timers; unsubscribe() }"
  - "Drive status refresh: poll on mount + setInterval(30s), refresh after connect action"

requirements-completed:
  - MOB-AUTH-02
  - MOB-UX-02
  - MOB-QUOTA-01

# Metrics
duration: 12min
completed: 2026-04-23
---

# Phase 12 Plan 04: Desktop Renderer UI for Mobile Sync Summary

**Drive sync section in Settings Integrations with health dot, 401 reconnect prompt, and quota gauge; transient WakeBanner reporting drained mobile notes on cold start**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-23T~00:00Z
- **Completed:** 2026-04-23
- **Tasks:** 2 of 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- DriveMobileSection (165 lines): full settings UI for mobile sync — connect/disconnect, health dot (green/yellow/red), last poll timestamp, 401 auth error surfacing with red reconnect prompt, quota gauge with state-colored progress bar (green/amber/red), static PWA URL display
- WakeBanner (54 lines): subscribes to onPendingDrained on mount, shows "Pulled N notes from mobile" green banner for 6 seconds on cold start when N > 0, click-to-dismiss
- SettingsPanel.tsx updated: DriveMobileSection mounted as sibling below GoogleCalendarSection inside Integrations section
- App.tsx updated: WakeBanner mounted alongside UndoToast as fixed-position root-level siblings

## Task Commits

1. **Task 1: DriveMobileSection + SettingsPanel mount** - `9bc2353` (feat)
2. **Task 2: WakeBanner + App.tsx mount** - `2d474db` (feat)

## Files Created/Modified
- `src/renderer/src/components/DriveMobileSection.tsx` — Drive settings section: connect button, health indicator, auth error display, quota gauge with warn/hard-stop coloring
- `src/renderer/src/components/WakeBanner.tsx` — Transient top banner for MOB-UX-02 wake-time drain report
- `src/renderer/src/components/SettingsPanel.tsx` — Added DriveMobileSection import + mount below GoogleCalendarSection
- `src/renderer/src/App.tsx` — Added WakeBanner import + mount alongside UndoToast

## Decisions Made
- DriveMobileSection uses `neutral-*` / `bg-blue-600` Tailwind palette (as prescribed in plan), which differs from GoogleCalendarSection's `gray-*` / `bg-blue-500/20` palette. Both are valid Tailwind v4 classes; the section will look visually distinct. Noted for potential future restyle pass.
- Mobile PWA URL rendered as static `<code>` text (no click-through). `calendar.openLink` is guarded to calendar.google.com URLs; a shell.openExternal gateway is out of scope for this plan — user copies the URL manually.
- WakeBanner at `zIndex: 9996`, below UndoToast (`z-[9997]`) and above modals (`z-50`). Both are fixed-position so DOM order is irrelevant for visual stacking.

## Deviations from Plan

None — plan executed exactly as written. Used the replacement footer (plain `<code>` URL display) rather than the first `openLink` version, as explicitly instructed in the plan's note.

## Issues Encountered
None. Build warnings about dynamic/static import mixing for tokenStore.ts, reminderService.ts, and kb.ts are pre-existing (introduced in Phase 11-12 work) and not caused by this plan.

## User Setup Required
None — no external service configuration required. Drive connection flow is triggered in-app via "Connect Google Drive" button.

## Next Phase Readiness
- Settings > Integrations panel now shows both Google Calendar and Mobile Sync (Drive) sections
- Wake banner wired to onPendingDrained — will fire automatically on cold start after ingestService drains notes
- MOB-AUTH-02, MOB-UX-02, MOB-QUOTA-01 requirements satisfied
- Ready for Phase 12-05 (GitHub Pages deploy pipeline) and 12-06 (final integration)

---
*Phase: 12-mobile-extension*
*Completed: 2026-04-23*
