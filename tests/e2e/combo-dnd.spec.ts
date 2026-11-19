import { expect, test, type Page } from '@playwright/test'
import { C, card, chooseMenu, mouseDrag, openCombo, savedSteps, seedCombo, touchDrag, zone, type SeedCombo } from './helpers/combo'

/**
 * Drag & drop del campo (docs/ARCHITECTURE.md §8.1): una prova per ogni coppia origine → destinazione della tabella,
 * con il mouse (desktop) e con il touchscreen emulato (tablet 768 e 1024).
 */
const BASE: SeedCombo = {
  cards: { u1: C.tengu, u2: C.rooklord, u3: C.spell, u4: C.trap, u5: C.field, u6: C.equip, u7: C.pendulum, u8: C.ash, u9: C.xyz, u10: C.tengu, o1: C.ash },
  hand: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'],
  own: [
    { uid: 'u8', place: { loc: 'gy' } },
    { uid: 'u9', place: { loc: 'mzone', seq: 4, pos: 'FACEUP_ATK' } },
    { uid: 'u10', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' } },
  ],
  opp: [{ uid: 'o1', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' } }],
  deck: { main: [C.tengu, C.rooklord, C.spell, C.trap, C.field, C.equip, C.pendulum, C.ash, C.tengu, C.ash, C.ash], extra: [C.xyz, C.link] },
}

async function last(page: Page) {
  let steps: Array<Record<string, unknown>> = []
  await expect.poll(async () => (steps = await savedSteps(page)).length, { timeout: 6000 }).toBeGreaterThan(0)
  return steps[steps.length - 1]!
}

type Drag = (page: Page, from: ReturnType<typeof card>, to: ReturnType<typeof zone>, mods?: ('Shift' | 'Alt' | 'Control')[]) => Promise<void>

function pairs(name: string, drag: Drag, kbd = false) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => {
      await openCombo(page, await seedCombo(page, BASE))
    })

    test('Mano (mostro) → Zona Mostro: menu con Normale/Speciale/Calata', async ({ page }) => {
      await drag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'))
      const menu = page.locator('[data-pop-menu]')
      await expect(menu.locator('[data-action="normalSummon"]')).toBeVisible()
      await expect(menu.locator('[data-action="specialSummon"]')).toBeVisible()
      await expect(menu.locator('[data-action="setMonster"]')).toBeVisible()
      await chooseMenu(page, 'normalSummon')
      const s = await last(page)
      expect(s).toMatchObject({ action: 'normalSummon', card: 'u1', to: { loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } })
      await expect(card(page, 'u1')).toHaveAttribute('data-loc', 'mzone')
    })

    test('Mano (mostro) → Calata: coperta in DEF', async ({ page }) => {
      await drag(page, card(page, 'u1'), zone(page, 'z:0:mzone:1'))
      await chooseMenu(page, 'setMonster')
      expect(await last(page)).toMatchObject({ action: 'setMonster', to: { loc: 'mzone', seq: 1, pos: 'FACEDOWN_DEF' } })
    })

    test('Mano (livello 7) → Zona Mostro: Tributo con scelta toccando i mostri', async ({ page }) => {
      await drag(page, card(page, 'u2'), zone(page, 'z:0:mzone:2'))
      await chooseMenu(page, 'tributeSummon')
      await expect(page.locator('[data-pick-bar]')).toBeVisible()
      await card(page, 'u10').click()
      await card(page, 'u9').click()
      await page.getByTestId('pick-confirm').click()
      const s = await last(page)
      expect(s).toMatchObject({ action: 'tributeSummon', card: 'u2' })
      const moves = s.moves as Array<{ uid: string; why: string; to: { loc: string } }>
      expect(moves.filter((m) => m.why === 'tribute').map((m) => m.uid).sort()).toEqual(['u10', 'u9'])
      await expect(card(page, 'u10')).toHaveAttribute('data-loc', 'gy')
    })

    test('Mano (Magia/Trappola) → Zona M/T: Attiva o Cala', async ({ page }) => {
      await drag(page, card(page, 'u3'), zone(page, 'z:0:szone:2'))
      await chooseMenu(page, 'activate')
      expect(await last(page)).toMatchObject({ action: 'activate', card: 'u3', to: { loc: 'szone', seq: 2, pos: 'FACEUP' } })
    })

    test('Mano (Trappola) → Cala coperta', async ({ page }) => {
      await drag(page, card(page, 'u4'), zone(page, 'z:0:szone:1'))
      await chooseMenu(page, 'setSpellTrap')
      expect(await last(page)).toMatchObject({ action: 'setSpellTrap', to: { loc: 'szone', seq: 1, pos: 'FACEDOWN' } })
    })

    test('Mano → Terreno', async ({ page }) => {
      await drag(page, card(page, 'u5'), zone(page, 'z:0:fzone:0'))
      await chooseMenu(page, 'activate')
      expect(await last(page)).toMatchObject({ action: 'activate', card: 'u5', to: { loc: 'fzone' } })
    })

    test('Mano (Pendulum) → Zona Pendulum', async ({ page }) => {
      await drag(page, card(page, 'u7'), zone(page, 'z:0:szone:0'))
      await chooseMenu(page, 'activate')
      expect(await last(page)).toMatchObject({ action: 'activate', card: 'u7', to: { loc: 'szone', seq: 0 } })
    })

    test('Extra Deck → Zona Mostro: Speciale con metodo dedotto (Xyz) e scelta materiali', async ({ page }) => {
      await drag(page, page.locator('[data-pile-drag="extra"]'), zone(page, 'z:0:mzone:2'))
      await page.locator('[data-pile-card]').filter({ has: page.locator('img, [role=img]') }).first().waitFor()
      // il Deck Extra contiene Link e Xyz: scegli lo Xyz tramite il nome nel pannello
      await page.getByRole('button', { name: /Magi Magi/ }).click()
      await expect(page.locator('[data-pick-bar]')).toBeVisible()
      await card(page, 'u10').click()
      await page.getByTestId('pick-confirm').click()
      const s = await last(page)
      expect(s).toMatchObject({ action: 'specialSummon', method: 'xyz', to: { loc: 'mzone', seq: 2 } })
      const moves = s.moves as Array<{ uid: string; why: string; to: { loc: string; host?: string } }>
      expect(moves.find((m) => m.uid === 'u10')).toMatchObject({ why: 'material', to: { loc: 'overlay' } })
    })

    test('Extra Deck → EMZ (Link)', async ({ page }) => {
      await drag(page, page.locator('[data-pile-drag="extra"]'), zone(page, 'z:0:emz:0'))
      await page.getByRole('button', { name: /Bucephalus/ }).click()
      await page.getByRole('button', { name: /Skip|Salta/ }).click()
      expect(await last(page)).toMatchObject({ action: 'specialSummon', method: 'link', to: { loc: 'emz', seq: 0 } })
    })

    test('Cimitero → Zona Mostro: Evocazione Speciale', async ({ page }) => {
      await drag(page, card(page, 'u8'), zone(page, 'z:0:mzone:3'))
      await chooseMenu(page, 'specialSummon')
      expect(await last(page)).toMatchObject({ action: 'specialSummon', card: 'u8', from: { loc: 'gy' }, to: { loc: 'mzone', seq: 3 } })
    })

    test('Deck → Mano: cerca (scelta della carta nel pannello)', async ({ page }) => {
      await drag(page, page.locator('[data-pile-drag="deck"]'), zone(page, 'p:0:hand'))
      await page.getByRole('button', { name: /Reborn Tengu/ }).first().click()
      await chooseMenu(page, 'search')
      expect(await last(page)).toMatchObject({ action: 'search', to: { loc: 'hand' } })
    })

    test('Carta in campo → altra zona (cambia zona)', async ({ page }) => {
      await drag(page, card(page, 'u10'), zone(page, 'z:0:mzone:1'))
      expect(await last(page)).toMatchObject({ action: 'custom', card: 'u10', to: { loc: 'mzone', seq: 1 } })
    })

    test('Carta in campo → Cimitero: Manda / Distruggi', async ({ page }) => {
      await drag(page, card(page, 'u10'), zone(page, 'p:0:gy'))
      await expect(page.locator('[data-pop-menu] [data-action="destroy"]')).toBeVisible()
      await chooseMenu(page, 'destroy')
      expect(await last(page)).toMatchObject({ action: 'destroy', card: 'u10', to: { loc: 'gy' } })
    })

    test('Carta → Bandite', async ({ page }) => {
      await drag(page, card(page, 'u10'), zone(page, 'p:0:banished'))
      expect(await last(page)).toMatchObject({ action: 'banish', to: { loc: 'banished' } })
    })

    test('Carta in campo → Mano: Riprendi', async ({ page }) => {
      await drag(page, card(page, 'u10'), zone(page, 'p:0:hand'))
      expect(await last(page)).toMatchObject({ action: 'returnToHand', to: { loc: 'hand' } })
    })

    test('Carta → Deck: cima / fondo / mescola', async ({ page }) => {
      await drag(page, card(page, 'u10'), zone(page, 'p:0:deck'))
      for (const a of ['deckTop', 'deckBottom', 'deckShuffle']) await expect(page.locator(`[data-pop-menu] [data-action="${a}"]`)).toBeVisible()
      await chooseMenu(page, 'deckBottom')
      expect(await last(page)).toMatchObject({ action: 'returnToDeck', to: { loc: 'deck' } })
    })

    test('Carta → su un mostro Xyz: aggiungi come materiale', async ({ page }) => {
      await drag(page, card(page, 'u1'), card(page, 'u9'))
      const s = await last(page)
      expect(s).toMatchObject({ action: 'attach', card: 'u1', targets: ['u9'], to: { loc: 'overlay', host: 'u9' } })
      await expect(card(page, 'u1')).toHaveAttribute('data-loc', 'overlay').catch(() => undefined)
    })

    test('Magia Equipaggiamento → su un mostro: Equipaggia', async ({ page }) => {
      await drag(page, card(page, 'u6'), card(page, 'u10'))
      const s = await last(page)
      expect(s).toMatchObject({ action: 'equip', card: 'u6', targets: ['u10'], to: { loc: 'szone' } })
    })

    test('Scorciatoia Shift = Evocazione Speciale (senza menu)', async ({ page }) => {
      test.skip(!kbd, 'scorciatoie solo da tastiera fisica')
      await drag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'), ['Shift'])
      expect(await last(page)).toMatchObject({ action: 'specialSummon', card: 'u1' })
      await expect(page.locator('[data-pop-menu]')).toHaveCount(0)
    })

    test('Scorciatoia Alt = Cala e Ctrl = Attiva', async ({ page }) => {
      test.skip(!kbd, 'scorciatoie solo da tastiera fisica')
      await drag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'), ['Alt'])
      expect(await last(page)).toMatchObject({ action: 'setMonster' })
      await drag(page, card(page, 'u3'), zone(page, 'z:0:szone:2'), ['Control'])
      await expect.poll(async () => (await savedSteps(page)).map((s) => s.action)).toEqual(['setMonster', 'activate'])
    })

    test('Destinazione non sensata: nessun passo', async ({ page }) => {
      await drag(page, card(page, 'u1'), zone(page, 'z:0:szone:2')) // mostro in zona M/T
      await page.waitForTimeout(900)
      expect(await savedSteps(page)).toHaveLength(0)
    })
  })
}

test.describe('mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  pairs('desktop', mouseDrag, true)
})

for (const w of [768, 1024]) {
  test.describe(`touch ${w}`, () => {
    test.use({ viewport: { width: w, height: w === 768 ? 1024 : 768 }, hasTouch: true, isMobile: false })
    pairs(`tablet ${w}`, (page, from, to) => touchDrag(page, from, to))
  })
}

/* ------------------------------------------------------------------ alternative al drag */
test.describe('alternative al trascinamento', () => {
  test.use({ viewport: { width: 1280, height: 900 } })
  test.beforeEach(async ({ page }) => {
    await openCombo(page, await seedCombo(page, BASE))
  })

  test('doppio clic = Attiva', async ({ page }) => {
    await card(page, 'u3').dblclick()
    expect(await last(page)).toMatchObject({ action: 'activate', card: 'u3', from: { loc: 'hand' }, to: { loc: 'szone' } })
  })

  test('clic destro = menu contestuale con Sposta in…', async ({ page }) => {
    await card(page, 'u10').click({ button: 'right' })
    await expect(page.locator('[data-pop-menu]')).toBeVisible()
    await page.locator('[data-pop-menu] [data-action="posDef"]').click()
    expect(await last(page)).toMatchObject({ action: 'changePosition', card: 'u10', to: { pos: 'FACEUP_DEF' } })
  })

  test('due tocchi: seleziona la carta, poi la zona', async ({ page }) => {
    await card(page, 'u1').click()
    await expect(zone(page, 'z:0:mzone:3')).toHaveAttribute('data-valid', 'true')
    await expect(zone(page, 'z:0:szone:3')).not.toHaveAttribute('data-valid', 'true')
    await zone(page, 'z:0:mzone:3').click()
    await chooseMenu(page, 'normalSummon')
    expect(await last(page)).toMatchObject({ action: 'normalSummon', to: { seq: 3 } })
  })

  test('tastiera: Invio apre "Sposta in…" e si completa senza mouse', async ({ page }) => {
    await card(page, 'u1').focus()
    await page.keyboard.press('Enter')
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    await dlg.locator('[data-dest="mzone:1"]').focus()
    await page.keyboard.press('Enter')
    await dlg.locator('[data-action="specialSummon"]').focus()
    await page.keyboard.press('Enter')
    expect(await last(page)).toMatchObject({ action: 'specialSummon', card: 'u1', to: { seq: 1 } })
    await expect(page.getByTestId('announcer')).toContainText('Special Summon')
  })

  test('annulla e ripeti (pulsanti e Ctrl+Z / Ctrl+Shift+Z)', async ({ page }) => {
    await card(page, 'u1').dblclick()
    await expect(page.locator('[data-steps] li')).toHaveCount(1)
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-steps] li')).toHaveCount(0)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.locator('[data-steps] li')).toHaveCount(1)
    await page.getByTestId('undo').click()
    await expect(page.locator('[data-steps] li')).toHaveCount(0)
    await page.getByTestId('redo').click()
    await expect(page.locator('[data-steps] li')).toHaveCount(1)
  })

  test('LP: la modifica diventa un passo changeLP', async ({ page }) => {
    await page.locator('[data-lp="0"]').click()
    await page.getByTestId('lp-delta').fill('-1000')
    await page.getByTestId('lp-apply').click()
    expect(await last(page)).toMatchObject({ action: 'changeLP', lp: [{ p: 0, delta: -1000 }] })
    await expect(page.locator('[data-lp="0"]')).toContainText('7000')
  })

  test('annotazioni IT/EN, riordino e gruppo "ordine libero"', async ({ page }) => {
    await drag3(page)
    const first = page.locator('[data-steps] li').first()
    await first.getByRole('button').first().click()
    await page.getByTestId('note-it').fill('Evoca il motore.')
    await page.getByTestId('note-en').fill('Summon the engine.')
    await page.getByTestId('step-menu-1').click()
    await page.getByRole('menuitem', { name: /Free order|Ordine libero/ }).click()
    await expect(page.locator('[data-steps] li').nth(1)).toContainText(/Free order|Ordine libero/)
    await page.getByTestId('step-menu-1').click()
    await page.getByRole('menuitem', { name: /Move up|Sposta su/ }).click()
    const steps = await expect.poll(async () => (await savedSteps(page)).length).toBe(3).then(() => savedSteps(page))
    expect(steps[1]).toMatchObject({ card: 'u1', note: { it: 'Evoca il motore.', en: 'Summon the engine.' } })
    expect(steps[0]!.group).toBeUndefined()
  })

  test('modifica in mezzo: elimina un passo e segnala i successivi incoerenti', async ({ page }) => {
    await drag3(page)
    await page.getByTestId('step-menu-0').click()
    await page.getByRole('menuitem', { name: /Delete step|Elimina passo/ }).click()
    // il passo 2 attivava dal Cimitero una carta che ora ... resta coerente; quello che spostava u1 dalla zona non lo è più
    await expect(page.locator('[data-steps] li[data-incoherent]').first()).toBeVisible()
  })

  test('Crea variante da questo passo: nuova combo collegata, madre invariata', async ({ page }) => {
    await drag3(page)
    await page.getByTestId('step-menu-1').click()
    await page.getByRole('menuitem', { name: /up to this step|fino a questo passo/ }).click()
    await expect(page).toHaveURL(/\/combo\/.+/)
    await expect(page.locator('[data-steps] li')).toHaveCount(2)
    await page.getByRole('tab', { name: /Details|Dettagli/ }).click()
    await expect(page.getByText(/Variant of|Variante di/)).toBeVisible()
    await page.goBack()
    await expect(page.locator('[data-steps] li')).toHaveCount(3)
  })
})

/** Tre passi: Normale (Mano→M1), attiva Magia, manda u10 al Cimitero. */
async function drag3(page: Page) {
  await mouseDrag(page, card(page, 'u1'), zone(page, 'z:0:mzone:2'))
  await chooseMenu(page, 'normalSummon')
  await mouseDrag(page, card(page, 'u3'), zone(page, 'z:0:szone:2'))
  await chooseMenu(page, 'activate')
  await mouseDrag(page, card(page, 'u10'), zone(page, 'p:0:gy'))
  await chooseMenu(page, 'sendToGY')
  await expect(page.locator('[data-steps] li')).toHaveCount(3)
}

/* ------------------------------------------------------------------ touch: pressione lunga */
test.describe('touch: pressione lunga', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true })
  test('pressione lunga su una carta apre il menu contestuale', async ({ page }) => {
    await openCombo(page, await seedCombo(page, BASE))
    const c = card(page, 'u10')
    await touchDrag(page, c, c, { hold: 1100 })
    await expect(page.locator('[data-pop-menu]')).toBeVisible()
    expect(await savedSteps(page)).toHaveLength(0)
  })
  test('doppio tocco = Attiva', async ({ page }) => {
    await openCombo(page, await seedCombo(page, BASE))
    await card(page, 'u3').tap()
    await card(page, 'u3').tap()
    expect(await last(page)).toMatchObject({ action: 'activate', card: 'u3' })
  })
  test('due tocchi: carta poi zona', async ({ page }) => {
    await openCombo(page, await seedCombo(page, BASE))
    await card(page, 'u1').tap()
    await zone(page, 'z:0:mzone:3').tap()
    await chooseMenu(page, 'setMonster')
    expect(await last(page)).toMatchObject({ action: 'setMonster', to: { seq: 3, pos: 'FACEDOWN_DEF' } })
  })
})
