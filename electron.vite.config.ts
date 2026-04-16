import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'sqlite-vec', 'node-llama-cpp'],
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
        external: ['better-sqlite3', 'sqlite-vec', 'node-llama-cpp']
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
