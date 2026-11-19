import { defineConfig } from '@playwright/test'

// Test e2e di archetipi e mazzi: server Vite separato (porta 4180) con dati carte di prova (E2E_MOCK_CARDS=1).
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /decks.*\.spec\.ts/,
  outputDir: 'test-results/decks',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4180',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'E2E_MOCK_CARDS=1 npx vite --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
