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

/** "+ → Aggiungi carta → Mano" con la carta scelta per nome (stesso percorso dell'utente). */
async function addToHandFromMenu(page: Page, name: string) {
  await page.getByTestId('add-menu').click()
  await page.getByRole('menuitem', { name: /Aggiungi carta o token|Add card or token/ }).click()
  await page.getByTestId('add-search').fill(name)
  await page.getByRole('button', { name: new RegExp(`^.*${name}`) }).first().click()
  await page.getByRole('radio', { name: /^(Mano|Hand)$/ }).click()
  await page.getByTestId('add-confirm').click()
}

test('REPRO: carta aggiunta alla mano dalla scheda Passi, poi Automatica + Avvia: la carta resta in mano', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: {}, deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await addToHandFromMenu(page, 'Raigeki')
  await expect(page.locator('[data-card][data-loc="hand"]')).toHaveCount(1)
  // l'utente passa ad Automatica e preme Avvia con "Solo necessarie": la mano deve contenere Raigeki
  await page.getByTestId('mode-auto').click()
  await page.getByTestId('start-panel').waitFor()
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(500)
  const names = await handNames(page)
  expect(names, 'la carta aggiunta alla mano non deve sparire').toContain('Raigeki')
  const d = await docOf(page)
  expect(Object.values(d.cards)).toContain(code('Raigeki'))
})

test('REPRO: il pannello Avvia dice la verità sulla mano', async ({ page }) => {
  await serveScripts(page)
  const id = await seedCombo(page, { cards: { u1: code('Raigeki'), u2: code('Dark Hole') }, hand: ['u1', 'u2'], deck: { main: DECK, extra: [] } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await page.getByTestId('mode-auto').click()
  await page.getByTestId('start-panel').waitFor()
  await page.getByRole('radio', { name: 'Solo necessarie' }).click()
  const txt = (await page.getByTestId('start-panel').innerText()).replace(/\s+/g, ' ')
  expect(txt).not.toMatch(/Carte in mano: 5/)
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(500)
  expect(await handNames(page)).toHaveLength(2)
})
