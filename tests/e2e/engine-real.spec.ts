import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { openCombo, seedCombo } from './helpers/combo'
import { SCRIPTS_COMMIT } from '../../src/engine/constants'
import { decodeCards } from '../../src/domain/cards/cardsFormat'

/**
 * Duello VERO nell'editor: core wasm in un Web Worker, script serviti dalla cache locale (.cache/engine-scripts) al posto di
 * raw.githubusercontent.com. Si salta se la cache degli script non c'è (serve un'esecuzione di tests/engine/engine.test.ts con rete).
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

async function serveScripts(page: Page) {
  await page.route('https://raw.githubusercontent.com/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.split(SCRIPTS_COMMIT + '/')[1] ?? ''
    const file = path.join(DIR, rel.replace(/\//g, '__'))
    if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'text/plain', body: fs.readFileSync(file, 'utf8'), headers: { 'access-control-allow-origin': '*' } })
    return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } })
  })
}

const stepsOf = (page: Page) => page.evaluate(() => (window as unknown as { __comboStore: { getState(): { doc: { steps: unknown[]; engine?: { responses: string[] } } } } }).__comboStore.getState().doc)

test.skip(!have, 'cache degli script non presente')

test('duello vero: avvia, evoca dalla mano, i passi entrano nella combo, annulla e ripeti', async ({ page }) => {
  test.setTimeout(120_000)
  await serveScripts(page)
  const main = [...times('Gagaga Magician', 3), ...times('Wind-Up Soldier', 3), ...times('Pot of Desires', 3), ...times('Dark Hole', 3), ...times('Foolish Burial', 3), ...times('Raigeki', 3)]
  const extra = [code('Number 39: Utopia'), code('Number 101: Silent Honor ARK')]
  const id = await seedCombo(page, { cards: {}, deck: { main, extra } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await page.getByTestId('mode-auto').click()
  await page.getByTestId('start-panel').waitFor()
  await page.getByRole('radio', { name: 'A caso' }).click()
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: 'test-results/visual-engine/real-start.png' })
  console.log(JSON.stringify(await page.evaluate(() => { const s = (window as unknown as { __duel: { getState(): { state: { pending: { kind: string } | null; piles: { hand: unknown[] }[]; errors: string[] } | null; error: unknown } } }).__duel.getState(); return { err: s.error, pending: s.state?.pending?.kind, hand: s.state?.piles[0]?.hand.length, errors: s.state?.errors } })))
  await expect(page.locator('[data-card][data-loc="hand"]')).toHaveCount(5)
  await page.screenshot({ path: 'test-results/visual-engine/real-start.png' })

  // un mostro Normale in mano: doppio tocco = azione principale; si apre il menu se più azioni
  const hand = page.locator('[data-card][data-loc="hand"]')
  const names = await hand.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const idx = names.findIndex((n) => n === 'Gagaga Magician' || n === 'Wind-Up Soldier' || /Gagaga|Wind-Up/.test(n ?? ''))
  test.skip(idx < 0, 'nessun mostro Normale nella mano di questo seed')
  await hand.nth(idx).click()
  await page.getByTestId('act-summon').click()
  // eventuale richiesta di zona: si sceglie la prima
  const banner = page.getByTestId('place-banner')
  if (await banner.isVisible().catch(() => false)) await page.locator('[data-zone][data-valid]').first().click()
  await expect.poll(async () => (await stepsOf(page)).steps.length, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/visual-engine/real-after-summon.png' })
  expect((await stepsOf(page)).engine?.responses.length).toBeGreaterThan(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(1)

  // annulla = Ctrl+Z del motore; ripeti = Ctrl+Shift+Z
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await stepsOf(page)).steps.length).toBe(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await stepsOf(page)).steps.length).toBeGreaterThan(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(1)
})
