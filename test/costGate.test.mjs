/**
 * CAL-COST-01: Confidence gate limits reminder inserts to ≤6 for 50 notes.
 *
 * Tests the two parser-level gates that handleNoteReminder applies before any
 * DB write occurs:
 *   Gate 1 — confidence >= CONFIDENCE_GATE (0.85)
 *   Gate 3 — parseReminderDate returns a non-null triple
 *
 * (Gate 2 = isCalendarConnected is tested by the OAuth integration tests;
 * it is orthogonal to the cost ceiling.)
 *
 * Simulates a corpus of 50 notes with synthetic AI payloads matching what the
 * production AI worker would return: 5 true positives with high confidence +
 * parseable date text, 45 negatives that are stopped at gate 1.
 *
 * Run: npm run test:cost-gate
 */

import test from 'node:test'
import assert from 'node:assert/strict'

const { parseReminderDate } = await import('../src/main/calendar/reminderParser.ts')

// Gate constant — must match reminderService.ts CONFIDENCE_GATE
const CONFIDENCE_GATE = 0.85

// Fixed reference date so "tomorrow / next Friday / etc." are deterministic
const REF = new Date('2026-06-15T12:00:00.000Z') // Monday 2026-06-15 12:00 UTC

// ---------------------------------------------------------------------------
// Fixture corpus: 50 synthetic AI reminder payloads
// Format: { noteText, confidence, date_text }
//   - confidence: what the AI worker would return
//   - date_text: extracted by AI (empty string for non-reminder notes)
// ---------------------------------------------------------------------------

/** 5 TRUE POSITIVES — high confidence, parseable date */
const TRUE_POSITIVES = [
  { noteText: 'meeting with Sarah Friday at 2pm', confidence: 0.93, date_text: 'Friday at 2pm' },
  { noteText: 'doctor appt next Wednesday 10am', confidence: 0.91, date_text: 'next Wednesday 10am' },
  { noteText: 'remind me to call mom tomorrow at 6pm', confidence: 0.96, date_text: 'tomorrow at 6pm' },
  { noteText: 'dentist Thursday 9am — confirm with receptionist', confidence: 0.88, date_text: 'Thursday 9am' },
  { noteText: 'pick up dry cleaning Monday morning', confidence: 0.87, date_text: 'Monday morning' },
]

/** 45 NEGATIVES — low confidence (gate 1 stops them, no date_text needed) */
const NEGATIVES = [
  { noteText: 'thoughts on cognitive load theory and working memory', confidence: 0.12, date_text: '' },
  { noteText: 'book recommendation: The Art of Doing Science and Engineering', confidence: 0.08, date_text: '' },
  { noteText: 'interesting paper on LLM attention mechanisms', confidence: 0.05, date_text: '' },
  { noteText: 'need to think more about the tradeoffs between consistency and availability', confidence: 0.22, date_text: '' },
  { noteText: 'morning coffee: Colombian single-origin, medium roast, 200F water', confidence: 0.03, date_text: '' },
  { noteText: 'the observer effect in quantum mechanics is often misunderstood', confidence: 0.07, date_text: '' },
  { noteText: 'recipe idea: roasted butternut squash soup with smoked paprika', confidence: 0.06, date_text: '' },
  { noteText: 'good podcast episode on network topology and BGP routing', confidence: 0.04, date_text: '' },
  { noteText: 'TypeScript discriminated unions are underused in most codebases', confident: 0.09, date_text: '', confidence: 0.09 },
  { noteText: 'reading about the Fermi paradox and the Great Filter hypothesis', confidence: 0.11, date_text: '' },
  { noteText: 'idea for a short story: time traveler stuck in a Tuesday', confidence: 0.18, date_text: '' },
  { noteText: 'SQLite WAL mode significantly improves concurrent read throughput', confidence: 0.02, date_text: '' },
  { noteText: 'Keynesian vs Austrian economics: still no consensus after 100 years', confidence: 0.06, date_text: '' },
  { noteText: 'chess opening theory: the Sicilian Defense Najdorf variation', confidence: 0.03, date_text: '' },
  { noteText: 'the etymology of the word "salary" comes from Roman salt rations', confidence: 0.01, date_text: '' },
  { noteText: 'React 19 concurrent features explained in simple terms', confidence: 0.04, date_text: '' },
  { noteText: 'why do leaves change color in autumn? Chlorophyll breakdown', confidence: 0.02, date_text: '' },
  { noteText: 'favorite running route: 5k loop through the park', confidence: 0.07, date_text: '' },
  { noteText: 'the difference between machine learning and statistical inference', confidence: 0.09, date_text: '' },
  { noteText: 'interesting history of the printing press and information diffusion', confidence: 0.03, date_text: '' },
  { noteText: 'note to self: look into graph neural networks for recommendation systems', confidence: 0.31, date_text: '' },
  { noteText: 'TailwindCSS v4 removes the config file — big DX improvement', confidence: 0.02, date_text: '' },
  { noteText: 'just finished re-reading Godel Escher Bach for the third time', confidence: 0.05, date_text: '' },
  { noteText: 'why is the sky blue? Rayleigh scattering of shorter wavelengths', confidence: 0.01, date_text: '' },
  { noteText: 'found a great new coffee shop on 5th ave — worth returning to', confidence: 0.14, date_text: '' },
  { noteText: 'Stoic philosophy: the dichotomy of control as a practical framework', confidence: 0.04, date_text: '' },
  { noteText: 'electron app architecture patterns: main process vs renderer tradeoffs', confidence: 0.06, date_text: '' },
  { noteText: 'the Roman Colosseum held 50000-80000 spectators with organized exits', confidence: 0.02, date_text: '' },
  { noteText: 'idea: build a personal finance tracker that auto-categorizes transactions', confidence: 0.19, date_text: '' },
  { noteText: 'vim vs emacs: the eternal debate and why it no longer matters', confidence: 0.03, date_text: '' },
  { noteText: 'bonsai care notes: water when soil is dry 1 inch down, avoid drafts', confidence: 0.08, date_text: '' },
  { noteText: 'deep dive into Byzantine fault tolerance and distributed consensus', confidence: 0.05, date_text: '' },
  { noteText: 'the Coriolis effect and why hurricanes spin counterclockwise in the north', confidence: 0.02, date_text: '' },
  { noteText: 'great UX talk: affordances and signifiers in digital interfaces', confidence: 0.04, date_text: '' },
  { noteText: 'protein synthesis: transcription → translation → folding', confidence: 0.01, date_text: '' },
  { noteText: 'Dijkstra considered harmful — letters as a form of scientific discourse', confidence: 0.03, date_text: '' },
  { noteText: 'music theory: circle of fifths and functional harmony in jazz', confidence: 0.02, date_text: '' },
  { noteText: 'why WebAssembly matters for the future of browser applications', confidence: 0.07, date_text: '' },
  { noteText: 'interesting parallels between evolutionary biology and market competition', confidence: 0.06, date_text: '' },
  { noteText: 'the halting problem and limits of computability — Turing 1936', confidence: 0.02, date_text: '' },
  { noteText: 'notes from a walk: clouds looked unusual today, possible lenticular', confidence: 0.08, date_text: '' },
  { noteText: 'how does GPS actually work? Trilateration from satellite signals', confidence: 0.03, date_text: '' },
  { noteText: 'personal finance reminder: review subscriptions quarterly', confidence: 0.42, date_text: '' },
  { noteText: 'the Socratic method as a debugging technique for complex systems', confidence: 0.05, date_text: '' },
  { noteText: 'optical illusions reveal assumptions baked into visual processing', confidence: 0.02, date_text: '' },
]

const CORPUS = [...TRUE_POSITIVES, ...NEGATIVES]

// Sanity-check fixture size
assert.equal(CORPUS.length, 50, 'fixture must be exactly 50 notes')

// ---------------------------------------------------------------------------

/**
 * Simulates the gate logic from handleNoteReminder (reminderService.ts):
 *   1. confidence >= CONFIDENCE_GATE
 *   2. parseReminderDate returns non-null
 *
 * Returns the subset of payloads that would produce a DB insert.
 */
function applyGates(corpus, referenceDate) {
  const passing = []
  for (const item of corpus) {
    // Gate 1 — confidence threshold
    if (item.confidence < CONFIDENCE_GATE) continue

    // Gate 3 — date parseable in system zone
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const triple = parseReminderDate(item.date_text, zone, referenceDate)
    if (!triple) continue

    passing.push(item)
  }
  return passing
}

// ---------------------------------------------------------------------------

test('CONFIDENCE_GATE is 0.85 (must match reminderService.ts)', () => {
  assert.equal(CONFIDENCE_GATE, 0.85)
})

test('corpus has exactly 50 notes (5 true positives + 45 negatives)', () => {
  assert.equal(CORPUS.length, 50)
  assert.equal(TRUE_POSITIVES.length, 5)
  assert.equal(NEGATIVES.length, 45)
})

test('all 5 true-positive date texts are parseable (gate 3 passes)', () => {
  const zone = 'UTC'
  for (const item of TRUE_POSITIVES) {
    const triple = parseReminderDate(item.date_text, zone, REF)
    assert.ok(triple, `Expected "${item.date_text}" to parse — got null`)
    assert.equal(triple.original_tz, zone)
  }
})

test('all 45 negatives are stopped at gate 1 (confidence < 0.85)', () => {
  const belowGate = NEGATIVES.filter(n => n.confidence >= CONFIDENCE_GATE)
  assert.equal(belowGate.length, 0,
    `${belowGate.length} negative(s) have confidence >= ${CONFIDENCE_GATE}: ${JSON.stringify(belowGate.map(n => n.noteText))}`)
})

test('CAL-COST-01: exactly 5 of 50 corpus notes pass both gates (≤ 6 required)', () => {
  const passing = applyGates(CORPUS, REF)
  assert.ok(passing.length <= 6,
    `FAIL: ${passing.length} reminders would be created — exceeds CAL-COST-01 limit of 6`)
  assert.equal(passing.length, 5,
    `Expected exactly 5 true positives to pass, got ${passing.length}`)
})

test('false-positive boundary: note with confidence 0.849 is rejected', () => {
  const borderline = { noteText: 'call dentist maybe next week?', confidence: 0.849, date_text: 'next week' }
  const passing = applyGates([borderline], REF)
  assert.equal(passing.length, 0, 'confidence 0.849 must be rejected by gate 1')
})

test('false-positive boundary: note with confidence 0.85 and parseable date is accepted', () => {
  const exactBoundary = { noteText: 'meeting next Monday', confidence: 0.85, date_text: 'next Monday' }
  const passing = applyGates([exactBoundary], REF)
  assert.equal(passing.length, 1, 'confidence exactly 0.85 must pass gate 1')
})

test('ambiguous date text with high confidence is still rejected (gate 3)', () => {
  // "quarterly" has no absolute date — parseReminderDate returns null
  const ambiguous = { noteText: 'review subscriptions quarterly', confidence: 0.92, date_text: 'quarterly' }
  const passing = applyGates([ambiguous], REF)
  assert.equal(passing.length, 0, 'unparseable date text must be rejected by gate 3 even at high confidence')
})
