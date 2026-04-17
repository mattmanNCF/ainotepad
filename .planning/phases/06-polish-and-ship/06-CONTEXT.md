# Phase 06: Polish & Ship — Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Onboarding, packaging, and distribution of Notal (formerly AInotepad) v0.1.0.

Delivers:
- First-run onboarding modal (shown automatically when no provider is configured)
- App identity finalized: product name, app ID, version, icon
- Windows packaging: NSIS installer + portable zip via electron-builder
- README covering concept, install, provider setup, and MCP agent connection

Does NOT deliver:
- macOS or Linux builds (Windows only for this phase)
- Automated GitHub Actions CI/CD (manual publish for v1)
- Auto-updater wiring (publish URL placeholder left in electron-builder.yml)
- Any new features beyond what's already built in phases 01-05

</domain>

<decisions>
## Implementation Decisions

### App Identity
- **Product name:** Notal
- **App ID:** com.notal.app
- **Executable name:** notal
- **Version:** 0.1.0 (honest pre-1.0 versioning)
- **electron-builder.yml updates:** productName, appId, executableName, artifactName patterns all updated to reflect Notal

### App Icon
- Use the "peepo note" emote image as the app icon
- Source the image from the community (check BetterTTV/7TV for a freely-usable version; confirm license is compatible with MIT open source)
- Convert to required formats: .ico (Windows), .icns (macOS placeholder), .png (Linux/fallback)
- Place in `build/` directory as expected by electron-builder

### Onboarding Flow
- **Trigger:** On first launch, check if any API key or Ollama provider is configured. If no provider is configured (i.e., `settings.get()` returns no key and provider is ollama with offline Ollama), show the onboarding modal automatically.
- **Form:** A centered modal overlay (same visual treatment as SettingsPanel — dark bg, border, rounded)
- **Steps:**
  1. **Welcome step:** Brief "What is Notal?" — one sentence on the silent AI pipeline concept (write a note, AI organizes it, builds your wiki automatically). No prompts, no chatting.
  2. **Provider setup step:** Provider selection + API key entry. Same provider list as SettingsPanel. "Get started with Ollama (local, free)" highlighted as easiest path.
- **Dismissible:** User can skip/close the modal at any step — app works without AI configured (notes still save, AI just won't process them)
- **Never shown again:** Once dismissed or completed, a flag in electron-conf marks onboarding as seen. Not shown on subsequent launches.
- **Implementation:** New `OnboardingModal.tsx` component. App.tsx checks `window.api.settings.get()` on mount and shows OnboardingModal if `onboardingDone` flag is not set. After successful save or explicit skip: set `onboardingDone: true` via IPC.

### Distribution Targets
- **Platform:** Windows only for this phase
- **Formats:** NSIS installer (`.exe`) + portable zip (both included in GitHub Releases)
- **Build command:** `npm run build:win` (already exists — runs typecheck + electron-vite build + electron-builder --win)
- **GitHub Releases:** Manual publish — build locally, upload artifacts to GitHub Releases with release notes

### README
- **Tone:** Developer-focused, concise — code blocks, no marketing fluff
- **Sections:**
  1. What it is — one-paragraph concept (silent AI pipeline, Karpathy-style wiki, local-first)
  2. Download — link to GitHub Releases latest
  3. Quick start — install, launch, open Settings, enter API key
  4. Provider setup guide — Claude, OpenAI, Ollama (each with key/setup instructions)
  5. MCP agent connection — how to add `http://127.0.0.1:7723/mcp` to Claude Code / Atlas config; 4 available tools listed
  6. Open source — MIT license, GitHub link
- **Length:** Concise — under 100 lines total

### Claude's Discretion
- Exact onboarding copy (headline, body text) — keep it honest and minimal
- Exact icon conversion toolchain (sharp, electron-icon-builder, or manual)
- Whether to add `CHANGELOG.md` stub (not required for this phase, but fine if trivial to add)
- Portable zip artifact name format

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### App config
- `electron-builder.yml` — current placeholder values to be replaced; existing file structure
- `package.json` — version field (update to 0.1.0), scripts

### Existing UI patterns
- `src/renderer/src/components/SettingsPanel.tsx` — visual style reference for OnboardingModal (dark theme, modal overlay, provider selection UI)
- `src/renderer/src/App.tsx` — where onboarding check goes (on mount, before rendering tabs)
- `src/main/ipc.ts` — where `onboardingDone` flag IPC handler should be added (pattern reference for settings handlers)

### Project docs
- `.planning/STATE.md` — architecture decisions, port 7723 MCP server
- `.planning/ROADMAP.md` — full feature list for README content

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SettingsPanel.tsx`: Provider selection UI, radio buttons, API key input — OnboardingModal step 2 can reuse this pattern directly (or share a sub-component)
- `window.api.settings.save()` / `window.api.settings.get()`: IPC bridge already exists for reading/writing provider config — onboarding completion uses the same save flow
- `electron-conf` (already in use for settings): Natural place to store `onboardingDone` boolean flag

### Established Patterns
- Modal overlay: `SettingsPanel` uses `fixed inset-0 z-50 flex items-center justify-center bg-black/60` — same pattern for OnboardingModal
- Dark theme: `bg-[#1a1a14]`, `border-white/10`, gray text scales — all established
- IPC pattern: `ipcMain.handle` in `ipc.ts`, exposed via `preload/index.ts` as `window.api.*`

### Integration Points
- `App.tsx` `useEffect` on mount: add `window.api.settings.get()` check → show OnboardingModal if not configured and onboardingDone is false
- `ipc.ts`: add `onboarding:complete` handler to set flag in electron-conf
- `build/` directory: place icon files here (electron-builder reads from `directories.buildResources: build`)

</code_context>

<specifics>
## Specific Ideas

- App icon: peepo note emote — source from BetterTTV or 7TV community. Verify license before using in MIT open-source repo.
- Onboarding modal step 1 vibe: minimal, honest — "Write a note. AI organizes it. Your wiki grows automatically. No prompts, no chatting." Not marketing-y.
- MCP section in README should include the exact JSON snippet users paste into their Claude Code config.
- README should mention this is open source with MIT license prominently — it's the primary trust mechanism for a tool that processes personal notes (established in PROJECT.md).

</specifics>

<deferred>
## Deferred Ideas

- macOS / Linux builds — future release after Windows v0.1.0 ships
- GitHub Actions CI/CD for automated releases — after manual flow is working
- Auto-updater (electron-updater) — v2
- CONTRIBUTING.md — after v0.1.0 ships and there are actual contributors
- App Store distribution (Mac App Store, Windows Store) — far future

</deferred>

---

*Phase: 06-polish-and-ship*
*Context gathered: 2026-04-17*
