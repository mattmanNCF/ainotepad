/**
 * Patch app-builder-lib's winPackager.js to bypass the winCodeSign 7z symlink
 * extraction failure on Windows without Developer Mode enabled.
 *
 * The default flow calls app-builder.exe which downloads winCodeSign-*.7z and
 * tries to extract macOS symlinks — this fails with exit code 2 on Windows
 * unless Developer Mode is on. The patch detects an existing rcedit-x64.exe in
 * the electron-builder cache and invokes it directly, bypassing the download.
 *
 * Safe to re-run: checks for the patch marker before applying.
 */

const fs = require('fs')
const path = require('path')

const target = path.join(__dirname, '..', 'node_modules', 'app-builder-lib', 'out', 'winPackager.js')

if (!fs.existsSync(target)) {
  console.log('patch-wincosign: winPackager.js not found, skipping')
  process.exit(0)
}

const src = fs.readFileSync(target, 'utf8')

const MARKER = 'winCodeSign symlink workaround'
if (src.includes(MARKER)) {
  console.log('patch-wincosign: already applied, skipping')
  process.exit(0)
}

// Original: the rcedit block starts with the platform check and immediately
// calls executeAppBuilder or getRceditBundle. Replace with cache-first approach.
const ORIGINAL = `        // rcedit crashed of executed using wine, resourcehacker works
        if (process.platform === "win32" || process.platform === "darwin") {
            await (0, builder_util_1.executeAppBuilder)(["rcedit", "--args", JSON.stringify(args)], undefined /* child-process */, {}, 3 /* retry three times */);
        }`

const PATCHED = `        // rcedit crashed of executed using wine, resourcehacker works
        if (process.platform === "win32" || process.platform === "darwin") {
            // Workaround: electron-builder's app-builder.exe rcedit command downloads winCodeSign
            // which fails on Windows without Developer Mode due to macOS symlinks in the 7z archive.
            // Instead, use rcedit-x64.exe directly from the existing winCodeSign cache if available.
            // winCodeSign symlink workaround
            const path_m = require("path");
            const fs_m = require("fs");
            const { execFile } = require("child_process");
            const cacheDir = path_m.join(process.env.LOCALAPPDATA || path_m.join(require("os").homedir(), "AppData", "Local"), "electron-builder", "Cache", "winCodeSign");
            let rceditPath = null;
            try {
                if (fs_m.existsSync(cacheDir)) {
                    for (const entry of fs_m.readdirSync(cacheDir)) {
                        if (entry.endsWith(".7z")) continue;
                        const candidate = path_m.join(cacheDir, entry, "rcedit-x64.exe");
                        if (fs_m.existsSync(candidate)) { rceditPath = candidate; break; }
                    }
                }
            } catch (_e) {}
            if (rceditPath) {
                builder_util_1.log.info({ rcedit: rceditPath }, "rcedit: using existing cache (winCodeSign symlink workaround)");
                await new Promise((resolve, reject) => {
                    execFile(rceditPath, args, (err) => {
                        if (err) reject(err); else resolve(undefined);
                    });
                });
            } else {
                await (0, builder_util_1.executeAppBuilder)(["rcedit", "--args", JSON.stringify(args)], undefined /* child-process */, {}, 3 /* retry three times */);
            }
        }`

if (!src.includes(ORIGINAL.trim().split('\n')[0].trim())) {
  // Original anchor not found — the file may have been updated by a package upgrade.
  // Print a warning but don't fail the build.
  console.warn('patch-wincosign: WARNING — expected anchor not found in winPackager.js.')
  console.warn('The winCodeSign symlink fix was not applied. If npm run build:win fails')
  console.warn('with a 7z symlink error, enable Windows Developer Mode in Settings.')
  process.exit(0)
}

const patched = src.replace(ORIGINAL, PATCHED)
fs.writeFileSync(target, patched, 'utf8')
console.log('patch-wincosign: applied winCodeSign symlink workaround to winPackager.js')
