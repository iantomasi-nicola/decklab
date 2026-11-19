import { defineConfig } from '@playwright/test'

// In ambienti con Chromium preinstallato (CHROME_BIN / PW_CHROMIUM_PATH) usa quello; altrimenti il browser di Playwright.
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results', // screenshot in test-results/visual (ignorata da git)
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
