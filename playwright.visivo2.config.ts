import { defineConfig } from '@playwright/test'
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: new RegExp(process.env.VISIVO_MATCH ?? "ui-states\\.spec\\.ts"),
  outputDir: 'test-results/visivo-out',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4291', launchOptions: { executablePath: executablePath || undefined } },
  webServer: { command: 'E2E_MOCK_CARDS=1 npx vite --port 4291 --strictPort', url: 'http://localhost:4291', reuseExistingServer: false, timeout: 60_000 },
})
