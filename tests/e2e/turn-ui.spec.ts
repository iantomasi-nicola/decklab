import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/** Stato del turno: barra fasi, chip, promemoria, marcature OPT, selezione bersagli (pagina di prova tests/harness/turn.html). */
const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
const OUT = process.env.SHOTS_DIR ?? 'test-results/visual-turn'
mkdirSync(OUT, { recursive: true })
const URL = '/tests/harness/turn.html'

async function prepare(page: Page, theme: string, lang: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Minimi: niente scroll orizzontale, niente elemento fuori viewport, target >= 44px. */
async function checks(page: Page, scope = 'body') {
  const r = await page.evaluate((sel) => {
    const vw = window.innerWidth
    const bad: string[] = []
    const small: string[] = []
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    for (const el of document.querySelectorAll(`${sel} *`)) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width <= 1 || b.height <= 1) continue
      if ((b.right > vw + 1 || b.left < -1) && !clipped(el)) bad.push(`${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)}`)
      if (el.matches('button, a, input, select, textarea') && !el.closest('.sr-only') && b.height < 43.5 && !el.closest('.h-step') === false) small.push(`${el.tagName} ${(el.textContent ?? '').trim().slice(0, 20)} h=${Math.round(b.height)}`)
    }
    // testo che sborda dal proprio contenitore (tagliato)
    const cut: string[] = []
    for (const el of document.querySelectorAll(`${sel} .tbar-label, ${sel} .tchip span, ${sel} .tpick-count, ${sel} .tpick-btn, ${sel} .tlog-what`)) {
      const e = el as HTMLElement
      if (e.scrollWidth > e.clientWidth + 1) cut.push(`${e.className}:${e.textContent}`)
    }
    return { bad, small, cut, sw: document.documentElement.scrollWidth, w: vw }
  }, scope)
  expect(r.sw, 'scroll orizzontale').toBeLessThanOrEqual(r.w)
  expect(r.bad, 'fuori viewport').toEqual([])
  expect(r.small, 'target < 44px').toEqual([])
  expect(r.cut, 'testo tagliato').toEqual([])
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`turno ${width} ${theme} ${lang}`, async ({ page }) => {
        const tag = `${width}-${theme}-${lang}`
        await prepare(page, theme, lang, width)
        await page.goto(URL)
        await expect(page.getByRole('toolbar')).toBeVisible()
        await checks(page)
        await page.screenshot({ path: `${OUT}/turn-${tag}.png`, fullPage: true })

        // promemoria aperto
        await page.locator('.tstat-more').click()
        await expect(page.locator('.tlog')).toBeVisible()
        await checks(page)
        await page.screenshot({ path: `${OUT}/turn-log-${tag}.png` })

        // combo lunga (60 passi): promemoria con molte voci, niente overflow
        await page.goto(`${URL}?long=1`)
        await page.locator('.tstat-more').click()
        await checks(page)
        await page.screenshot({ path: `${OUT}/turn-long-${tag}.png` })

        // selezione bersagli: 2 su 5, una scelta
        await page.goto(`${URL}?step=12`)
        await page.getByTestId('pick-2').click()
        const dlg = page.getByRole('dialog')
        await expect(dlg).toBeVisible()
        await page.locator('.tpick-hit').first().click()
        await expect(page.locator('.tpick-num').first()).toHaveText('1')
        await checks(page, '.tpick')
        await page.waitForTimeout(400) // fine delle animazioni di apertura
        await page.screenshot({ path: `${OUT}/pick-${tag}.png` })
      })
    }
  }
}

test.describe('comportamento', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page, 'dark', 'it', 1024)
    await page.goto(`${URL}?step=3`)
  })

  test('barra fasi: solo le transizioni valide, clic e scorciatoie', async ({ page }) => {
    const bar = page.getByRole('toolbar')
    await expect(bar.locator('[data-state=current]')).toHaveAttribute('data-phase', 'main1')
    // da Main 1: Battle, Main 2 e End raggiungibili; Draw/Standby no
    await expect(bar.locator('[data-phase=battle]')).toBeEnabled()
    await expect(bar.locator('[data-phase=end]')).toBeEnabled()
    await expect(bar.locator('[data-phase=draw]')).toBeDisabled()
    await bar.locator('[data-phase=battle]').click()
    await expect(bar.locator('[data-state=current]')).toHaveAttribute('data-phase', 'battle')
    await expect(bar.locator('[data-phase=main1]')).toBeDisabled()
    await page.keyboard.press('Alt+KeyN') // successiva = Main 2
    await expect(bar.locator('[data-state=current]')).toHaveAttribute('data-phase', 'main2')
    await page.keyboard.press('Alt+Digit6') // End
    await expect(bar.locator('[data-state=current]')).toHaveAttribute('data-phase', 'end')
    await expect(bar.locator('button:not(:disabled)')).toHaveCount(1)
  })

  test('chip: Evocazione Normale e OPT seguono il passo', async ({ page }) => {
    const chips = page.locator('.tstat-chips')
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'prev' }).click()
    await expect(chips).toContainText('Normale disponibile')
    await page.getByRole('button', { name: 'next' }).click()
    await expect(chips).toContainText('Normale fatta')
    await page.getByRole('button', { name: 'next' }).click()
    await expect(chips).toContainText('OPT 1 su 3 usati')
  })

  test('selezione bersagli: ordine numerato, pieno, conferma/annulla, tastiera', async ({ page }) => {
    await page.getByTestId('pick-2').click()
    const confirm = page.getByRole('button', { name: 'Conferma' })
    await expect(confirm).toBeDisabled()
    await expect(page.getByTestId('pick-progress')).toHaveText('0 su 2 scelti')
    const hits = page.locator('.tpick-hit')
    await hits.nth(2).click()
    await hits.nth(0).click()
    // ordine di scelta: u3 (3a carta) = 1, u1 (1a carta) = 2
    await expect(page.locator('.tpick-ring').nth(2).locator('.tpick-num')).toHaveText('1')
    await expect(page.locator('.tpick-ring').nth(0).locator('.tpick-num')).toHaveText('2')
    await expect(page.locator('.tpick-ring[data-selected] .tpick-num').nth(0)).toBeVisible()
    await expect(confirm).toBeEnabled()
    await hits.nth(1).click() // pieno: nessuna terza scelta
    await expect(page.locator('.tpick-ring[data-selected]')).toHaveCount(2)
    await expect(page.locator('[role=status]')).toContainText('Hai già scelto 2')
    await hits.nth(2).click() // toglie
    await expect(page.locator('.tpick-ring[data-selected]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('picked')).toHaveText('')

    // solo tastiera: frecce + Spazio, Ctrl+Invio conferma
    await page.getByTestId('pick-2').click()
    await expect(hits.first()).toBeFocused()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Space')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByTestId('picked')).not.toHaveText('')

    // Esc annulla
    await page.getByTestId('pick-1').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('candidato non visibile sul campo: scelta dalla lista del pannello', async ({ page }) => {
    await page.getByTestId('pick-range').click()
    await page.getByRole('button', { name: 'Carta nel Cimitero' }).click()
    await expect(page.getByRole('button', { name: 'Conferma' })).toBeEnabled()
    await page.getByRole('button', { name: 'Conferma' }).click()
    await expect(page.getByTestId('picked')).toHaveText('Carta nel Cimitero')
  })
})
