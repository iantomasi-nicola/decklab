import { expect, test, type Page } from '@playwright/test'
import { seedSide as seed } from './side.helpers'
import { expectNoHorizontalScroll, prepare } from './decks.helpers'

const SIZES = [
  { w: 375, h: 812 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
]

async function checkTargets(page: Page) {
  const small = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of document.querySelectorAll('main button, main a, main select, main input, main [role="radio"], [role="dialog"] button')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.closest('[data-testid="tile-out"], [data-testid="tile-in"]') && el.getAttribute('data-testid')?.endsWith('-minus') === false) continue
      if (r.height < 43.5 || r.width < 43.5) bad.push(`${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 20)}] ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return bad
  })
  expect(small, 'target < 44px').toEqual([])
}

for (const { w, h } of SIZES) {
  for (const theme of ['dark', 'light']) {
    for (const lang of ['it', 'en']) {
      test(`side ${w} ${theme} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h })
        await prepare(page, theme, lang)
        const s = await seed(page)
        const tag = `side-${w}-${theme}-${lang}`

        await page.goto('/side')
        await expect(page.getByTestId('side-view')).toBeVisible()
        await expect(page.getByTestId('plan-item')).toHaveCount(2)
        await expectNoHorizontalScroll(page)
        await checkTargets(page)
        await page.screenshot({ path: `test-results/side/${tag}-1-list.png`, fullPage: true })

        // apre "Snake-Eye" (su telefono/tablet è un passaggio in più; su schermo largo è già aperto)
        if (!(await page.getByTestId('plan-editor').isVisible())) await page.getByTestId('plan-item').filter({ hasText: 'Snake-Eye' }).click()
        const editor = page.getByTestId('plan-editor')
        await expect(editor).toBeVisible()
        await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'false') // 2 OUT, 3 IN: ne manca uno
        await expect(page.getByTestId('balance-text')).toContainText(lang === 'it' ? 'Manca 1 OUT' : '1 OUT missing')
        await expectNoHorizontalScroll(page)
        await checkTargets(page)
        await page.screenshot({ path: `test-results/side/${tag}-2-editor.png`, fullPage: true })

        // un tocco su una carta del Main completa il piano
        await page.locator('[data-testid="tile-out"][data-card-id="80000005"] button').first().click()
        await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'true')
        await page.waitForTimeout(900) // oltre il ritardo di scrittura: lo stato deve restare quello scelto
        await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'true')
        await page.screenshot({ path: `test-results/side/${tag}-3-valid.png`, fullPage: true })

        // preview (su schermo stretto è una scheda)
        const previewTab = page.getByRole('radio', { name: /^(Mazzo|Deck)/ })
        if (await previewTab.isVisible()) await previewTab.click()
        await expect(page.getByTestId('preview')).toBeVisible()
        await expectNoHorizontalScroll(page)
        await page.screenshot({ path: `test-results/side/${tag}-4-preview.png`, fullPage: true })
        void s
      })
    }
  }
}
