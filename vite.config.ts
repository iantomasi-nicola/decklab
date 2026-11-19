import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// E2E_MOCK_CARDS=1: i test e2e di archetipi/mazzi usano dati carte di prova (tests/mocks) al posto di src/features/cards
const mockCards = process.env.E2E_MOCK_CARDS === '1'
const alias = [
  ...(mockCards
    ? [
        { find: '@/features/cards/api', replacement: path.resolve(__dirname, 'tests/mocks/cardsApi.ts') },
        { find: '@/features/cards/CardImage', replacement: path.resolve(__dirname, 'tests/mocks/CardImage.tsx') },
      ]
    : []),
  // il pacchetto del core non riesporta `default` da mod.js: si importa dist/index.js (vedi docs/SPIKE-ENGINE.md)
  { find: /^@n1xx1\/ocgcore-wasm$/, replacement: path.resolve(__dirname, 'node_modules/@n1xx1/ocgcore-wasm/dist/index.js') },
  { find: '@', replacement: path.resolve(__dirname, 'src') },
]

export default defineConfig({
  // cache di pre-bundle separata: due server Vite sullo stesso node_modules (dev + e2e con mock) si rovinavano a vicenda ("Invalid hook call")
  ...(mockCards ? { cacheDir: 'node_modules/.vite-e2e-mock' } : {}),
  resolve: { alias },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Service worker nostro (src/sw.ts): precache app shell + share target (POST) che generateSW non sa gestire.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icon.svg', 'icons/apple-touch-icon.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png,webmanifest}'],
        // i dataset (public/data) e le immagini si scaricano a runtime, non fanno parte della shell
        globIgnores: ['**/data/**', '**/ocgcore*'],
      },
      manifest: {
        id: '/',
        name: 'Combo Lab',
        short_name: 'Combo Lab',
        description: 'Mazzi, combo e allenamento per Yu-Gi-Oh!',
        lang: 'it',
        dir: 'ltr',
        categories: ['games', 'utilities'],
        theme_color: '#0e1015',
        background_color: '#0e1015',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
        shortcuts: [
          { name: 'Mazzi', url: '/mazzi', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Combo', url: '/combo', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'files', accept: ['.ydk', 'text/plain', 'application/octet-stream'] }],
          },
        },
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2022' },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'workers/**/*.test.ts'] },
})
