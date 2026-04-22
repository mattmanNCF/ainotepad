// Ambient declarations for electron-vite build-time string replacements.
// Values are populated via electron.vite.config.ts `define` from .env.local.
// At runtime these are inlined as string literals in the compiled bundle —
// `process.env.GOOGLE_CLIENT_ID` would NOT work because we never read env at runtime.
declare const __GOOGLE_CLIENT_ID__: string
declare const __GOOGLE_CLIENT_SECRET__: string
declare const __GOOGLE_WEB_CLIENT_ID__: string
