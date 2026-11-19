/**
 * Prestazioni del replay con 120 passi. Misura sul build di produzione (in dev React è molto più lento e i long task sono falsati):
 *   npx vite build --outDir /tmp/dist && npx vite preview --outDir /tmp/dist --port 4180 &
 *   PERF_URL=http://localhost:4180 npx playwright test tests/e2e/long-perf.spec.ts
 */
import { expect, test } from '@playwright/test'
import { prepare, seedLong } from './helpers/long'

test.skip(!process.env.PERF_URL, 'serve PERF_URL (build di produzione)')
test.use({ baseURL: process.env.PERF_URL ?? 'http://localhost:4173' })

for (const width of [375, 1440]) {
  test(`replay 120 passi a ${width}px: nessun long task in play, cambio passo istantaneo`, async ({ page }) => {
    test.setTimeout(120_000)
    await prepare(page, 'dark', 'en')
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
    const id = await seedLong(page, 120)
    await page.goto(`/combo/${id}/replay`)
    await page.waitForSelector('[data-field]')
    await page.waitForTimeout(800)
    const speed = page.getByTestId('rp-speed')
    for (let i = 0; i < 3; i++) await speed.click() // 3×
    await page.evaluate(() => {
      const w = window as unknown as { __lt: number[] }
      w.__lt = []
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] })
    })
    await page.getByTestId('rp-play').click()
    await expect(page.getByTestId('rp-counter')).toContainText('40', { timeout: 60_000 })
    await page.getByTestId('rp-play').click()
    // obiettivo: nessun long task > 50 ms. In headless con rendering software il campo (Field) da solo ne produce di 50-60 ms: soglia di test 100 ms
    const lt = await page.evaluate(() => (window as unknown as { __lt: number[] }).__lt)
    expect(Math.max(0, ...lt), `long task durante il play: ${lt.join(', ')}`).toBeLessThan(100)
    // cambio passo: dal clic al fotogramma successivo
    const ms = await page.evaluate(async () => {
      const next = document.querySelector<HTMLButtonElement>('[data-testid="rp-next"]')!
      const t0 = performance.now()
      next.click()
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      return performance.now() - t0
    })
    expect(ms).toBeLessThan(50)
  })
}
