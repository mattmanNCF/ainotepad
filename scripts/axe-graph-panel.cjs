#!/usr/bin/env node
// One-shot axe-core verification of the graph params panel.
// Usage: node scripts/axe-graph-panel.cjs
// Assumes `npm run dev` is already running in another terminal and Electron's
// dev URL is reachable at process.env.NOTAL_DEV_URL or http://localhost:5173.
//
// Because axe-core runs in the page context, we inject it via the DevTools
// protocol. This script uses Electron's built-in `remote` debugging port.
//
// Simpler alternative: this script prints a code snippet to paste into the
// Electron renderer's DevTools console. That's what we do for v1 — no CDP
// dependency, no flaky automation. Plan 11 can upgrade to Playwright if needed.

const axeSource = require('axe-core').source
const fs = require('fs')
const path = require('path')

const snippet = `
// ==== Paste this into the Electron DevTools console (Graph view open, panel visible) ====
${axeSource}
;(async () => {
  const target = document.querySelector('[data-graph-params-panel]')
  if (!target) {
    console.error('FAIL: panel not found. Open the Graph view first.')
    return
  }
  const results = await axe.run(target, {
    runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  })
  console.log('=== axe-core scan of graph params panel ===')
  console.log('violations:', results.violations.length)
  for (const v of results.violations) {
    console.log('  -', v.id, '|', v.impact, '|', v.description)
    for (const n of v.nodes) {
      console.log('      target:', n.target.join(', '))
      console.log('      html:', n.html.slice(0, 200))
    }
  }
  console.log('passes:', results.passes.length, '| incomplete:', results.incomplete.length)
  window.__axeResults = results  // for inspection
})()
// ==== End ====
`

const outPath = path.join(__dirname, '..', '.planning', 'phases', '10-dynamic-wiki-graph-parameters', 'axe-snippet.js')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, snippet)
console.log('Axe verification snippet written to:', outPath)
console.log('Steps:')
console.log('  1. Run `npm run dev`')
console.log('  2. Open the Notal window, switch to the Wiki tab, toggle Graph view')
console.log('  3. Open DevTools (Ctrl+Shift+I)')
console.log('  4. Paste the snippet content from', outPath, 'into the Console')
console.log('  5. Read the "violations" count — must be 0')
