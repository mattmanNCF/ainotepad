// Canonical JSON envelope for mobile -> desktop note transport via Drive appDataFolder.
// MIRRORED in mobile-pwa/src/envelope.ts (PWA cannot import from src/main/ or top-level shared
// due to Vite root-dir constraints). ANY CHANGE here MUST be propagated manually.
// See Phase 12 Plan 12-03 Task 2 and Plan 12-02 Task 3.

export const ENVELOPE_VERSION = 1 as const
export const ENVELOPE_MAX_TEXT_BYTES = 16 * 1024 // 16 KiB hard cap (MOB-SEC-01)

export interface NoteEnvelope {
  v: 1
  text: string          // <= 16384 chars
  ts: string            // ISO 8601 UTC timestamp of mobile capture
  device?: string       // optional free-form hint ("iPhone-Safari", etc.)
}

// JSON Schema for ajv compilation in desktop ingestion path (Plan 12-02 Task 3).
export const ENVELOPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    v: { type: 'number', const: 1 },
    text: { type: 'string', minLength: 1, maxLength: 16384 },
    ts: { type: 'string', minLength: 1 },
    device: { type: 'string' }
  },
  required: ['v', 'text', 'ts'],
  additionalProperties: false
} as const
