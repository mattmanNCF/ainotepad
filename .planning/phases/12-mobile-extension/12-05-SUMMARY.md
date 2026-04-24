---
phase: 12-mobile-extension
plan: "05"
subsystem: infra
tags: [github-actions, github-pages, pwa, vite, google-identity-services, ci-cd]

# Dependency graph
requires:
  - phase: 12-mobile-extension plan 03
    provides: mobile-pwa/ Vite project with outDir docs/notal-mobile/
  - phase: 12-mobile-extension plan 01
    provides: GOOGLE_WEB_CLIENT_ID (Web OAuth client) from GCP
provides:
  - GitHub Actions workflow that builds and deploys mobile PWA on push to main
  - mobile-pwa/README.md with local dev and production deploy instructions
affects:
  - 12-mobile-extension plan 06 (UAT — verifies live URL at https://mattmanNCF.github.io/notal-mobile/)

# Tech tracking
tech-stack:
  added: [actions/checkout@v4, actions/setup-node@v4, actions/upload-pages-artifact@v3, actions/deploy-pages@v4]
  patterns:
    - Split build/deploy jobs for GitHub Pages (required by actions/deploy-pages)
    - concurrency cancel-in-progress for zero-waste repush handling
    - Typecheck-then-build step order (npm run typecheck before npm run build)
    - Post-build manifest verification before artifact upload

key-files:
  created:
    - .github/workflows/deploy-mobile.yml
    - mobile-pwa/README.md
  modified: []

key-decisions:
  - "Split build and deploy into separate jobs (required by actions/deploy-pages@v4 — deploy job must reference github-pages environment)"
  - "Typecheck run as separate step before build so type errors surface clearly in CI log"
  - "Post-build step verifies manifest.webmanifest contains /notal-mobile/ before upload to catch base-path regressions"
  - "cache-dependency-path set to mobile-pwa/package-lock.json so Node cache scoped to sub-project correctly"

patterns-established:
  - "Sub-project CI: working-directory + cache-dependency-path both pointed at sub-project dir"
  - "Pages deploy: build job uploads artifact, deploy job consumes via actions/deploy-pages (two-job split)"

requirements-completed:
  - MOB-PWA-01

# Metrics
duration: 5min
completed: 2026-04-23
---

# Phase 12 Plan 05: Mobile PWA Deploy Pipeline Summary

**GitHub Actions CI/CD pipeline builds Vite PWA in mobile-pwa/ and deploys to GitHub Pages at https://mattmanNCF.github.io/notal-mobile/ on push to main**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-23T00:00:00Z
- **Completed:** 2026-04-23T00:05:00Z
- **Tasks:** 1 of 2 (Task 2 is a human-action checkpoint — Matt must enable Pages + add secret)
- **Files created:** 2

## Accomplishments

- Created `.github/workflows/deploy-mobile.yml` with split build/deploy jobs, concurrency guard, and post-build manifest verification
- Workflow injects `VITE_GOOGLE_WEB_CLIENT_ID` from `GOOGLE_WEB_CLIENT_ID` repository secret at build time
- Created `mobile-pwa/README.md` with local dev setup, production deploy mechanics, iOS install instructions, and GCP origin requirements
- YAML validates cleanly (js-yaml parse passes)

## Task Commits

1. **Task 1: Write deploy-mobile.yml + mobile-pwa README** - `ed52110` (ci)

**Plan metadata:** pending final commit (after checkpoint completes)

## Files Created/Modified

- `.github/workflows/deploy-mobile.yml` — GitHub Actions pipeline: build (checkout, setup-node, npm ci, typecheck, build, verify manifest, upload artifact) + deploy (deploy-pages)
- `mobile-pwa/README.md` — Local dev instructions, production deploy instructions, VITE_GOOGLE_WEB_CLIENT_ID setup, iOS home-screen install steps

## Decisions Made

- Split build/deploy into two jobs: `actions/deploy-pages@v4` requires the deploy job to declare the `github-pages` environment, and this job must be separate from the build job that uploads the artifact.
- Added explicit typecheck step before build so TypeScript errors surface as a distinct named step in the CI log rather than buried in the build output.
- Added post-build manifest verification step (`grep -q '/notal-mobile/' docs/notal-mobile/manifest.webmanifest`) to catch any future vite.config.ts base path regressions before the artifact is uploaded.

## Deviations from Plan

None - plan executed exactly as written. The workflow YAML matches the plan's template with the split-job pattern noted in the plan's context section.

## Issues Encountered

None.

## User Setup Required

**Task 2 is a blocking human-action checkpoint.** Matt must perform three manual setup steps before the first deploy can run:

### Step 1 — Enable GitHub Pages with Actions source

1. Go to https://github.com/mattmanNCF/ainotepad/settings/pages
2. Under "Build and deployment", set **Source** to **GitHub Actions** (NOT "Deploy from a branch")
3. Save if prompted

### Step 2 — Add the repository secret

1. Go to https://github.com/mattmanNCF/ainotepad/settings/secrets/actions
2. Click "New repository secret"
3. Name: `GOOGLE_WEB_CLIENT_ID`
4. Secret value: the Web OAuth client ID from GCP Plan 12-01 (the string ending in `.apps.googleusercontent.com`)
   - Value: `551312500005-7227le93q2u2eiqtq1chtb28se2v84bm.apps.googleusercontent.com`
5. Save

### Step 3 — Add Pages origin to GCP OAuth client

1. Go to https://console.cloud.google.com/apis/credentials
2. Click the Web OAuth client created in Plan 12-01
3. Under "Authorized JavaScript origins", add: `https://mattmanNCF.github.io`
4. Save

### Step 4 — Trigger the first deploy

Option A (preferred): Merge `notal-v0.3.1-mobile` to `main` — the push to main with `mobile-pwa/**` changes auto-triggers the workflow.

Option B: Go to https://github.com/mattmanNCF/ainotepad/actions/workflows/deploy-mobile.yml -> "Run workflow" -> select `main` -> Run.

### Step 5 — Verify

1. Watch the Actions run complete at https://github.com/mattmanNCF/ainotepad/actions
2. Open https://mattmanNCF.github.io/notal-mobile/ in a desktop browser — confirm "Notal Capture" UI loads
3. In DevTools -> Application -> Manifest: confirm scope and start_url both show `/notal-mobile/`
4. Click "Connect Google" — confirm GIS consent popup appears with Drive scope

### Resume signal

Once the PWA is reachable and the GIS connect button triggers the consent prompt, tell the agent: `approved`.
If the deploy failed or the site is unreachable: `failed: {what broke}`.

## Next Phase Readiness

- `.github/workflows/deploy-mobile.yml` is committed and will trigger automatically on next push to `main` touching `mobile-pwa/**`
- Once Matt completes user setup (above), Plan 12-06 UAT can proceed
- Plan 12-06 UAT verifies the live URL, installability, and GIS auth flow end-to-end

---
*Phase: 12-mobile-extension*
*Completed: 2026-04-23*
