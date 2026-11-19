import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const ROUTES = [
  ['home', '/'],
  ['archetipi', '/archetipi'],
  ['mazzi', '/mazzi'],
  ['combo', '/combo'],
  ['impara', '/impara'],
  ['statistiche', '/statistiche'],
  ['impostazioni', '/impostazioni'],
] as const
const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const

const OUT = 'test-results/visual'
mkdirSync(OUT, { recursive: true })

async function prepare(page: Page, theme: string, lang: string) {
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Elementi visibili che escono dal viewport (esclusi quelli dentro contenitori che scorrono di proposito). */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const bad: string[] = []
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.width <= 1 && r.height <= 1) continue // sr-only
      if (r.right > vw + 1 || r.left < -1) {
        if (!clipped(el)) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
      }
    }
    return bad
  })
}

for (const [name, path] of ROUTES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      for (const lang of LANGS) {
        test(`${name} ${width} ${theme} ${lang}`, async ({ page }) => {
          const errors: string[] = []
          page.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text())
          })
          page.on('pageerror', (e) => errors.push(String(e)))

          await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
          await prepare(page, theme, lang)
          await page.goto(path)
          await expect(page.locator('h1')).toBeVisible()
          await page.evaluate(() => document.fonts.ready)

          expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
          expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang)

          await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}-${lang}.png`, fullPage: true })

          const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }))
          expect(sw.s, 'scroll orizzontale').toBeLessThanOrEqual(sw.w)
          expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
          expect(errors, 'errori in console').toEqual([])
        })
      }
    }
  }
}

test.describe('shell', () => {
  test('telefono: barra in basso, niente sidebar; More apre il bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/')
    const nav = page.getByRole('navigation').first()
    await expect(nav).toBeVisible()
    await expect(page.locator('aside')).toBeHidden()
    await page.getByRole('button', { name: /altro|more/i }).click()
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await dlg.getByRole('link').first().click()
    await expect(dlg).toBeHidden()
  })

  test('desktop: sidebar visibile, barra in basso nascosta', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/')
    await expect(page.locator('aside')).toBeVisible()
    await expect(page.locator('nav.fixed')).toBeHidden()
  })

  test('Ctrl+K apre e Esc chiude il command palette', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
  })

  test('impostazioni: cambio lingua e tema', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/impostazioni')
    await page.getByRole('radio', { name: 'English' }).click()
    await expect(page.locator('h1')).toHaveText('Settings')
    await page.getByRole('radio', { name: 'Light' }).click()
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  })

  test('tutti i target interattivi sono almeno 44px (telefono)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/impostazioni')
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a, button, [role=radio], input')]
        .filter((e) => !e.closest('.sr-only') && !(e as HTMLElement).classList.contains('sr-only'))
        .map((e) => ({ t: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 20), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
        .filter((r) => r.h > 0 && (r.h < 43.5 || r.w < 43.5)),
    )
    expect(small).toEqual([])
  })
})
