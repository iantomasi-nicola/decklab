import { expect, type Page } from '@playwright/test'
import { ID, fillerIds } from '../mocks/cardsData'

export type SideSeed = { variantId: string; planId: string; emptyVariantId: string }

/** Mazzo di prova: Main 40, Side con handtrap e rompi-board, ruoli nello Stats Lab e un piano da correggere. */
export async function seedSide(page: Page): Promise<SideSeed> {
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
