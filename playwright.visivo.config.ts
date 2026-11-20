import { defineConfig } from '@playwright/test'

// Giro QA visivo/e2e finale: server Vite proprio (porta 4290) con dati carte di prova (E2E_MOCK_CARDS=1), 2 worker.
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /qa-tour\.spec\.ts/,
  outputDir: 'test-results/visivo-out',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4290',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'E2E_MOCK_CARDS=1 npx vite --port 4290 --strictPort',
    url: 'http://localhost:4290',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
