import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { LANGS, THEMES, WIDTHS, overflowing, overlap, prepare, seedLong, smallTargets, type Box } from './helpers/long'

const OUT = process.env.SHOTS_DIR ?? 'test-results/long'
mkdirSync(OUT, { recursive: true })
const SIZES = (process.env.LONG_N ?? '60,120').split(',').map(Number)

const box = async (page: Page, sel: string): Promise<Box> => (await page.locator(sel).first().boundingBox())!

for (const n of SIZES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const lang of LANGS) {
        test(`replay lungo ${n} · ${width} ${theme} ${lang}`, async ({ page }) => {
          const errors: string[] = []
          page.on('pageerror', (e) => errors.push(String(e)))
          const height = width < 768 ? 800 : 900
          await page.setViewportSize({ width, height })
          await prepare(page, theme, lang)
          const id = await seedLong(page, n)
          await page.goto(`/combo/${id}/replay`)
          await page.waitForSelector('[data-field]')
          await page.waitForTimeout(500)
          const counter = page.getByTestId('rp-counter')

          // salto a metà, poi controlli di layout con una descrizione lunga
          await page.getByTestId('rp-next').click()
          const mid = Math.round(n * 0.4)
          await page.keyboard.press('g')
          await expect(page.getByTestId('replay-picker')).toBeVisible()
          const jump = page.getByTestId('replay-picker').getByTestId('replay-jump')
          await jump.fill(String(mid))
          await jump.press('Enter')
          await expect(counter).toContainText(`${mid}`)
          await page.waitForTimeout(400)
          await page.screenshot({ path: `${OUT}/replay${n}-mid-${width}-${theme}-${lang}.png` })

          const controls = await box(page, '[data-testid="replay-controls"]')
          expect(controls.y + controls.height, 'controlli nel viewport').toBeLessThanOrEqual(height + 1)
          const field = await box(page, '[data-field]')
          expect(overlap(field, controls), 'campo/controlli sovrapposti').toBe(false)
          if (width < 1024) {
            const nav = await box(page, '[data-testid="replay-longnav"]')
            expect(overlap(nav, controls), 'barra/controlli sovrapposti').toBe(false)
            expect(nav.x).toBeGreaterThanOrEqual(0)
            expect(nav.x + nav.width).toBeLessThanOrEqual(width + 1)
            expect(overlap(field, nav), 'campo/barra sovrapposti').toBe(false)
          } else {
            const panel = await box(page, '[data-testid="replay-panel"]')
            expect(overlap(field, panel), 'campo/pannello sovrapposti').toBe(false)
            expect(panel.y + panel.height).toBeLessThanOrEqual(height + 1)
            // il passo attivo è visibile nell'elenco del pannello
            const cur = await box(page, '[data-testid="replay-panel"] [aria-current="step"]')
            expect(cur.y).toBeGreaterThanOrEqual(panel.y)
            expect(cur.y + cur.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
          }
          const sh = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: window.innerHeight, s: document.documentElement.scrollWidth, w: window.innerWidth }))
          expect(sh.s, 'scroll orizzontale').toBeLessThanOrEqual(sh.w)
          expect(sh.h, 'scroll verticale della pagina').toBeLessThanOrEqual(sh.vh + 1)
          expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
          expect(await smallTargets(page, '[data-testid="replay-page"]'), 'target < 44px').toEqual([])

          // tastiera: Fine / Home / PagGiù / PagSu
          await page.keyboard.press('End')
          await expect(counter).toContainText(`${n}`)
          await page.keyboard.press('Home')
          await expect(counter).toHaveText(lang === 'it' ? 'Inizio' : 'Start')
          await page.keyboard.press('PageDown')
          await expect(counter).not.toHaveText(lang === 'it' ? 'Inizio' : 'Start')
          const afterPage = await counter.textContent()
          await page.keyboard.press('PageDown')
          expect(await counter.textContent()).not.toBe(afterPage)
          await page.keyboard.press('PageUp')
          await expect(counter).toHaveText(afterPage!)

          // barra a segmenti: tocco a metà
          if (width < 1024) {
            const bar = await box(page, '[data-testid="replay-seek"]')
            await page.mouse.click(bar.x + bar.width * 0.5, bar.y + bar.height / 2)
            const txt = await counter.textContent()
            expect(Number(/\d+/.exec(txt ?? '')?.[0])).toBeGreaterThan(Math.round(n * 0.4))
            expect(Number(/\d+/.exec(txt ?? '')?.[0])).toBeLessThan(Math.round(n * 0.62))
          }
          expect(errors).toEqual([])
        })
      }
    }
  }
}

test('replay lungo: selettore passi con ricerca (telefono)', async ({ page }) => {
  await prepare(page, 'dark', 'en')
  await page.setViewportSize({ width: 375, height: 800 })
  const id = await seedLong(page, 120)
  await page.goto(`/combo/${id}/replay`)
  await page.waitForSelector('[data-field]')
  await page.waitForTimeout(500)
  await expect(page.getByTestId('replay-longnav')).toBeVisible()
  await expect(page.getByTestId('replay-timeline')).toHaveCount(0) // niente fila infinita di numeri
  await page.getByTestId('replay-picker-open').click()
  await expect(page.getByTestId('replay-steplist').locator('[data-frame]').first()).toBeVisible()
  await page.getByTestId('replay-search').fill('xyz')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/replay120-picker-search-375-dark-en.png` })
  const found = await page.getByTestId('replay-steplist').locator('[data-frame]').count()
  expect(found).toBeGreaterThan(0)
  await page.getByTestId('replay-steplist').locator('[data-frame]').first().click()
  await expect(page.getByTestId('replay-picker')).toHaveCount(0)
})

test('replay lungo: pannello laterale (1440), ricerca e scroll automatico sul passo attivo', async ({ page }) => {
  await prepare(page, 'light', 'it')
  await page.setViewportSize({ width: 1440, height: 900 })
  const id = await seedLong(page, 120)
  await page.goto(`/combo/${id}/replay`)
  await page.waitForSelector('[data-field]')
  await page.waitForTimeout(500)
  const list = page.getByTestId('replay-panel').getByTestId('replay-steplist')
  await page.keyboard.press('End')
  await page.waitForTimeout(500)
  const cur = list.locator('[aria-current="step"]')
  await expect(cur).toBeInViewport()
  await page.keyboard.press('Home')
  await page.waitForTimeout(500)
  await expect(list.locator('[data-frame="0"]')).toBeInViewport()
  await page.getByTestId('replay-panel').getByTestId('replay-search').fill('catena')
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/replay120-panel-search-1440-light-it.png` })
})
