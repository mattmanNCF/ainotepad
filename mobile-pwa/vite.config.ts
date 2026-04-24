import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/ainotepad/notal-mobile/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon-180x180.png', 'favicon.ico'],
      manifest: {
        name: 'Notal Capture',
        short_name: 'Notal',
        description: 'Capture notes to Notal from your phone',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        scope: '/ainotepad/notal-mobile/',
        start_url: '/ainotepad/notal-mobile/',
        icons: [
          { src: '/ainotepad/notal-mobile/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/ainotepad/notal-mobile/pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: []
      }
    })
  ],
  build: {
    outDir: '../docs/notal-mobile',
    emptyOutDir: true
  },
  server: {
    host: true,
    port: 5173
  }
})
