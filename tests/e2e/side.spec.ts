import { expect, test, type Page } from '@playwright/test'
import { ID, fillerIds } from '../mocks/cardsData'
import { expectNoHorizontalScroll, prepare } from './decks.helpers'

type Seed = { variantId: string; planId: string; emptyVariantId: string }

/** Mazzo di prova: Main 40, Side con handtrap e rompi-board, ruoli nello Stats Lab e un piano da correggere. */
async function seed(page: Page): Promise<Seed> {
  await page.goto('/impostazioni')
  await expect(page.locator('h1')).toBeVisible()
  return page.evaluate(
    async ({ filler, ids }) => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<{ repos: any }>
      const { repos } = await load('/src/data/repo.ts')
      const a = await repos.archetypes.create({ name: { it: 'Drago Bianco', en: 'Blue-Eyes' }, keyCards: [], starters: [], extenders: [] })
      const main = [ids.ash, ids.ash, ids.blueEyes, ids.blueEyes, ids.blueEyes, ids.darkMagician, ids.darkMagician, ...filler.slice(0, 33)]
      const v = await repos.variants.create({
        archetypeId: a.id,
        name: { it: 'Versione torneo', en: 'Tournament build' },
        rules: 'TCG',
        banlist: { format: 'TCG', id: '2026.10' },
        deck: { main, extra: [ids.accesscode, ids.baronne], side: [ids.maxxC, ids.nibiru, ids.imperm, ids.imperm, ids.raigeki, 70000003] },
      })
      const empty = await repos.variants.create({
        archetypeId: a.id,
        name: { it: 'Senza side', en: 'No side' },
        rules: 'TCG',
        banlist: { format: 'TCG', id: '2026.10' },
        deck: { main: filler.slice(0, 40), extra: [], side: [] },
      })
      // ruoli (come nello Stats Lab): handtrap/rompi-board nel Side, non-engine e brick nel Main
      await repos.settings.set(`stats.v1.${v.id}`, {
        v: 1,
        tags: {
          [ids.maxxC]: ['handtrap'],
          [ids.nibiru]: ['handtrap'],
          [ids.imperm]: ['handtrap'],
          70000003: ['breaker'],
          [ids.darkMagician]: ['NE'],
          [filler[0]!]: ['NE'],
          [ids.blueEyes]: ['S1'],
        },
        partners: { [ids.ash]: { combo: [], brick: [ids.ash], forbidden: [], draw: [], garnet: [] } },
        labels: {},
        settings: { useAssumedDeckSize: false, assumedDeckSize: 40, useSixCardHand: false, tournamentRounds: 15, tournamentMode: 'average', drawPowerMode: 'fast' },
        useCombos: true,
        tournament: { plan: 'mixed', k: 1 },
      })
      const p = await repos.sidePlans.create({
        variantId: v.id,
        matchup: { name: 'Snake-Eye', archetype: 'Snake-Eye', note: '', turn: 'second' },
        outs: [{ cardId: ids.blueEyes, count: 2 }],
        ins: [{ cardId: ids.maxxC, count: 1 }, { cardId: ids.imperm, count: 2 }],
      })
      await repos.sidePlans.create({
        variantId: v.id,
        matchup: { name: 'Tenpai', note: 'Attenzione al Fulgurant', turn: 'first' },
        outs: [],
        ins: [],
      })
      localStorage.setItem('combolab.side.variant', v.id)
      return { variantId: v.id, planId: p.id, emptyVariantId: empty.id }
    },
    { filler: fillerIds(60), ids: ID },
  )
}

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
        await page.screenshot({ path: `test-results/side/${tag}-3-valid.png`, fullPage: true })

        // preview (su schermo stretto è una scheda)
        if (w < 700) {
          await page.getByRole('radio', { name: /^(Mazzo|Deck)/ }).click()
        }
        await expect(page.getByTestId('preview')).toBeVisible()
        await expectNoHorizontalScroll(page)
        await page.screenshot({ path: `test-results/side/${tag}-4-preview.png`, fullPage: true })
        void s
      })
    }
  }
}
