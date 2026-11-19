import { test } from '@playwright/test'
import { prepare, seedLong } from './helpers/long'
test.use({ baseURL: 'http://localhost:4180' })
for (const rm of [false, true]) {
  test(`lt reduced=${rm}`, async ({ page }) => {
    test.setTimeout(120_000)
    if (rm) await page.emulateMedia({ reducedMotion: 'reduce' })
    await prepare(page, 'dark', 'en')
    await page.setViewportSize({ width: 375, height: 800 })
    const id = await seedLong(page, 120)
    await page.goto(`/combo/${id}/replay`)
    await page.waitForSelector('[data-field]')
    await page.waitForTimeout(1000)
    await page.evaluate(() => {
      const w = window as any
      w.__lt = []
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] })
    })
    // 40 passi, uno ogni 300ms, come in play 3x ma senza timer React
    for (let i = 0; i < 40; i++) {
      await page.getByTestId('rp-next').click()
      await page.waitForTimeout(300)
    }
    console.log('reduced', rm, JSON.stringify(await page.evaluate(() => (window as any).__lt)))
  })
}
