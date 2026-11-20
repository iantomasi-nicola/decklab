import { defineConfig } from '@playwright/test'

// Test e2e della mano di partenza: server Vite proprio (porta 4195), dati carte reali, 2 worker.
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /(hand-start|engine-flow|engine-ui|materials).*\.spec\.ts/,
  outputDir: 'test-results/hand',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:4195',
    trace: 'off',
    launchOptions: { executablePath: executablePath || undefined },
  },
  webServer: {
    command: 'npx vite --port 4195 --strictPort',
    url: 'http://localhost:4195',
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
