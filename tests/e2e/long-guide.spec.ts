import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { LANGS, THEMES, WIDTHS, overflowing, overlap, prepare, seedLong, smallTargets } from './helpers/long'

const OUT = process.env.SHOTS_DIR ?? 'test-results/long'
mkdirSync(OUT, { recursive: true })
const SIZES = (process.env.LONG_N ?? '60,120').split(',').map(Number)

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!

for (const n of SIZES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const lang of LANGS) {
        test(`guida lunga ${n} · ${width} ${theme} ${lang}`, async ({ page }) => {
          const errors: string[] = []
          page.on('pageerror', (e) => errors.push(String(e)))
          const height = width < 768 ? 800 : 900
          await page.setViewportSize({ width, height })
          await prepare(page, theme, lang)
          const id = await seedLong(page, n)
          await page.goto(`/combo/${id}/guida`)
          await expect(page.getByTestId('guide-page')).toBeVisible()
          await page.waitForTimeout(600)
          await expect(page.locator('[data-step]')).toHaveCount(n)
          await page.screenshot({ path: `${OUT}/guida${n}-top-${width}-${theme}-${lang}.png` })

          // scorrimento: la barra di navigazione non si sovrappone alla barra alta e non copre i controlli visibili
          for (const y of [900, 2200, 4000]) {
            await page.evaluate((y) => window.scrollTo(0, y), y)
            await page.waitForTimeout(150)
            const bar = await box(page, '[data-testid="guide-toolbar"]')
            const head = await box(page, 'header.sticky')
            expect(bar.y, 'barra navigazione sotto barra alta').toBeGreaterThanOrEqual(head.y + head.height - 1)
            expect(bar.x + bar.width).toBeLessThanOrEqual(width + 1)
            if (width < 768) {
              const nav = await box(page, 'nav.fixed')
              expect(overlap(bar, nav)).toBe(false)
            }
          }

          // salto al passo: il passo resta sotto la barra
          await page.getByTestId('guide-jump').fill(String(Math.round(n * 0.75)))
          await page.getByTestId('guide-jump').press('Enter')
          await page.waitForTimeout(500)
          const target = await box(page, `[data-step="${Math.round(n * 0.75)}"]`)
          const bar = await box(page, '[data-testid="guide-toolbar"]')
          expect(target.y, 'passo non coperto dalla barra').toBeGreaterThanOrEqual(bar.y + bar.height - 2)
          expect(target.y).toBeLessThan(height)
          await page.screenshot({ path: `${OUT}/guida${n}-jump-${width}-${theme}-${lang}.png` })

          // sommario
          await page.getByTestId('guide-toc-button').click()
          await expect(page.getByTestId('guide-toc')).toBeVisible()
          await page.waitForTimeout(300)
          await page.screenshot({ path: `${OUT}/guida${n}-toc-${width}-${theme}-${lang}.png` })
          expect(await smallTargets(page, '[data-testid="guide-toc"]'), 'target sommario < 44px').toEqual([])
          await page.getByTestId('guide-toc').locator('[data-toc-step]').nth(3).click()
          await page.waitForTimeout(500)
          await expect(page.getByTestId('guide-toc')).toHaveCount(0)

          // ricerca
          await page.getByTestId('guide-search').fill('catena')
          await page.getByTestId('guide-search').fill(lang === 'it' ? 'cerca' : 'search')
          await page.waitForTimeout(300)
          await expect(page.getByTestId('guide-results')).toBeVisible()
          await page.screenshot({ path: `${OUT}/guida${n}-search-${width}-${theme}-${lang}.png` })
          await page.getByTestId('guide-search').fill('')

          // pagina intera
          await page.evaluate(() => window.scrollTo(0, 0))
          const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }))
          expect(sw.s, 'scroll orizzontale').toBeLessThanOrEqual(sw.w)
          expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
          expect(await smallTargets(page, '[data-testid="guide-page"]'), 'target < 44px').toEqual([])
          expect(errors).toEqual([])
        })
      }
    }
  }
}
