import { resolve } from 'path'
import { defineConfig, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load .env.local (gitignored) — build-time only. These values become
  // literal string replacements in the compiled main/preload bundles.
  // Runtime code MUST read __GOOGLE_CLIENT_ID__ / __GOOGLE_CLIENT_SECRET__,
  // NOT process.env.* — so packaged asar contains the strings, not env lookups.
  const env = loadEnv(mode, process.cwd(), '')
  const GOOGLE_CLIENT_ID = JSON.stringify(env.GOOGLE_CLIENT_ID ?? '')
  const GOOGLE_CLIENT_SECRET = JSON.stringify(env.GOOGLE_CLIENT_SECRET ?? '')

  return {
    main: {
      define: {
        __GOOGLE_CLIENT_ID__: GOOGLE_CLIENT_ID,
        __GOOGLE_CLIENT_SECRET__: GOOGLE_CLIENT_SECRET,
      },
      build: {
        rollupOptions: {
          external: [
            'better-sqlite3',
            'sqlite-vec',
            'node-llama-cpp',
            'google-auth-library',
            '@googleapis/calendar',
            'chrono-node',
            'luxon',
          ],
          input: {
            index: resolve(__dirname, 'src/main/index.ts'),
            aiWorker: resolve(__dirname, 'src/main/aiWorker.ts'),
          }
        }
      }
    },
    preload: {
      build: {
        rollupOptions: {
          external: [
            'better-sqlite3',
            'sqlite-vec',
            'node-llama-cpp',
            'google-auth-library',
            '@googleapis/calendar',
            'chrono-node',
            'luxon',
          ]
        }
      }
    },
    renderer: {
      resolve: {
        alias: { '@renderer': resolve('src/renderer/src') }
      },
      plugins: [react(), tailwindcss()]
    }
  }
})
