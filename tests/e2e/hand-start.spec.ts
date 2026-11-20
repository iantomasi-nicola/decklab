import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { openCombo, seedCombo } from './helpers/combo'
import { SCRIPTS_COMMIT } from '../../src/engine/constants'
import { decodeCards } from '../../src/domain/cards/cardsFormat'

/**
 * Mano di partenza: percorso REALE da interfaccia (dati carte reali, duello vero con gli script dalla cache locale).
 * Config: playwright.hand.config.ts (porta 4195).
 */
const root = path.resolve(process.cwd())
const DIR = path.join(root, '.cache/engine-scripts', SCRIPTS_COMMIT.slice(0, 12))
const have = fs.existsSync(path.join(DIR, 'utility.lua'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/manifest.json'), 'utf8')) as { files: { cards: string } }
const cards = new Map(decodeCards(JSON.parse(fs.readFileSync(path.join(root, 'public/data', manifest.files.cards), 'utf8'))).map((c) => [c.id, c]))
const code = (name: string): number => {
  for (const c of cards.values()) if (c.name.en === name && c.alias === 0) return c.id
  throw new Error('carta non trovata: ' + name)
}
const times = (name: string, n: number) => Array.from({ length: n }, () => code(name))
const DECK = [...times('Gagaga Magician', 3), ...times('Wind-Up Soldier', 3), ...times('Pot of Desires', 3), ...times('Dark Hole', 3), ...times('Foolish Burial', 3), ...times('Raigeki', 3)]

async function serveScripts(page: Page) {
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.split(SCRIPTS_COMMIT + '/')[1] ?? ''
    const file = path.join(DIR, rel.replace(/\//g, '__'))
    if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/plain', body: fs.readFileSync(file, 'utf8'), headers: { 'access-control-allow-origin': '*' } })
    return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } })
  })
}

type Store = { getState(): { doc: { cards: Record<string, number>; steps: unknown[]; setup: { hand: { required: string[]; size: number; fill: string } } } } }
const docOf = (page: Page) => page.evaluate(() => (window as unknown as { __comboStore: Store }).__comboStore.getState().doc)
const handNames = (page: Page) => page.locator('[data-card][data-loc="hand"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

test.skip(!have, 'cache degli script non presente')

const handLabel = async (page: Page) => (await handNames(page)).sort()
const nameOfCode = (c: number) => cards.get(c)!.name.it ?? cards.get(c)!.name.en
const previewNames = async (page: Page) => (await page.locator('[data-testid=hand-preview] [data-code]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-code'))))).map(nameOfCode).sort()
const noOverflow = async (page: Page) => {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(sw).toBeLessThanOrEqual(iw!)
}
const startAuto = async (page: Page) => {
  await page.getByTestId('mode-auto').click()
  await page.getByTestId('start-panel').waitFor()
}
const begin = async (page: Page) => {
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(500)
}


/** "+ → Aggiungi carta → Mano" con la carta scelta per nome (stesso percorso dell'utente). */
async function addToHandFromMenu(page: Page, name: string) {
  await page.getByTestId('add-menu').click()
  await page.getByRole('menuitem', { name: /Aggiungi carta o token|Add card or token/ }).click()
  await page.getByTestId('add-search').fill(name)
  await page.getByRole('list', { name: /Risultati|Results/ }).getByRole('button').first().click()
  await page.getByRole('radio', { name: /^(Mano|Hand)$/ }).click()
  await page.getByTestId('add-confirm').click()
}


test('REPRO (era rotto): carta aggiunta alla mano dalla scheda Passi, poi Automatica + Avvia: la carta resta in mano', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: {}, deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await addToHandFromMenu(page, 'Raigeki')
  await expect(page.locator('[data-card][data-loc="hand"]')).toHaveCount(1)
  expect((await docOf(page)).setup.hand.required).toHaveLength(1)
  expect((await docOf(page)).steps).toHaveLength(0)
  await startAuto(page)
  // la fascia mostra la mano che partirà e dice la verità
  await expect(page.getByTestId('hand-preview').locator('[data-code]')).toHaveCount(1)
  await expect(page.getByTestId('hand-line')).toContainText('1 carta esatta')
  await begin(page)
  expect(await handLabel(page)).toEqual([nameOfCode(code('Raigeki'))])
  expect(Object.values((await docOf(page)).cards)).toContain(code('Raigeki'))
})

test('la fascia Avvia dice la verità: esatta = solo le scelte; l\'anteprima coincide con la mano reale', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: { u1: code('Raigeki'), u2: code('Dark Hole') }, hand: ['u1', 'u2'], deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await startAuto(page)
  await expect(page.getByTestId('hand-line')).toContainText('2 carte esatte')
  expect(await page.getByTestId('start-panel').innerText()).not.toMatch(/5 carte|Carte in mano: 5/)
  expect(await previewNames(page)).toEqual([nameOfCode(code('Dark Hole')), nameOfCode(code('Raigeki'))].sort())
  await begin(page)
  expect(await handLabel(page)).toEqual([nameOfCode(code('Dark Hole')), nameOfCode(code('Raigeki'))].sort())
})

test('mista: scelte + a caso; anteprima = mano reale; Rimescola la cambia; Ripeti l\'ultima mano la ripristina', async ({ page }) => {
  test.setTimeout(150_000)
  await serveScripts(page)
  const id = await seedCombo(page, { cards: { u1: code('Raigeki') }, hand: ['u1'], deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await startAuto(page)
  await page.getByTestId('hand-edit-btn').click()
  await page.getByRole('radio', { name: 'Mista' }).click()
  await page.getByTestId('start-sheet-done').click()
  await expect(page.getByTestId('hand-line')).toContainText('1 scelte + 4 a caso')
  await expect(page.getByTestId('hand-preview').locator('[data-code]')).toHaveCount(5)
  const first = await previewNames(page)
  expect(first).toContain(nameOfCode(code('Raigeki')))
  // Rimescola: nuova anteprima (con 18 carte da 6 nomi è praticamente certo che cambi in qualche tentativo)
  let changed = false
  for (let i = 0; i < 6 && !changed; i++) {
    await page.getByTestId('reshuffle').click()
    await page.waitForTimeout(250)
    changed = JSON.stringify(await previewNames(page)) !== JSON.stringify(first)
  }
  expect(changed).toBe(true)
  const shown = await previewNames(page)
  await begin(page)
  expect(await handLabel(page)).toEqual(shown)
})

test('Setup: un tocco aggiunge dal mazzo, un tocco sulla carta in mano la toglie; modalità e dimensione', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: {}, deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await page.getByRole('tab', { name: 'Setup' }).click()
  const picker = page.getByTestId('hand-picker')
  await picker.getByRole('radio', { name: 'A caso' }).click()
  await picker.getByTestId('hand-deck').locator(`[data-deck-card="${code('Raigeki')}"]`).click()
  await picker.getByTestId('hand-deck').locator(`[data-deck-card="${code('Raigeki')}"]`).click()
  await picker.getByTestId('hand-deck').locator(`[data-deck-card="${code('Dark Hole')}"]`).click()
  // il tocco da "A caso" passa a "Mista"; la mano reale del documento coincide
  await expect(page.getByTestId('hand-summary')).toContainText('3 scelte + 2 a caso = 5 carte')
  let d = await docOf(page)
  expect(d.setup.hand).toMatchObject({ fill: 'random', size: 5 })
  expect(d.setup.hand.required.map((u) => d.cards[u])).toEqual([code('Raigeki'), code('Raigeki'), code('Dark Hole')])
  // la mano sul campo mostra le 3 carte scelte
  await expect(page.locator('[data-card][data-loc="hand"]')).toHaveCount(3)
  // tocco sulla carta in mano: la toglie
  await picker.locator(`[data-hand-card="${code('Dark Hole')}"]`).click()
  d = await docOf(page)
  expect(d.setup.hand.required).toHaveLength(2)
  // esatta: nessun completamento casuale
  await picker.getByRole('radio', { name: 'Esatta' }).click()
  d = await docOf(page)
  expect(d.setup.hand.fill).toBe('none')
  await expect(page.getByTestId('hand-summary')).toContainText('Mano esatta: 2 carte')
  // a caso e ritorno: le scelte si ricordano
  await picker.getByRole('radio', { name: 'A caso' }).click()
  expect((await docOf(page)).setup.hand.required).toHaveLength(0)
  await picker.getByRole('radio', { name: 'Mista' }).click()
  expect((await docOf(page)).setup.hand.required).toHaveLength(2)
})

test('carta in mano dopo che esistono passi: si chiede "mano iniziale" o "come passo"', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: { u1: code('Raigeki') }, hand: ['u1'], deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await page.evaluate(() => (window as unknown as { __comboStore: { getState(): { apply(d: unknown): void } } }).__comboStore.getState().apply({ step: { action: 'custom', label: 'x', moves: [] } }))
  await addToHandFromMenu(page, 'Dark Hole')
  await expect(page.getByTestId('hand-ask')).toBeVisible()
  expect((await docOf(page)).setup.hand.required).toHaveLength(1)
  await page.screenshot({ path: 'test-results/hand/ask-strip.png' })
  await page.getByTestId('hand-ask-setup').click()
  await expect(page.getByTestId('hand-ask')).toHaveCount(0)
  expect((await docOf(page)).setup.hand.required).toHaveLength(2)
  expect((await docOf(page)).steps).toHaveLength(1)
  await addToHandFromMenu(page, 'Pot of Desires')
  await page.getByTestId('hand-ask-step').click()
  expect((await docOf(page)).setup.hand.required).toHaveLength(2)
  expect((await docOf(page)).steps).toHaveLength(2)
})

test('mano esatta vuota: avviso chiaro prima di avviare (mai una mano vuota in silenzio)', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: {}, deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await startAuto(page)
  await expect(page.getByTestId('hand-issues')).toContainText('La mano è vuota')
})

for (const [width, theme, lang] of [[375, 'dark', 'it'], [375, 'light', 'en'], [768, 'dark', 'en'], [768, 'light', 'it'], [1440, 'light', 'it'], [1440, 'dark', 'en']] as const) {
  test(`schermate mano a ${width} ${theme} ${lang}: fascia Avvia, foglio, Setup`, async ({ page }) => {
    test.setTimeout(120_000)
    await serveScripts(page)
    const id = await seedCombo(page, { cards: { u1: code('Raigeki'), u2: code('Dark Hole') }, hand: ['u1', 'u2'], deck: { main: DECK, extra: [] } })
    await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
    await openCombo(page, id, lang, theme)
    await startAuto(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `test-results/hand/band-${width}-${theme}-${lang}.png` })
    await noOverflow(page)
    // il campo resta grande: la fascia non supera il 30% dell'altezza
    const [pb, vh] = await page.evaluate(() => [document.querySelector('[data-testid=start-panel]')!.getBoundingClientRect().height, window.innerHeight])
    expect(pb!).toBeLessThan(vh! * 0.32)
    // target >= 44 px nella fascia
    const small = await page.getByTestId('start-panel').locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.height < 43.5 || r.width < 43.5).length)
    expect(small).toBe(0)
    await page.getByTestId('hand-edit-btn').click()
    await page.getByTestId('start-sheet').waitFor()
    await page.getByRole('radio', { name: lang === 'it' ? 'Mista' : 'Mixed' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `test-results/hand/sheet-${width}-${theme}-${lang}.png` })
    await noOverflow(page)
    await page.getByTestId('start-sheet-done').click()
    // scheda Setup (da 768: pannello laterale; sotto: foglio)
    if (width >= 768) {
      if (!(await page.getByTestId('hand-picker').count())) {
        const toggle = page.getByTestId('panel-toggle')
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click()
      }
      await page.getByRole('tab', { name: 'Setup' }).click()
      await page.getByTestId('hand-picker').waitFor()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `test-results/hand/setup-${width}-${theme}-${lang}.png` })
      await noOverflow(page)
    }
  })
}
