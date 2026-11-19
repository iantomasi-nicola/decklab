import { defineConfig } from '@playwright/test'

// Verifica PWA sulla build di produzione (dati carte reali): app shell + dataset offline, manifest, icone, share target.
// Porta 4191, 1 worker (i test cambiano lo stato di rete del contesto). Uso: npx playwright test -c playwright.pwa.config.ts
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /qa-pwa\.spec\.ts/,
  outputDir: 'test-results/pwa-out',
  workers: 1,
  reporter: [['list']],
  timeout: 90_000,
  use: {
    baseURL: 'http://localhost:4191',
    trace: 'off',
    serviceWorkers: 'allow',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'npx vite build --outDir test-results/pwa-dist --emptyOutDir && npx vite preview --outDir test-results/pwa-dist --port 4191 --strictPort',
    url: 'http://localhost:4191',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
