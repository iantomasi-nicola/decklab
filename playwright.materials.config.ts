import { defineConfig } from '@playwright/test'

// Config propria per i test di selezione materiali/bersagli sul campo (porta dedicata, 2 worker).
const executablePath = process.env.PW_CHROMIUM_PATH ?? process.env.CHROME_BIN

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /(materials|engine-flow|engine-ui|engine-real|combo-dnd)\.spec\.ts/,
  outputDir: 'test-results/materials-run',
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  timeout: 90_000,
  use: { baseURL: 'http://localhost:4297', trace: 'off', launchOptions: { executablePath: executablePath || undefined } },
  webServer: { command: 'npx vite --port 4297 --strictPort', url: 'http://localhost:4297', reuseExistingServer: true, timeout: 60_000 },
})
