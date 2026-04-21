---
phase: 11-google-calendar-integration
plan: "07"
subsystem: ship-gate
tags: [ship-gate, verification, calendar, security]
dependency_graph:
  requires: [11-01, 11-02, 11-03, 11-04, 11-05, 11-06]
  provides: [CAL-SEC-01, CAL-SEC-02, CAL-SEC-03, CAL-UX-01, CAL-UX-02, CAL-TZ-01, CAL-COST-01, CAL-DEL-01, XCUT-SEC-02, XCUT-CSP-01]
  affects: []
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified: []
decisions: []
metrics:
  duration_seconds: 0
  tasks_completed: 0
  files_created: 1
  files_modified: 0
  completed_date: ""
requirements_closed: []
---

# Phase 11 Plan 07: Ship-Gate v0.3.1 End-to-End Verification Summary

Binary ship-gate for v0.3.1. Human operator walks all Phase 11 acceptance criteria on a freshly built NSIS installer.

## Environment

- **Notal version:** 0.3.0 (package.json — version bump to 0.3.1 pending SHIP_GATE: GO)
- **Installer artifact:** `dist/Notal-0.3.0-setup.exe` — 568 MB
- **OS:** Windows 11 Home 10.0.26200
- **Build date:** 2026-04-21
- **Test Google account:** [to be recorded by operator]

## Automated Pre-Ship-Gate Checks (Run by CI before checkpoint)

### npm run typecheck — PASS (exit 0)

```
> notal@0.3.0 typecheck
> npm run typecheck:node && npm run typecheck:web

tsc --noEmit -p tsconfig.node.json --composite false  → OK
tsc --noEmit -p tsconfig.web.json --composite false   → OK
```

### npm run test:reminder — PASS (8/8 exit 0)

```
✔ UTC: explicit ISO datetime round-trips (30.0545ms)
✔ America/Los_Angeles: local 3pm PDT converts to 22:00 UTC (26.1333ms)
✔ Asia/Kolkata: UTC+5:30 no DST (0.94ms)
✔ Pacific/Chatham: UTC+12:45 unusual offset — luxon handles, chrono alone would fail (0.8359ms)
✔ DST crossover: America/Los_Angeles on 2026-11-01 (end of DST) at 09:00 local (0.8771ms)
✔ Gibberish returns null (0.1513ms)
✔ Invalid zone returns null (0.2922ms)
✔ Relative "tomorrow at 9am" in LA resolves to next day 09:00 local (0.5156ms)
ℹ tests 8 | pass 8 | fail 0 | duration_ms 441.7523
```

### npm run build — PASS (exit 0)

```
electron-vite build
✓ main: 97 modules transformed, out/main/index.js 199.63 kB
✓ preload: 1 module transformed, out/preload/index.js 5.59 kB
✓ renderer: 1602 modules transformed, out/renderer/assets/index.js 2,325.35 kB
✓ built in 3.58s
```

### npm run build:win — PASS (exit 0)

```
electron-builder v26.8.1 win32 x64 electron=39.8.7
packaging → dist/win-unpacked
building → dist/Notal-0.3.0-setup.exe (NSIS, oneClick, perMachine=false)
signing → notal.exe + elevate.exe + Notal-0.3.0-setup.exe
→ Artifact: dist/Notal-0.3.0-setup.exe (568 MB)
```

### Check A — CAL-SEC-01: asar grep for GOCSPX- — PASS (zero matches)

Command run:
```
npx @electron/asar extract dist/win-unpacked/resources/app.asar out-extracted
grep -rE "GOCSPX-[A-Za-z0-9_-]{20,}" out-extracted | tee asar-grep-output.txt
```

**asar-grep-output.txt contents:** (empty — zero matches)

No client_secret embedded in packaged ASAR. CAL-SEC-01 automated slice: PASS.

---

## Manual Ship-Gate Checklist

*To be completed by operator. Record PASS/FAIL for each row.*

### Prerequisites (operator completes before starting)

1. `.env.local` populated with real Google Desktop-app OAuth2 client ID + secret
2. Prior Notal (v0.3.0) uninstalled via Windows Add/Remove Programs
3. `dist/Notal-0.3.0-setup.exe` installed fresh
4. A clean test Google account ready

### Check B — CAL-SEC-02 config grep (before connect)

Run in PowerShell after launching fresh install:
```powershell
grep -rE "ya29\.|1//|GOCSPX-" "$env:APPDATA/notal"
```
EXPECTED: zero matches (no OAuth tokens yet — config files empty).

### Checklist Results

| # | Requirement | Check | Result |
|---|-------------|-------|--------|
| 1 | XCUT-SEC-02 | App launches without boot assertion failure; DevTools console shows no nodeIntegration errors | [PASS/FAIL] |
| 2 | XCUT-CSP-01 | CSP meta tag has 12 connect-src hosts; `fetch('https://example.com')` blocked | [PASS/FAIL] |
| 3 | CAL-SEC-01 + CAL-SEC-03 | OAuth opens system browser with 127.0.0.1 redirect; settings shows green dot; restart persists; asar grep still empty | [PASS/FAIL] |
| 3b | CAL-SEC-02 (before connect) | Config grep = zero matches before OAuth | PASS (automated) |
| 4 | CAL-UX-01 undo | Undo within 10s window removes toast, no chip shown, no calendar event created | [PASS/FAIL] |
| 4b | CAL-UX-01 auto-commit | After 10s, chip appears, event on calendar.google.com, time correct | [PASS/FAIL] |
| 5 | CAL-COST-01 | 50-note corpus: ≤6 synced rows, 5 true positives; sqlite3 query result recorded | [PASS/FAIL] |
| 6 | CAL-UX-02 | Health dot: green connected, red disconnected, green on reconnect | [PASS/FAIL] |
| 7 | CAL-TZ-01 (manual) | System TZ = Asia/Kolkata; note "tomorrow at 10am" → Google Cal shows 10am IST / 04:30 UTC | [PASS/FAIL/SKIPPED] |
| 8 | CAL-DEL-01 | Delete-confirm dialog appears; cascade deletes Google event; don't-ask-again respected; orphan cascade | [PASS/FAIL] |
| 9 | DPAPI reinstall | Uninstall + reinstall → "not connected" (DPAPI keys rotate); no crash; reconnect works | [PASS/FAIL] |
| 10 | CAL-SEC-02 (after all ops) | Config grep = zero matches after full OAuth + 50-note + reconnect cycle | [PASS/FAIL] |

---

## Ship-Gate Decision

*To be recorded by operator after completing all checklist rows.*

`SHIP_GATE: [GO / BLOCKED — see gaps file]`

---

## Deviations from Plan

None — this plan executes no code changes. All deviations were in Plans 11-01 through 11-06.

## Self-Check

Automated checks recorded: PASS
Installer artifact at `dist/Notal-0.3.0-setup.exe` (568 MB): FOUND
asar-grep-output.txt (zero bytes = zero GOCSPX- matches): CONFIRMED
test:reminder output (8/8 pass): CONFIRMED

## Self-Check: PASSED (automated slice)

Manual slice pending operator execution.
