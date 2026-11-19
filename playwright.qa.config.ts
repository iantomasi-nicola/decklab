import { defineConfig } from '@playwright/test'

// Giro QA visivo/e2e finale: server Vite proprio (porta 4190) con dati carte di prova (E2E_MOCK_CARDS=1), 2 worker.
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /qa-.*\.spec\.ts/,
  outputDir: 'test-results/qa-out',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4190',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'E2E_MOCK_CARDS=1 npx vite --port 4190 --strictPort',
    url: 'http://localhost:4190',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
