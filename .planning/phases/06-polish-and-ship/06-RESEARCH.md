# Phase 6: Polish & Ship — Research

**Researched:** 2026-04-17
**Domain:** Electron app identity, onboarding UX, electron-builder Windows packaging, icon conversion, distribution
**Confidence:** HIGH (core packaging + IPC patterns); MEDIUM (icon license); LOW (peepo note emote license)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Product name: Notal, App ID: com.notal.app, Executable: notal, Version: 0.1.0
- App icon: "peepo note" emote (BetterTTV/7TV) — license check required before use; convert to .ico/.icns/.png
- Onboarding: OnboardingModal.tsx, first-run only, 2-step (welcome + provider setup), onboardingDone flag in electron-conf
- Distribution: Windows NSIS installer + portable zip, manual GitHub Releases publish
- README: developer-focused, under 100 lines, 6 sections listed

### Claude's Discretion
- Exact onboarding copy (headline + body text) — honest and minimal
- Exact icon conversion toolchain (sharp, electron-icon-builder, or manual)
- Whether to add CHANGELOG.md stub
- Portable zip artifact name format

### Deferred Ideas (OUT OF SCOPE)
- macOS / Linux builds
- GitHub Actions CI/CD
- Auto-updater (electron-updater)
- CONTRIBUTING.md
- App Store distribution
</user_constraints>

---

## Summary

Phase 6 is a packaging and polish phase with no new functional features. The work breaks into four independent tracks: (1) app identity update in package.json + electron-builder.yml, (2) icon procurement and conversion, (3) OnboardingModal.tsx implementation with IPC plumbing, and (4) Windows build verification + GitHub release.

The existing IPC infrastructure (electron-conf, ipc.ts handler pattern, preload bridge) is directly reusable for the onboardingDone flag. The electron-builder.yml needs targeted updates to productName, appId, executableName, and win.target to produce both NSIS and zip artifacts. The icon files already exist in build/ (icon.ico, icon.icns, icon.png) as electron-vite defaults — they only need replacement with the Notal icon.

**Primary recommendation:** Replace placeholder identity values (including package.json `name`), implement OnboardingModal mirroring SettingsPanel patterns, configure win.target as ["nsis", "zip"] with explicit artifactName for both, verify build end-to-end. The peepo note emote license is unresolved — use it if it's clearly community-free art, or fall back to a hand-drawn alternative if uncertain.

---

## Standard Stack

### Core (all already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| electron-builder | 26.8.1 (installed) / 26.0.12 (package.json spec) | Windows NSIS + zip packaging | Project's existing packager |
| electron-conf | 1.3.0 | Persistent flag storage (onboardingDone) | Already used for all settings |
| React 19 | 19.2.1 | OnboardingModal component | Project's existing renderer framework |
| TailwindCSS v4 | 4.2.2 | OnboardingModal styling | Project's existing CSS framework |

### Supporting (for icon conversion)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| electron-icon-builder | 2.0.1 (npm current) | PNG → .ico + .icns conversion | If starting from 1024px PNG; generates all sizes |
| png-to-ico | 3.0.1 (npm current) | PNG → .ico only, scriptable | Simpler alternative; fine for Windows-only phase |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| electron-icon-builder | sharp + to-ico | More control, more code; sharp doesn't produce .ico natively |
| png-to-ico | Photoshop / online converter | Manual; no reproducible script |
| OnboardingModal new component | Reuse SettingsPanel directly | SettingsPanel has too much unrelated UI; separate component is cleaner |

**Installation (if icon tool needed):**
```bash
npm install --save-dev electron-icon-builder
# Usage:
./node_modules/.bin/electron-icon-builder --input=/path/to/source-1024.png --output=./build-icons --flatten
# Then copy icon.ico, icon.icns, icon.png to build/
```

---

## Architecture Patterns

### Recommended File Layout for Phase 6
```
build/
├── icon.ico          # Replace with Notal icon (Windows)
├── icon.icns         # Replace with Notal icon (macOS placeholder)
├── icon.png          # Replace with Notal icon (256x256+ PNG)
└── entitlements.mac.plist  # Already present, no changes needed

src/renderer/src/components/
└── OnboardingModal.tsx     # NEW: 2-step modal

src/renderer/src/
└── App.tsx                 # MODIFIED: add onboarding check + state

src/main/
└── ipc.ts                  # MODIFIED: add onboarding:complete handler

src/preload/
├── index.ts                # MODIFIED: expose window.api.onboarding.*
└── index.d.ts              # MODIFIED: add type for window.api.onboarding

package.json                # MODIFIED: name to "notal", version to "0.1.0"
electron-builder.yml        # MODIFIED: productName, appId, executableName, win.target, zip artifactName
README.md                   # NEW
```

### Pattern 1: OnboardingModal — Mirror of SettingsPanel
**What:** Fixed overlay modal, dark theme, same z-index and backdrop as SettingsPanel. Step state managed internally.
**When to use:** Shown from App.tsx when `onboardingDone` flag is absent from electron-conf.

```typescript
// OnboardingModal.tsx — skeleton matching SettingsPanel patterns
import { useState } from 'react'

interface OnboardingModalProps {
  onDismiss: () => void
}

export function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  const [step, setStep] = useState<'welcome' | 'provider'>('welcome')

  async function handleComplete() {
    await window.api.onboarding.complete()  // sets onboardingDone: true in electron-conf
    onDismiss()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#1a1a14] border border-white/10 rounded-md p-5 w-[340px] shadow-xl">
        {step === 'welcome' && <WelcomeStep onNext={() => setStep('provider')} onSkip={handleComplete} />}
        {step === 'provider' && <ProviderStep onComplete={handleComplete} onSkip={handleComplete} />}
      </div>
    </div>
  )
}
```

### Pattern 2: IPC handler for onboardingDone (mirrors existing settings pattern)
**What:** New `ipcMain.handle('onboarding:complete')` that sets a boolean flag in the existing `conf` instance.
**Where:** Add to `registerIpcHandlers()` in `src/main/ipc.ts`.

```typescript
// In ipc.ts — add to conf type declaration:
const conf = new Conf<{
  // ... existing fields ...
  onboardingDone: boolean   // ADD THIS
}>({ name: 'settings' })

// In registerIpcHandlers() — add new handler:
ipcMain.handle('onboarding:complete', () => {
  conf.set('onboardingDone', true)
})

// Add getter for App.tsx to check on mount:
ipcMain.handle('onboarding:getStatus', () => {
  return { done: conf.get('onboardingDone', false) as boolean }
})
```

### Pattern 3: App.tsx onboarding check (useEffect on mount)
**What:** Check onboardingDone status on mount. Show modal if not done.
**Decision rule:** Show OnboardingModal if `onboardingDone === false` (regardless of provider state — simpler, consistent).

```typescript
// App.tsx additions
import { useState, useEffect } from 'react'
import { OnboardingModal } from './components/OnboardingModal'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('notes')
  const [showSettings, setShowSettings] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)  // false by default — no flash

  useEffect(() => {
    window.api.onboarding.getStatus().then(({ done }) => {
      if (!done) setShowOnboarding(true)
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* ... existing JSX ... */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {showOnboarding && <OnboardingModal onDismiss={() => setShowOnboarding(false)} />}
    </div>
  )
}
```

### Pattern 4: electron-builder.yml — NSIS + zip dual target
**What:** Replace placeholder values and add zip target alongside NSIS. Both artifactName values use `${productName}` (not `${name}`) so they are unaffected by any package.json `name` field.

```yaml
appId: com.notal.app
productName: Notal
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - resources/**
  - node_modules/node-llama-cpp/**/*
win:
  executableName: notal
  target:
    - target: nsis
      arch: [x64]
    - target: zip
      arch: [x64]
nsis:
  artifactName: ${productName}-${version}-setup.${ext}
  shortcutName: ${productName}
  uninstallDisplayName: ${productName}
  createDesktopShortcut: always
zip:
  artifactName: ${productName}-${version}-win-portable.${ext}
# mac/linux sections can remain but are not built in this phase
publish:
  provider: generic
  url: https://example.com/auto-updates
```

**Key insight:** NSIS produces `Notal-0.1.0-setup.exe`; zip produces `Notal-0.1.0-win-portable.zip`. Both output to `dist/` after `npm run build:win`. Both use `${productName}` in artifactName so they are stable regardless of what `package.json` `name` is set to.

**Also update package.json:** Change `"name": "ainotepad"` to `"name": "notal"` and `"version": "1.0.0"` to `"version": "0.1.0"`. This is a required step for overall consistency (npm binary name, electron-builder `${name}` fallbacks, GitHub repo naming).

### Pattern 5: Preload + type declaration additions

```typescript
// src/preload/index.ts — add to contextBridge.exposeInMainWorld('api', { ... }):
onboarding: {
  getStatus: (): Promise<{ done: boolean }> =>
    ipcRenderer.invoke('onboarding:getStatus'),
  complete: (): Promise<void> =>
    ipcRenderer.invoke('onboarding:complete'),
},

// src/preload/index.d.ts — add to Window.api interface:
onboarding: {
  getStatus: () => Promise<{ done: boolean }>
  complete: () => Promise<void>
}
```

### Anti-Patterns to Avoid
- **Using `useState` initialization for onboarding**: Don't initialize `showOnboarding` to `true` by default — use `useEffect` + IPC check to avoid flash on repeat launches.
- **Separate electron-conf Conf instance for onboarding**: Use the existing `conf` instance in `ipc.ts` — creating a new `Conf({ name: 'onboarding' })` introduces unnecessary file proliferation.
- **Blocking app render waiting for onboarding check**: Show the app immediately; overlay the modal once the IPC check resolves. Don't block the main content.
- **Hardcoding MCP server name in README as ainotepad**: The MCP JSON snippet in SettingsPanel.tsx currently uses `"ainotepad"` as the key — update both the Settings UI and README to use `"notal"`.
- **Using `${name}` in artifactName**: Always use `${productName}` in electron-builder artifactName to guarantee human-readable output filenames regardless of the npm package name.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NSIS installer creation | Custom NSIS scripts | electron-builder nsis target | electron-builder abstracts all NSIS scripting |
| ICO multi-size bundling | Manual pixel editing | electron-icon-builder or png-to-ico | ICO format requires multiple embedded sizes (16, 32, 48, 64, 128, 256) |
| Persistent first-launch flag | localStorage / SQLite column | electron-conf (existing conf instance) | electron-conf already in use; consistent with settings pattern |
| Provider selection UI in onboarding | New radio input implementation | Copy structure from SettingsPanel.tsx | API_PROVIDERS array and radio pattern already exist |

---

## Common Pitfalls

### Pitfall 1: productName vs name mismatch
**What goes wrong:** `package.json` `name` field is `ainotepad`; if electron-builder.yml `productName` is not set, the installer title, shortcut, and uninstall entry will show "ainotepad" not "Notal".
**How to avoid:** Set `productName: Notal` in electron-builder.yml explicitly. The `package.json` `name` field drives npm but electron-builder reads `productName` for display. The `executableName: notal` field sets the `.exe` name.
**Warning signs:** Build output file named `ainotepad-...` instead of `Notal-...`.

### Pitfall 2: artifactName using `${name}` instead of `${productName}`
**What goes wrong:** electron-builder's default artifactName template uses `${name}` which reads from `package.json` `name`. If the NSIS artifactName template uses `${name}`, the output file will be `ainotepad-0.1.0-setup.exe` even if `productName: Notal` is set. Same applies to the zip target.
**How to avoid:** Always use `${productName}` in all artifactName fields. The yml pattern in Pattern 4 above uses `${productName}` throughout — do not deviate from this.
**Warning signs:** dist/ output files contain "ainotepad" in filename instead of "Notal".

### Pitfall 3: zip target default artifactName is not `*-win-portable.zip`
**What goes wrong:** The zip target's default `artifactName` is `${productName}-${version}.${ext}` — no `-win-portable` suffix. Without an explicit `zip.artifactName`, the zip output file will be `Notal-0.1.0.zip`, which is ambiguous (looks like a source archive, not a portable build).
**How to avoid:** Set `zip.artifactName: ${productName}-${version}-win-portable.${ext}` explicitly in electron-builder.yml. This is included in the Pattern 4 yml above.

### Pitfall 4: onboarding flash on subsequent launches
**What goes wrong:** `showOnboarding` initialized to `true` causes 1-frame flash before IPC resolves.
**How to avoid:** Initialize `showOnboarding` to `false`; set to `true` only after IPC confirms `done === false`.

### Pitfall 5: MCP server name "ainotepad" in SettingsPanel not updated
**What goes wrong:** SettingsPanel.tsx has hardcoded `"ainotepad"` in the MCP JSON snippet. After rename, this is inconsistent. Users copy this config to Claude Code.
**How to avoid:** Update the SettingsPanel.tsx MCP section to use `"notal"` as the server name. README should match.

### Pitfall 6: Icon file in build/ not replaced
**What goes wrong:** electron-vite scaffolds icon.ico, icon.icns, icon.png with the Electron default icon. If these are not replaced, the packaged app shows the Electron logo in the taskbar and NSIS installer.
**How to avoid:** Replace all three files in build/ before running `npm run build:win`. The files already exist at correct paths — just overwrite.

### Pitfall 7: npmRebuild: false may cause issues
**What goes wrong:** Current electron-builder.yml has `npmRebuild: false`. For production Windows builds, native modules (better-sqlite3, node-llama-cpp) must be rebuilt against Electron's node version. The project uses a postinstall hook (`electron-rebuild`) for dev, but electron-builder's own rebuild is disabled.
**Why it's set:** The postinstall already handles rebuild; double-rebuilding caused issues in earlier phases.
**Recommendation:** Leave `npmRebuild: false` as-is — the postinstall rebuild is sufficient. Document this in the plan so implementers don't "fix" it.

### Pitfall 8: peepo note emote license uncertainty
**What goes wrong:** Using a community emote image in an MIT open-source app without clear license could create copyright issues.
**What we know:** 7TV's terms indicate uploaded emotes remain the uploader's IP. 7TV grants the platform a license, but doesn't grant third-party app authors rights to use emote images. The peepo character itself derives from Pepe the Frog (Matt Furie), which has a complex history but is generally tolerated for non-commercial community use.
**Recommendation:** If the emote's uploader or the source image cannot be traced to a clearly permissive license (CC0, CC-BY, or "free to use" statement), create a simple hand-drawn alternative. A minimalist notepad icon (clean geometric, no character) is fully safe and can be created with any raster editor.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing electron-conf pattern (from ipc.ts)
```typescript
// Pattern already in ipc.ts — onboardingDone fits directly into this conf instance
const conf = new Conf<{
  provider: string
  apiKeyEncrypted: string
  // ... other fields
  onboardingDone: boolean  // ADD: new field, defaults false via conf.get()
}>({ name: 'settings' })

// Reading with default false (electron-conf returns undefined for missing keys):
const done = conf.get('onboardingDone', false) as boolean
```

### SettingsPanel overlay pattern (from SettingsPanel.tsx line 78-82)
```tsx
// Exact overlay CSS pattern to mirror in OnboardingModal:
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
>
  <div className="bg-[#1a1a14] border border-white/10 rounded-md p-5 w-[340px] shadow-xl max-h-[90vh] overflow-y-auto">
```

### Provider list reuse (from SettingsPanel.tsx lines 7-14)
```typescript
// API_PROVIDERS array and ProviderId type can be extracted to a shared module
// or copied verbatim into OnboardingModal.tsx
const API_PROVIDERS = [
  { id: 'claude',      label: 'Claude',       placeholder: 'sk-ant-...' },
  { id: 'openai',      label: 'OpenAI',        placeholder: 'sk-...' },
  // ... etc
] as const
```

### electron-builder win.target multi-target syntax (verified from official docs)
```yaml
win:
  executableName: notal
  target:
    - target: nsis
      arch: [x64]
    - target: zip
      arch: [x64]
```

---

## Current State Analysis

### What's Already Done (No Changes Needed)
- `build/` directory exists with icon.ico, icon.icns, icon.png (need content replacement, not creation)
- `npm run build:win` script exists and is wired correctly
- electron-builder 26.8.1 installed (supports all required targets)
- electron-conf in use for settings — onboardingDone trivially added
- IPC plumbing patterns established — onboarding handlers follow the same structure
- SettingsPanel.tsx provides the complete visual and behavioral template for OnboardingModal

### What Needs Building
1. `package.json` — change name to `"notal"`, version to `"0.1.0"` (REQUIRED — see Pitfall 2)
2. `electron-builder.yml` — replace placeholder identity values, add zip target, set explicit artifactName for both nsis and zip using `${productName}`
3. `build/icon.*` — replace with Notal icon (source from peepo note or create alternative)
4. `OnboardingModal.tsx` — new component (SettingsPanel is the template)
5. `ipc.ts` — add `onboarding:complete` + `onboarding:getStatus` handlers + `onboardingDone` to Conf type
6. `src/preload/index.ts` + `index.d.ts` — expose `window.api.onboarding.*`
7. `App.tsx` — add useEffect check + showOnboarding state
8. `SettingsPanel.tsx` — rename MCP server key from "ainotepad" to "notal" in the inline JSON snippet
9. `README.md` — new file

### What npm run build:win Produces (Current)
Running `npm run build:win` runs: `npm run build` (typecheck + electron-vite build) → `electron-builder --win`. Currently produces only NSIS (.exe) because the yml has no explicit target list (defaults to nsis). After adding `target: [nsis, zip]` with explicit artifactNames, it will produce:
- `dist/Notal-0.1.0-setup.exe` (NSIS installer)
- `dist/Notal-0.1.0-win-portable.zip` (portable zip)

---

## Open Questions

1. **Peepo note emote license**
   - What we know: 7TV emotes are user-uploaded; platform ToS doesn't grant downstream usage rights; peepo character has complex IP history
   - What's unclear: Whether the specific emote has a free-use declaration from its creator
   - Recommendation: Check the specific emote page on 7TV for attribution/license note. If unresolvable, use a hand-drawn simple notepad icon (safe, no dependency).

2. **OnboardingModal provider step — full provider list or simplified?**
   - Full list (all 8 options like SettingsPanel): comprehensive but may overwhelm first-time users
   - Simplified (Ollama highlighted + Claude/OpenAI): cleaner onboarding experience
   - Recommendation: Claude's discretion — the CONTEXT.md says "same provider list as SettingsPanel" so implement the full list but highlight Ollama.

---

## Validation Architecture

> nyquist_validation not found in config — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — no jest.config, vitest.config, or test/ directory |
| Config file | None |
| Quick run | `npm run typecheck` (type safety only) |
| Full suite | `npm run build:win` (end-to-end build smoke test) |

### Phase Requirements → Test Map
| Requirement | Behavior | Test Type | Command | Notes |
|-------------|----------|-----------|---------|-------|
| App identity | productName=Notal in built exe | manual | Run build, inspect NSIS installer title | |
| onboardingDone flag | Not shown on 2nd launch | manual | Launch app twice; modal only appears once | |
| OnboardingModal renders | Modal appears on first launch | manual | Fresh userData launch | |
| Skip closes modal | Modal dismisses without saving | manual | Click skip/close | |
| NSIS artifact | `Notal-0.1.0-setup.exe` produced | manual | `npm run build:win`, check dist/ | |
| Zip artifact | `Notal-0.1.0-win-portable.zip` produced | manual | `npm run build:win`, check dist/ | |
| TypeScript validity | No type errors | automated | `npm run typecheck` | Run after all code changes |

### Wave 0 Gaps
No test framework to configure. TypeScript compilation (`npm run typecheck`) is the automated gate. Manual smoke testing covers functional verification.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/main/ipc.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/SettingsPanel.tsx`, `src/preload/index.ts`, `src/preload/index.d.ts`, `electron-builder.yml`, `package.json`
- [electron-builder Windows targets](https://www.electron.build/win.html) — verified win.target syntax
- [electron-builder icons](https://www.electron.build/icons.html) — icon format requirements (minimum 256x256, .ico for Windows)

### Secondary (MEDIUM confidence)
- [electron-icon-builder GitHub](https://github.com/safu9/electron-icon-builder) — input/output requirements verified
- [electron-builder configuration](https://www.electron.build/configuration.html) — artifactName template vars (`${productName}`, `${version}`, `${ext}`)
- npm registry: `npm view electron-builder version` → 26.8.1 confirmed

### Tertiary (LOW confidence)
- [7TV Terms of Service](https://7tv.app/legal/terms) — page content inaccessible; license conclusion based on general platform ToS patterns
- peepo note emote license — unresolved; no authoritative source found

---

## Metadata

**Confidence breakdown:**
- electron-builder NSIS + zip config: HIGH — docs confirmed, existing yml in hand
- OnboardingModal implementation: HIGH — patterns directly from existing SettingsPanel code
- IPC onboarding flag: HIGH — mirrors existing electron-conf usage in ipc.ts verbatim
- Icon format requirements: HIGH — official docs confirmed
- Icon conversion toolchain: MEDIUM — electron-icon-builder verified via GitHub
- peepo note emote license: LOW — unresolvable without emote-specific attribution

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable ecosystem — electron-builder, electron-conf)
