import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { C, card, chooseMenu, mouseDrag, openCombo, savedSteps, seedCombo, zone, type SeedCombo } from './helpers/combo'

/** Pannello "Pile": Cimitero e Bandite di entrambi i giocatori, con le stesse azioni del campo. */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })

const SEED: SeedCombo = {
  cards: { u1: C.tengu, u3: C.spell, u4: C.trap, u8: C.ash, u9: C.rooklord, u10: C.xyz, o1: C.ash, o2: C.trap, o3: C.equip },
  hand: ['u1'],
  own: [
    { uid: 'u8', place: { loc: 'gy', seq: 0 } },
    { uid: 'u3', place: { loc: 'gy', seq: 1 } },
    { uid: 'u9', place: { loc: 'banished', seq: 0 } },
    { uid: 'u4', place: { loc: 'banished', seq: 1 } },
  ],
  opp: [
    { uid: 'o1', place: { loc: 'gy', seq: 0 } },
    { uid: 'o2', place: { loc: 'gy', seq: 1 } },
    { uid: 'o3', place: { loc: 'banished', seq: 0 } },
  ],
  deck: { main: [C.tengu, C.spell, C.trap, C.ash, C.rooklord], extra: [C.xyz] },
}

async function openPiles(page: Page) {
  if ((await page.locator('[data-panel]').count()) === 0) await page.getByTestId('panel-toggle').click()
  await page.getByRole('tab', { name: /Piles|Pile/ }).click()
  await expect(page.locator('[data-piles-panel]')).toBeVisible()
}
async function lastStep(page: Page) {
  let steps: Array<Record<string, unknown>> = []
  await expect.poll(async () => (steps = await savedSteps(page)).length, { timeout: 6000 }).toBeGreaterThan(0)
  return steps[steps.length - 1]!
}

test.describe('pannello Pile (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async ({ page }) => {
    await openCombo(page, await seedCombo(page, SEED))
    await openPiles(page)
  })

  test('quattro sezioni con contatore, ordine di arrivo e carta più recente evidenziata', async ({ page }) => {
    for (const [key, n] of [['0:gy', 2], ['0:banished', 2], ['1:gy', 2], ['1:banished', 1]] as const) {
      const s = page.locator(`[data-pile-section="${key}"]`)
      await expect(s.locator('[data-count]')).toHaveText(String(n))
      await expect(s.locator('li')).toHaveCount(n)
      await expect(s.locator('li').last()).toHaveAttribute('data-newest', 'true')
    }
    const rows = page.locator('[data-pile-section="0:gy"] li')
    await expect(rows.nth(0)).toContainText('Ash Blossom')
    await expect(rows.nth(1)).toContainText('Branded Loss')
  })

  test('Attiva dal Cimitero: passo activate con from = gy', async ({ page }) => {
    await page.locator('[data-pile-row-open="u8"]').click()
    await chooseMenu(page, 'activate')
    expect(await lastStep(page)).toMatchObject({ action: 'activate', card: 'u8', from: { loc: 'gy' }, effect: { kind: 'ignition' } })
  })

  test('Evocazione Speciale e Riprendi in mano dal menu della carta', async ({ page }) => {
    await page.locator('[data-pile-row-open="u9"]').click() // Bandite: mostro
    await chooseMenu(page, 'q-special')
    expect(await lastStep(page)).toMatchObject({ action: 'specialSummon', card: 'u9', from: { loc: 'banished' }, to: { loc: 'mzone' } })
    await page.locator('[data-pile-row-open="u3"]').click()
    await chooseMenu(page, 'q-hand')
    await expect.poll(async () => (await savedSteps(page)).map((s) => s.action)).toEqual(['specialSummon', 'returnToHand'])
  })

  test('Rimetti nel Deck e Bandisci dall\'elenco', async ({ page }) => {
    await page.locator('[data-pile-row-open="u8"]').click()
    await chooseMenu(page, 'q-deck')
    expect(await lastStep(page)).toMatchObject({ action: 'returnToDeck', card: 'u8', from: { loc: 'gy' } })
    await page.locator('[data-pile-row-open="u3"]').click()
    await chooseMenu(page, 'q-ban')
    await expect.poll(async () => (await savedSteps(page)).map((s) => s.action)).toEqual(['returnToDeck', 'banish'])
  })

  test('trascinando la miniatura su una zona: stesso menu del campo (§8.1)', async ({ page }) => {
    await mouseDrag(page, page.locator('[data-pile-row-drag="u9"]'), zone(page, 'z:0:mzone:3'))
    await chooseMenu(page, 'setMonster')
    expect(await lastStep(page)).toMatchObject({ action: 'setMonster', card: 'u9', from: { loc: 'banished' }, to: { seq: 3, pos: 'FACEDOWN_DEF' } })
    // la carta ora è in campo e sparisce dall'elenco
    await expect(page.locator('[data-pile-row="u9"]')).toHaveCount(0)
    await expect(card(page, 'u9')).toHaveAttribute('data-loc', 'mzone')
  })

  test('carta dell\'avversario: azioni dal suo Cimitero', async ({ page }) => {
    await page.locator('[data-pile-row-open="o1"]').click()
    await chooseMenu(page, 'q-hand')
    expect(await lastStep(page)).toMatchObject({ action: 'returnToHand', card: 'o1', to: { p: 1, loc: 'hand' } })
  })

  test('l\'opzione si disattiva dai Dettagli e la scelta resta ricordata', async ({ page }) => {
    await page.getByRole('tab', { name: /Details|Dettagli/ }).click()
    await page.getByRole('switch', { name: /Graveyard and Banished panel|Pannello Cimitero/ }).click()
    await expect(page.getByRole('tab', { name: /Piles|Pile/ })).toHaveCount(0)
    await page.reload()
    await page.waitForSelector('[data-field]')
    await expect(page.getByRole('tab', { name: /Piles|Pile/ })).toHaveCount(0)
  })
})

test('telefono: spento di default; acceso mostra l\'elenco nel bottom sheet', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openCombo(page, await seedCombo(page, SEED))
  await page.getByTestId('panel-toggle').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('tab', { name: /Piles|Pile/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.evaluate(() => localStorage.setItem('combolab.field.pilesPanel', '1'))
  await page.reload()
  await page.waitForSelector('[data-field]')
  await page.getByTestId('panel-toggle').click()
  await page.getByRole('tab', { name: /Piles|Pile/ }).click()
  await expect(page.locator('[data-pile-section]')).toHaveCount(4)
  await page.screenshot({ path: `${OUT}/combo-piles-375.png` })
})

for (const [w, h] of [[768, 1024], [1024, 768], [1440, 900]] as const) {
  test(`schermata pannello Pile ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openCombo(page, await seedCombo(page, SEED), 'it')
    await openPiles(page)
    await page.waitForTimeout(300)
    const bad = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(bad).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${OUT}/combo-piles-${w}.png` })
  })
}
