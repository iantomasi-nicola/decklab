import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { seedSide } from './side.helpers'
import { alignmentIssues } from './helpers/align'
import { overflowing } from './decks.helpers'

/** Stati vuoto + finestre (dialog) a 375/1440, scuro/chiaro, it/en. Screenshot a piena risoluzione in test-results/visivo/. */
const OUT = 'test-results/visivo'
mkdirSync(OUT, { recursive: true })
const W = [375, 1440] as const
const H: Record<number, number> = { 375: 667, 1440: 900 }
const combos: ['dark' | 'light', 'it' | 'en'][] = [['dark', 'it'], ['light', 'en'], ['dark', 'en'], ['light', 'it']]

for (const [theme, lang] of combos) {
  test.describe(`${theme} ${lang}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(([th, lg]) => {
        try { localStorage.setItem('combolab.theme', th!); localStorage.setItem('combolab.lang', lg!) } catch { /* */ }
      }, [theme, lang])
    })

    test('stati vuoti', async ({ page }) => {
      const found: Record<string, unknown> = {}
      for (const w of W) {
        await page.setViewportSize({ width: w, height: H[w]! })
        for (const r of ['/archetipi', '/mazzi', '/combo', '/side', '/statistiche', '/importa']) {
          await page.goto(r)
          await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
          await page.waitForTimeout(500)
          await page.screenshot({ path: `${OUT}/vuoto${r.replace('/', '-')}-${w}-${theme}-${lang}.png` })
          const a = await alignmentIssues(page)
          const o = await overflowing(page)
          if (a.length || o.length) found[`${r}@${w}`] = { a, o }
        }
      }
      writeFileSync(`${OUT}/vuoto-${theme}-${lang}.json`, JSON.stringify(found, null, 1))
      expect(found).toEqual({})
    })

    test('dialog', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 })
      const seed = await seedSide(page)
      const found: Record<string, unknown> = {}
      const shot = async (name: string, w: number) => {
        const dlg = page.getByRole('dialog').first()
        await expect(dlg).toBeVisible()
        await page.waitForTimeout(350)
        await page.screenshot({ path: `${OUT}/dlg-${name}-${w}-${theme}-${lang}.png` })
        const a = await alignmentIssues(page)
        const o = await overflowing(page)
        if (a.length || o.length) found[`${name}@${w}`] = { a, o }
        await page.keyboard.press('Escape')
        await expect(dlg).toBeHidden()
      }
      for (const w of W) {
        await page.setViewportSize({ width: w, height: H[w]! })
        await page.goto('/archetipi')
        await page.getByRole('button', { name: /Nuovo archetipo|New archetype/ }).first().click()
        await shot('archetipo-nuovo', w)
        await page.goto(`/side`)
        await page.getByRole('button', { name: /Nuovo matchup|New matchup/ }).first().click()
        await shot('matchup-nuovo', w)
        await page.goto(`/mazzi/${seed.variantId}`)
        await page.getByRole('button', { name: /Impostazioni|Settings|Modifica|Edit/ }).first().click().catch(() => {})
        if (await page.getByRole('dialog').count()) await shot('variante', w)
      }
      writeFileSync(`${OUT}/dlg-${theme}-${lang}.json`, JSON.stringify(found, null, 1))
      expect(found).toEqual({})
    })
  })
}
