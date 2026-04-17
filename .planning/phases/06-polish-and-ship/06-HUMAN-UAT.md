---
status: partial
phase: 06-polish-and-ship
source: [06-VERIFICATION.md]
started: 2026-04-17T00:00:00Z
updated: 2026-04-17T11:00:00Z
---

## Current Test

Portable zip test pending.

## Tests

### 1. First-run onboarding modal appears
expected: On first launch (fresh install or cleared onboardingDone flag), a 2-step modal appears centered on screen. Step 1 shows "What is Notal?" welcome copy. Step 2 shows provider selection with API key entry.
result: pass

### 2. App title bar shows "Notal" identity
expected: Window title bar reads "Notal" (not "AInotepad" or "Electron"). Taskbar icon shows the geometric notepad icon.
result: pass

### 3. NSIS installer installs correctly
expected: Running dist/Notal-0.1.0-setup.exe installs the app. Windows Start Menu shortcut reads "Notal". Installer window title reads "Notal".
result: pass

### 4. Portable zip launches without install
expected: Extracting dist/Notal-0.1.0-win-portable.zip and running the .exe inside launches Notal without any installation step required.
result: [pending]

## Summary

total: 4
passed: 3
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
