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
  if (await banner.waitFor({ timeout: 4000 }).then(() => true, () => false)) await page.locator('[data-zone][data-valid]').first().click()
  await expect.poll(async () => (await stepsOf(page)).steps.length, { timeout: 15_000 }).toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/visual-engine/real-after-summon.png' })
  expect((await stepsOf(page)).engine?.responses.length).toBeGreaterThan(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(1)

  // annulla = Ctrl+Z del motore; ripeti = Ctrl+Shift+Z
  // (la scelta della zona è una risposta dell'utente: il primo annulla torna alla richiesta di zona, il secondo al menu)
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+z')
  await expect.poll(async () => (await stepsOf(page)).steps.length).toBe(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+Shift+z')
  await expect.poll(async () => (await stepsOf(page)).steps.length).toBeGreaterThan(0)
  await expect(page.locator('[data-card][data-loc="mzone"]')).toHaveCount(1)
})

test('duello vero pilotato (Sky Striker): ogni richiesta del motore ha il suo componente, nessun errore di pagina', async ({ page }) => {
  test.setTimeout(180_000)
  await serveScripts(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const main = ['Sky Striker Ace - Raye', 'Sky Striker Mobilize - Engage!', 'Sky Striker Mecha - Hornet Drones', 'Ash Blossom & Joyous Spring', 'Pot of Desires', 'Foolish Burial', 'Raigeki'].flatMap((n) => times(n, 3))
  const extra = ['Sky Striker Ace - Kagari', 'Sky Striker Ace - Hayate'].map(code)
  const id = await seedCombo(page, { cards: {}, deck: { main, extra } })
  await page.setViewportSize({ width: 1280, height: 900 })
  await openCombo(page, id, 'it')
  await page.getByTestId('mode-auto').click()
  await page.getByRole('radio', { name: 'A caso' }).click()
  await page.getByTestId('start-duel').click()
  await page.getByTestId('auto-board').waitFor({ timeout: 60_000 })
  const seen = new Set<string>()
  const SHEET = new Set(['chain', 'effectYn', 'yesNo', 'option', 'cards', 'unselect', 'sum', 'counter', 'position', 'sort', 'announceRace', 'announceAttribute', 'announceNumber', 'announceCard', 'rps'])
  for (let n = 0; n < 40; n++) {
    const kind = await page.evaluate(() => (window as unknown as { __duel: { getState(): { state: { pending: { kind: string } | null } | null } } }).__duel.getState().state?.pending?.kind ?? null)
    if (!kind) break
    seen.add(kind)
    if (SHEET.has(kind)) await expect(page.locator('[data-engine-sheet], .tpick-actions').first(), `richiesta ${kind}`).toBeVisible({ timeout: 5000 })
    if (kind === 'place') await expect(page.getByTestId('place-banner')).toBeVisible()
    if (n % 6 === 0) await page.screenshot({ path: `test-results/visual-engine/real-sky-${n}-${kind}.png` })
    const ok = await page.evaluate(async (n) => {
      const { drive } = await import(/* @vite-ignore */ '/tests/engine/driver.ts')
      const d = (window as unknown as { __duel: { getState(): { state: { pending: unknown } | null; respond(a: unknown): Promise<boolean> } } }).__duel.getState()
      return d.respond(drive(d.state!.pending as never, { step: n, idleOrder: n % 2 ? ['activate', 'specialSummon', 'summon'] : ['summon', 'activate', 'specialSummon'], chain: 'first' }))
    }, n)
    expect(ok, `risposta ${n} (${kind})`).toBe(true)
    await page.waitForTimeout(60)
  }
  expect(errors).toEqual([])
  expect(seen.size).toBeGreaterThan(2)
  console.log('kind incontrati:', [...seen].join(', '))
})
