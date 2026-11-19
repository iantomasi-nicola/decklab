import { expect, test, type Page } from '@playwright/test'

/** Interazioni della modalità automatica con il motore finto (tests/harness/engine.html): DnD legale, menu, tasti, risposte. */
const URL = '/tests/harness/engine.html'
const answers = (page: Page) => page.evaluate(() => (window as unknown as { __fake: { answers: unknown[] } }).__fake.answers.map((a) => JSON.parse(JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))))

async function open(page: Page, q: string, width = 1024) {
  await page.setViewportSize({ width, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem('combolab.theme', 'dark')
    localStorage.setItem('combolab.lang', 'it')
    localStorage.setItem('combolab.sound', JSON.stringify({ volume: 0, muted: true, categories: { game: false, ui: false, feedback: false }, vibrate: false }))
  })
  await page.goto(`${URL}?${q}`)
  await page.getByTestId(q.includes('view=start') ? 'start-panel' : 'auto-board').waitFor()
  await page.waitForTimeout(300)
}
const center = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}
async function drag(page: Page, from: string, to: string, release = true) {
  const a = await center(page, from)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  const b = await center(page, to)
  await page.mouse.move(a.x + 10, a.y - 10, { steps: 3 })
  await page.mouse.move(b.x, b.y, { steps: 8 })
  if (release) await page.mouse.up()
  return b
}
const validZones = (page: Page) => page.evaluate(() => [...document.querySelectorAll('[data-zone][data-valid]')].map((e) => e.getAttribute('data-zone')!).sort())

test.describe('campo: azioni legali', () => {
  test('trascinando un mostro dalla mano si evidenziano solo le zone con un\'azione legale; rilascio = risposta; la zona scelta risponde alla richiesta di zona', async ({ page }) => {
    await open(page, 'scenario=flow')
    await drag(page, '[data-card="u1"]', '[data-zone="z:0:mzone:2"]', false)
    const zones = await validZones(page)
    expect(zones).toEqual(['z:0:mzone:0', 'z:0:mzone:2', 'z:0:mzone:3', 'z:0:mzone:4'])
    await page.mouse.up()
    // Evoca e Cala sono entrambe legali: menu al punto di rilascio con le icone di gioco
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem')).toHaveCount(2)
    await menu.getByRole('menuitem', { name: 'Evoca' }).click()
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(2)
    const a = (await answers(page)) as { type: number; action?: number; index?: number; places?: unknown[] }[]
    expect(a[0]).toMatchObject({ action: 0, index: 0 }) // SELECT_SUMMON, indice 0
    expect(a[1]!.places).toBeDefined() // la richiesta di zona è stata risolta dal rilascio
    await expect(page.locator('[data-card="u1"]')).toHaveAttribute('data-loc', 'mzone')
  })

  test('zona non legale: non accetta e spiega il motivo', async ({ page }) => {
    await open(page, 'scenario=flow')
    await drag(page, '[data-card="u1"]', '[data-zone="z:0:mzone:1"]')
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await answers(page)).toHaveLength(0)
    await expect(page.getByTestId('why')).toContainText('zona')
  })

  test('carta dell\'avversario: nessuna zona evidenziata e motivo', async ({ page }) => {
    await open(page, 'scenario=flow')
    await drag(page, '[data-card="o1"]', '[data-zone="z:0:mzone:3"]', false)
    expect(await validZones(page)).toEqual([])
    await page.mouse.up()
    await expect(page.getByTestId('why')).toContainText('avversario')
  })

  test('tocco: barra delle azioni; azione senza zona (Cala magia) risponde subito', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.locator('[data-card="u3"]').click()
    const bar = page.getByTestId('sel-bar')
    await expect(bar).toBeVisible()
    expect(await validZones(page)).toContain('z:0:szone:0')
    await bar.getByRole('button', { name: 'Cala' }).click()
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ action: 4, index: 0 }) // SELECT_SPELL_SET
  })

  test('tocco poi tocco sulla zona', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.locator('[data-card="u2"]').click()
    await page.locator('[data-zone="z:0:mzone:4"]').click()
    await page.getByRole('menuitem', { name: 'Cala' }).click()
    await expect.poll(() => answers(page).then((a) => a.length)).toBeGreaterThan(0)
    expect((await answers(page))[0]).toMatchObject({ action: 3, index: 1 }) // SELECT_MONSTER_SET sulla seconda carta
  })

  test('doppio tocco = attiva', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.locator('[data-card="u6"]').dblclick()
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ action: 5, index: 1 }) // SELECT_ACTIVATE
  })

  test('menu contestuale con tutte le azioni (clic destro)', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.locator('[data-card="u6"]').click({ button: 'right' })
    await expect(page.getByRole('menuitem')).toHaveCount(2)
  })

  test('Extra Deck: si trascina dalla pila, le azioni legali scelgono la carta', async ({ page }) => {
    await open(page, 'scenario=flow')
    await drag(page, '[data-pile-drag="extra"]', '[data-zone="z:0:emz:0"]')
    const items = page.getByRole('menuitem')
    await expect(items).toHaveCount(2)
    await items.first().click()
    await expect.poll(() => answers(page).then((a) => a.length)).toBeGreaterThan(0)
    expect((await answers(page))[0]).toMatchObject({ action: 1 }) // SELECT_SPECIAL_SUMMON
  })

  test('barra fasi: Battle risponde TO_BP', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.getByRole('button', { name: /Battle/ }).first().click()
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ action: 6 })
  })

  test('annulla e ripeti del motore', async ({ page }) => {
    await open(page, 'scenario=flow')
    await page.locator('[data-card="u6"]').dblclick()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __duel: { getState(): { state: { position: number } } } }).__duel.getState().state.position)).toBe(1)
    await page.evaluate(() => (window as unknown as { __duel: { getState(): { undo(): void } } }).__duel.getState().undo())
    await expect.poll(() => page.evaluate(() => (window as unknown as { __duel: { getState(): { state: { position: number; canRedo: boolean } } } }).__duel.getState().state.canRedo)).toBe(true)
  })
})

test.describe('richieste', () => {
  test('catena: tasto numerico, Esc passa', async ({ page }) => {
    await open(page, 'req=chain')
    await page.keyboard.press('2')
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ index: 1 })
    await open(page, 'req=chain')
    await page.keyboard.press('Escape')
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ index: null })
  })

  test('sì/no: Sì con il mouse, N da tastiera', async ({ page }) => {
    await open(page, 'req=effectYn')
    await page.getByTestId('answer-yes').click()
    expect((await answers(page))[0]).toMatchObject({ yes: true })
    await open(page, 'req=yesNo')
    await page.keyboard.press('n')
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ yes: false })
  })

  test('opzioni, posizione, numero, tipo', async ({ page }) => {
    await open(page, 'req=option')
    await page.getByTestId('option-2').click()
    expect((await answers(page))[0]).toMatchObject({ index: 2 })
    await open(page, 'req=position')
    await page.getByTestId('pos-FACEUP_DEF').click()
    expect((await answers(page))[0]).toMatchObject({ position: 4 })
    await open(page, 'req=number')
    await page.getByTestId('number-7').click()
    expect((await answers(page))[0]).toMatchObject({ value: 7 })
    await open(page, 'req=race')
    await page.getByTestId('announce-8192').click()
    expect(JSON.stringify((await answers(page))[0])).toContain('8192')
  })

  test('selezione sul campo: conferma da tastiera', async ({ page }) => {
    await open(page, 'req=cardsField')
    await page.locator('.tpick-hit').first().click()
    await page.keyboard.press('Control+Enter')
    await expect.poll(() => answers(page).then((a) => a.length)).toBe(1)
    expect((await answers(page))[0]).toMatchObject({ indicies: [0] })
  })

  test('griglia: obbligatoria, senza Annulla, con ricerca', async ({ page }) => {
    await open(page, 'req=cardsGrid')
    await expect(page.getByTestId('choice-cancel')).toHaveCount(0)
    await expect(page.getByTestId('choice-confirm')).toBeDisabled()
    await page.getByTestId('tile-4').click()
    await expect(page.getByTestId('choice-counter')).toHaveText('1 / 1')
    await page.getByTestId('choice-confirm').click()
    expect((await answers(page))[0]).toMatchObject({ indicies: [4] })
  })

  test('somma: totale parziale e conferma solo a 8', async ({ page }) => {
    await open(page, 'req=sum')
    await expect(page.getByTestId('sum-total')).toContainText('4 su 8')
    await expect(page.getByTestId('sum-confirm')).toBeDisabled()
    await page.getByTestId('tile-2').click() // valore 7: supera
    await expect(page.getByTestId('sum-confirm')).toBeDisabled()
    await page.getByTestId('tile-2').click()
    await page.getByTestId('tile-1').click() // valore 4: 4 + 4
    await expect(page.getByTestId('sum-total')).toContainText('8 su 8')
    await page.getByTestId('sum-confirm').click()
    expect((await answers(page))[0]).toMatchObject({ indicies: [1] })
  })

  test('segnalini: distribuzione validata', async ({ page }) => {
    await open(page, 'req=counter')
    await page.getByTestId('counter-plus-0').click()
    await page.getByTestId('counter-plus-0').click()
    await expect(page.getByTestId('counter-plus-0')).toBeDisabled() // massimo 2 su questa carta
    await expect(page.getByTestId('counter-confirm')).toBeDisabled()
    await page.getByTestId('counter-plus-1').click()
    await expect(page.getByTestId('counter-confirm')).toBeEnabled()
    await page.getByTestId('counter-confirm').click()
    expect((await answers(page))[0]).toMatchObject({ counters: [2, 1] })
  })

  test('zone: due zone e conferma', async ({ page }) => {
    await open(page, 'req=place2')
    await page.locator('[data-zone="z:0:mzone:0"]').click()
    await expect(page.getByTestId('place-confirm')).toBeDisabled()
    await page.locator('[data-zone="z:0:mzone:3"]').click()
    await page.getByTestId('place-confirm').click()
    const a = (await answers(page))[0] as { places: { sequence: number }[] }
    expect(a.places.map((p) => p.sequence).sort()).toEqual([0, 3])
  })

  test('ordinamento: sposta giù la prima riga', async ({ page }) => {
    await open(page, 'req=sort')
    await page.getByTestId('sort-row-0').getByRole('button', { name: /Sposta giù/ }).click()
    await page.getByTestId('sort-confirm').click()
    expect((await answers(page))[0]).toMatchObject({ order: [1, 0, 2, 3] })
  })

  test('dichiara carta: ricerca per nome', async ({ page }) => {
    await open(page, 'req=announceCard')
    await page.getByTestId('announce-search').fill('Tengu')
    await page.getByTestId(`announce-card-10028593`).click()
    expect((await answers(page))[0]).toMatchObject({ card: 10028593 })
  })

  test('avvio: Primo/Secondo, mano e rimescola', async ({ page }) => {
    await open(page, 'view=start')
    await expect(page.getByTestId('start-panel')).toBeVisible()
    const before = await page.getByTestId('seed').textContent()
    await page.getByTestId('reshuffle').click()
    await expect(page.getByTestId('seed')).not.toHaveText(before!)
    await page.getByRole('radio', { name: 'Secondo' }).click()
    await expect(page.getByTestId('second-note')).toBeVisible()
    await page.getByRole('button', { name: 'Carte in mano +' }).click()
    await expect(page.getByTestId('hand-size')).toContainText('7')
    await page.getByTestId('start-duel').click()
    await page.getByTestId('auto-board').waitFor()
    const started = await page.evaluate(() => (window as unknown as { __fake: { started: { setup: { first: boolean } }[] } }).__fake.started)
    expect(started).toHaveLength(1)
    expect(started[0]!.setup.first).toBe(false)
  })
})
