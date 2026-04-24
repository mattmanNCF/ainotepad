// MIRRORED from shared/envelope.ts in the main repo. PWA cannot import across Vite roots.
// ANY CHANGE here MUST be propagated to shared/envelope.ts.
// See Phase 12 Plan 12-01 and Plan 12-02.

export const ENVELOPE_VERSION = 1 as const
export const ENVELOPE_MAX_TEXT_BYTES = 16 * 1024 // 16 KiB hard cap (MOB-SEC-01)

export interface NoteEnvelope {
  v: 1
  text: string
  ts: string
  device?: string
}
