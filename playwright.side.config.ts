import { defineConfig } from '@playwright/test'

// Test e2e del Side plan: server Vite separato (porta 4181) con dati carte di prova (E2E_MOCK_CARDS=1), 2 worker.
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /side.*\.spec\.ts/,
  outputDir: 'test-results/side',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4181',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'E2E_MOCK_CARDS=1 npx vite --port 4181 --strictPort',
    url: 'http://localhost:4181',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
