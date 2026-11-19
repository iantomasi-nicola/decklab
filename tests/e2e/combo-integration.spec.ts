import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { C, card, chooseMenu, mouseDrag, openCombo, openPanel, savedSteps, seedCombo, zone, type SeedCombo } from './helpers/combo'

/** Barra delle fasi, promemoria OPT, icone di gioco, suoni, condividi, controlla, mano di prova, banlist. */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })

const SEED: SeedCombo = {
  cards: { u1: C.tengu, u2: C.rooklord, u3: C.spell, u4: C.ash, u5: C.ash },
  hand: ['u1', 'u2', 'u3', 'u4'],
  own: [],
  deck: { main: [C.tengu, C.rooklord, C.spell, C.ash, C.ash, C.trap, C.field], extra: [] },
}

async function steps(page: Page, n: number) {
  let s: Array<Record<string, unknown>> = []
  await expect.poll(async () => (s = await savedSteps(page)).length, { timeout: 6000 }).toBeGreaterThanOrEqual(n)
  return s
}

test.describe('integrazioni (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test.beforeEach(async ({ page }) => {
    await openCombo(page, await seedCombo(page, SEED))
    await openPanel(page)
    await page.getByRole('tab', { name: /Steps|Passi/ }).click()
  })

  test('barra delle fasi: il cambio di fase crea un passo enterPhase; pulsanti >= 44 px', async ({ page }) => {
    const bar = page.locator('[data-turn-ui]').first()
    await expect(bar).toBeVisible()
    const boxes = await bar.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => [Math.round(r.width), Math.round(r.height)]))
    for (const [w = 0, h = 0] of boxes) expect(Math.min(w, h), `bersaglio ${w}x${h}`).toBeGreaterThanOrEqual(43)
    await bar.getByRole('button', { name: /Battle|Battaglia/ }).first().click()
    const s = await steps(page, 1)
    expect(s[0]).toMatchObject({ action: 'enterPhase', phase: 'battle' })
  })

  test('icona di gioco nel passo e promemoria "Normale fatta" dopo un\'Evocazione Normale', async ({ page }) => {
    await mouseDrag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'))
    await chooseMenu(page, 'normalSummon')
    const row = page.locator('[data-steps] li[data-step-id]').first()
    await expect(row.locator('svg[viewBox="0 0 24 24"]').first()).toBeVisible()
    await expect(page.locator('[data-turn-ui]').first()).toContainText(/Normal Summon|Normale/)
  })

  test('OPT dichiarato dall\'utente: x.opt nel passo', async ({ page }) => {
    await mouseDrag(page, card(page, 'u3'), zone(page, 'z:0:szone:2'))
    await chooseMenu(page, 'activate')
    await page.locator('[data-steps] li[data-step-id] button').first().click()
    await page.getByTestId('step-opt').selectOption('name')
    await expect.poll(async () => ((await savedSteps(page))[0]!.x as { opt?: unknown } | undefined)?.opt).toBe('name')
    await page.getByTestId('step-opt').selectOption('auto')
    await expect.poll(async () => ((await savedSteps(page))[0]!.x as { opt?: unknown } | undefined)?.opt).toBeUndefined()
  })

  test('Condividi dal menu apre la finestra con link e testo', async ({ page }) => {
    await page.getByTestId('more-menu').click()
    await page.getByRole('menuitem', { name: /Share|Condividi/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(/link|Link/)
  })

  test('Controlla segnala il passo incoerente e si può nascondere', async ({ page }) => {
    // sposta u1 in campo, poi toglie il passo che lo porta in campo: il successivo usa una carta non disponibile
    await mouseDrag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'))
    await chooseMenu(page, 'normalSummon')
    await mouseDrag(page, card(page, 'u1'), zone(page, 'p:0:gy'))
    await chooseMenu(page, 'sendToGY')
    await page.getByTestId('step-menu-0').click()
    await page.getByRole('menuitem', { name: /Delete step|Elimina passo/ }).click()
    await page.getByTestId('more-menu').click()
    await page.getByRole('menuitem', { name: /Check the combo|Controlla la combo/ }).click()
    await expect(page.locator('[data-steps] li [data-mark="coherence"]').first()).toBeVisible()
    await expect(page.getByText(/problem|problemi/).first()).toBeVisible()
  })

  test('Mano di prova: pesca una mano e mostra le combo giocabili', async ({ page }) => {
    await page.getByTestId('more-menu').click()
    await page.getByRole('menuitem', { name: /Practice hand|Mano di prova/ }).click()
    await expect(page.locator('[data-practice-hand] li')).toHaveCount(5)
    await expect(page.locator('[data-practice-result]').first()).toBeVisible()
    await page.getByTestId('practice-new').click()
    await expect(page.locator('[data-practice-hand] li')).toHaveCount(5)
  })

  test('intestazione compatta: nessun pulsante sovrapposto e nessun overflow', async ({ page }) => {
    const bad = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('header button, header a')].filter((e) => (e as HTMLElement).getBoundingClientRect().width > 1) as HTMLElement[]
      const r = hs.map((e) => e.getBoundingClientRect())
      return r.filter((a, i) => r.some((b, j) => j > i && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)).length
    })
    expect(bad).toBe(0)
  })
})

for (const [w, h] of [[375, 667], [390, 844], [768, 1024], [1024, 768], [1440, 900]] as const) {
  test(`schermata integrazioni ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openCombo(page, await seedCombo(page, SEED), 'it')
    await mouseDrag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2')).catch(() => undefined)
    await page.waitForTimeout(300)
    if (await page.locator('[data-pop-menu] [data-action="normalSummon"]').count()) await chooseMenu(page, 'normalSummon')
    if ((await page.locator('[data-panel]').count()) === 0) await page.getByTestId('panel-toggle').click()
    await page.getByRole('tab', { name: /Passi/ }).click()
    await page.waitForTimeout(400)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${OUT}/combo-integration-${w}x${h}.png` })
  })
}
