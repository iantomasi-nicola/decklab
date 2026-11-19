import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { ID } from '../mocks/cardsData'
import { collectErrors, expectNoHorizontalScroll, prepare } from './decks.helpers'

/** Controlli interattivi sotto i 44px (l'interruttore ha l'etichetta da 44px come area di tocco; checkbox/radio/file input esclusi). */
const smallTargets = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('a, button:not([role=switch]), [role=tab], select, textarea, input:not([type=radio]):not([type=file]):not([type=checkbox]):not([type=number])')]
      .filter((e) => !e.closest('.sr-only'))
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { t: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }
      })
      .filter((r) => r.h > 0 && (r.h < 43.5 || r.w < 43.5)),
  )

const SHOTS = 'test-results/decks/stats'
mkdirSync(SHOTS, { recursive: true })

const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
const F = (i: number) => 80000000 + i

/** Mazzo di 40 carte con ruoli, coppie e un tris, scritto con i repository reali. */
async function seedStats(page: Page): Promise<string> {
  await page.goto('/impostazioni')
  await expect(page.locator('h1')).toBeVisible()
  return page.evaluate(
    async ({ id, f }) => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<{ repos: any }>
      const { repos } = await load('/src/data/repo.ts')
      const a = await repos.archetypes.create({ name: { it: 'Drago Bianco', en: 'Blue-Eyes' }, keyCards: [], starters: [id.blueEyes], extenders: [f[0]] })
      const rep = (n: number, x: number) => Array<number>(n).fill(x)
      const main = [
        ...rep(3, id.blueEyes), ...rep(2, id.darkMagician), ...rep(3, f[0]), ...rep(3, f[1]), ...rep(2, f[2]), ...rep(2, f[3]), f[4],
        ...rep(3, id.ash), id.maxxC, id.nibiru, ...rep(3, id.imperm),
      ]
      for (let i = 5; main.length < 40; i++) main.push(f[i % 100])
      const v = await repos.variants.create({
        archetypeId: a.id, name: { it: 'Versione torneo', en: 'Tournament build' }, rules: 'TCG', banlist: { format: 'TCG', id: '2026.10' },
        deck: { main, extra: [], side: [] },
      })
      const tags: Record<string, string[]> = {
        [id.blueEyes]: ['S1', 'NS'], [id.darkMagician]: ['C2'], [f[0]]: ['C2', 'C3'], [f[1]]: ['C2', 'C3'], [f[2]]: ['C2'], [f[3]]: ['C3'], [f[4]]: ['C3'],
        [id.ash]: ['NE'], [id.maxxC]: ['NE'], [id.nibiru]: ['NE'], [id.imperm]: ['NE'],
      }
      const partners = {
        [id.darkMagician]: { combo: [f[0], f[1]], brick: [id.darkMagician], forbidden: [], draw: [], garnet: [] },
        [f[0]]: { combo: [id.darkMagician, f[1]], brick: [f[0]], forbidden: [], draw: [], garnet: [] },
        [f[1]]: { combo: [f[0], id.darkMagician], brick: [f[1]], forbidden: [], draw: [], garnet: [] },
        [f[2]]: { combo: [f[1]], brick: [], forbidden: [], draw: [], garnet: [] },
      }
      const sorted = (...x: number[]) => x.sort((p, q) => p - q).join(',')
      await repos.settings.set(`stats.v1.${v.id}`, {
        v: 1, tags, partners,
        labels: { [sorted(f[0], f[0], f[3])]: 'PLAYABLE', [sorted(f[1], f[1], f[4])]: 'PLAYABLE' },
        settings: { useAssumedDeckSize: false, assumedDeckSize: 40, useSixCardHand: false, tournamentRounds: 15, tournamentMode: 'average', drawPowerMode: 'fast' },
        useCombos: true, tournament: { plan: 'mixed', k: 2 },
      })
      return v.id as string
    },
    { id: ID, f: Array.from({ length: 100 }, (_, i) => F(i)) },
  )
}

async function open(page: Page, width: number, theme: string, lang: string) {
  await prepare(page, theme, lang)
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
}

test.describe('stats lab', () => {
  test('stato vuoto senza varianti', async ({ page }) => {
    const errors = collectErrors(page)
    await open(page, 375, 'dark', 'it')
    await page.goto('/statistiche')
    await expect(page.getByRole('heading', { name: 'Nessun mazzo da analizzare' })).toBeVisible()
    await expectNoHorizontalScroll(page)
    await page.screenshot({ path: `${SHOTS}/empty-375-dark-it.png`, fullPage: true })
    expect(errors).toEqual([])
  })

  for (const width of WIDTHS)
    for (const theme of THEMES)
      for (const lang of LANGS)
        test(`mano ${width} ${theme} ${lang}`, async ({ page }) => {
          const errors = collectErrors(page)
          await open(page, width, theme, lang)
          await seedStats(page)
          await page.goto('/statistiche')
          await expect(page.getByTestId('hero-playable')).toBeVisible({ timeout: 20_000 })
          await expect(page.getByTestId('chart-odds')).toBeVisible()
          await page.evaluate(() => document.fonts.ready)
          await expectNoHorizontalScroll(page)
          expect(await smallTargets(page), 'target < 44px').toEqual([])
          await page.screenshot({ path: `${SHOTS}/mano-${width}-${theme}-${lang}.png`, fullPage: true })
          expect(errors).toEqual([])
        })

  for (const tab of ['tournament', 'sensitivity', 'composition', 'roles', 'labels'] as const)
    for (const [width, theme, lang] of [[375, 'dark', 'it'], [1024, 'light', 'en'], [1440, 'dark', 'it']] as const)
      test(`${tab} ${width} ${theme} ${lang}`, async ({ page }) => {
        const errors = collectErrors(page)
        await open(page, width, theme, lang)
        await seedStats(page)
        await page.goto('/statistiche')
        await expect(page.getByTestId('hero-playable')).toBeVisible({ timeout: 20_000 })
        await page.getByRole('tab', { name: new RegExp({ tournament: 'Torneo|Tournament', sensitivity: 'E se|What if', composition: 'Composizione|Makeup', roles: 'Ruoli|Roles', labels: 'Combinazioni|Combinations' }[tab]) }).click()
        if (tab === 'sensitivity') await expect(page.getByTestId('chart-sensitivity')).toBeVisible({ timeout: 30_000 })
        if (tab === 'composition') await expect(page.getByTestId('chart-kinds')).toBeVisible()
        await page.waitForTimeout(250)
        await expectNoHorizontalScroll(page)
        expect(await smallTargets(page), 'target < 44px').toEqual([])
        await page.screenshot({ path: `${SHOTS}/${tab}-${width}-${theme}-${lang}.png`, fullPage: true })
        expect(errors).toEqual([])
      })

  test('ruoli in massa, cambio ruolo aggiorna la probabilità, persistono dopo il reload', async ({ page }) => {
    const errors = collectErrors(page)
    await open(page, 1024, 'dark', 'it')
    await seedStats(page)
    await page.goto('/statistiche')
    const hero = page.getByTestId('hero-playable')
    await expect(hero).toBeVisible({ timeout: 20_000 })
    const before = await hero.textContent()
    await page.getByRole('tab', { name: 'Ruoli' }).click()
    // seleziona le prime due carte della lista e assegna S1 in massa
    const list = page.getByTestId('roles-list')
    await list.getByRole('checkbox').nth(1).check()
    await list.getByRole('checkbox').nth(2).check()
    await page.getByRole('group', { name: 'Assegnazione in massa' }).getByRole('button', { name: 'S1', exact: true }).click()
    await expect(hero).not.toHaveText(before!, { timeout: 10_000 })
    const after = await hero.textContent()
    await page.reload()
    await expect(page.getByTestId('hero-playable')).toHaveText(after!, { timeout: 20_000 })
    expect(errors).toEqual([])
  })

  test('torneo: modalità e soglia', async ({ page }) => {
    await open(page, 1024, 'dark', 'it')
    await seedStats(page)
    await page.goto('/statistiche')
    await expect(page.getByTestId('hero-playable')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('tab', { name: 'Torneo' }).click()
    await page.getByRole('radio', { name: 'Almeno k brick' }).click()
    await expect(page.getByRole('group', { name: 'Soglia di brick' })).toBeVisible()
    await page.getByRole('button', { name: 'Soglia di brick +' }).click()
    await expect(page.getByTestId('chart-tournament')).toBeVisible()
  })

  test('mazzo ipotetico e mano da 6 cambiano il risultato', async ({ page }) => {
    await open(page, 1024, 'dark', 'it')
    await seedStats(page)
    await page.goto('/statistiche')
    const hero = page.getByTestId('hero-playable')
    await expect(hero).toBeVisible({ timeout: 20_000 })
    const five = await hero.textContent()
    await page.getByRole('radio', { name: /Secondo/ }).click()
    await expect(hero).not.toHaveText(five!, { timeout: 10_000 })
    await page.getByRole('switch', { name: /Mazzo ipotetico/ }).click()
    await page.getByRole('button', { name: 'Carte nel mazzo +' }).click()
    await expect(page.getByTestId('stats-hero')).toContainText('41')
  })

  test('import Deckspace: crea una variante dal file reale e calcola', async ({ page }) => {
    const errors = collectErrors(page)
    await open(page, 1024, 'dark', 'it')
    await seedStats(page)
    await page.goto('/statistiche')
    await expect(page.getByTestId('hero-playable')).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Importa' }).click()
    await page.getByTestId('deckspace-text').fill(readFileSync('tests/fixtures/deckspace-unchained.json', 'utf8'))
    await expect(page.getByTestId('import-preview')).toContainText('19 carte diverse')
    await page.screenshot({ path: `${SHOTS}/import-1024-dark-it.png` })
    await page.getByRole('button', { name: 'Crea nuova variante' }).click()
    await expect(page.getByTestId('variant-select').locator('option:checked')).toHaveText('Deckspace Project', { timeout: 10_000 })
    // 40 carte, ruoli del file: 94,6% (mano da 5) con le etichette esplicite
    await expect(page.getByTestId('hero-playable')).toHaveText(/94[,.]6%/, { timeout: 20_000 })
    expect(errors).toEqual([])
  })

  test('export Deckspace: scarica un file rileggibile', async ({ page }) => {
    await open(page, 1024, 'dark', 'it')
    await seedStats(page)
    await page.goto('/statistiche')
    await expect(page.getByTestId('hero-playable')).toBeVisible({ timeout: 20_000 })
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Esporta' }).click()])
    const text = readFileSync((await dl.path())!, 'utf8')
    const json = JSON.parse(text)
    expect(json.format).toBe('YGO_DECKSPACE')
    expect(json.deck.reduce((a: number, c: { count: number }) => a + c.count, 0)).toBe(40)
  })
})
