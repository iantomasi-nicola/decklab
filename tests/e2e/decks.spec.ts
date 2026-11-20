import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { serializeYdk } from '../../src/domain/deck/ydk'
import { serializeYdke } from '../../src/domain/deck/ydke'
import { serializeDeckJson } from '../../src/domain/deck/importDetect'
import { ID, fillerIds } from '../mocks/cardsData'
import { collectErrors, expectNoHorizontalScroll, prepare, seed, smallTargets } from './decks.helpers'

const SHOTS = 'test-results/decks/shots'
mkdirSync(SHOTS, { recursive: true })

/** Pulsante "aggiungi al mazzo" di un risultato di ricerca (esclude quello del Side). */
const addBtn = (page: Page | Locator, name: string) => page.getByRole('button', { name: new RegExp(`^(Aggiungi|Add) ${name}.*(al mazzo|to the deck)$`) })

const search = (page: Page) => page.getByRole('searchbox', { name: /^(cerca carte|search cards)$/i })

/* ------------------------------------------------------------------ */
/* Archetipi                                                           */
/* ------------------------------------------------------------------ */
test.describe('archetipi', () => {
  test('stato vuoto utile, creazione, ricerca, preferiti, tag, duplica, elimina con annulla', async ({ page }) => {
    const errors = collectErrors(page)
    await prepare(page, 'dark', 'it')
    await page.setViewportSize({ width: 1024, height: 800 })
    await page.goto('/archetipi')
    await expect(page.getByRole('heading', { name: 'Nessun archetipo' })).toBeVisible()
    await page.getByRole('button', { name: 'Nuovo archetipo' }).click()

    const dlg = page.getByRole('dialog')
    await dlg.getByLabel('Nome in italiano').fill('Fiamma Eterna')
    await dlg.getByLabel('Nome in inglese').fill('Eternal Flame')
    await dlg.getByLabel('Nuovo tag').fill('Meta')
    await dlg.getByRole('button', { name: 'Aggiungi' }).click()
    await expect(dlg.getByRole('button', { name: 'Meta', pressed: true })).toBeVisible()
    await dlg.getByRole('button', { name: 'Crea archetipo' }).click()
    await expect(page.getByTestId('archetype-title')).toHaveText('Fiamma Eterna')

    await page.goto('/archetipi')
    await expect(page.getByTestId('archetype-card')).toHaveCount(1)
    // preferiti
    await page.getByRole('button', { name: /Aggiungi Fiamma Eterna ai preferiti/ }).click()
    await expect(page.getByRole('button', { name: /Togli Fiamma Eterna dai preferiti/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('filter-favorites').click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(1)
    await page.getByTestId('filter-favorites').click()
    // filtro per tag
    await page.getByRole('group', { name: 'Filtri' }).getByRole('button', { name: 'Meta' }).click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(1)
    await page.getByRole('group', { name: 'Filtri' }).getByRole('button', { name: 'Meta' }).click()
    // ricerca senza risultati e azzeramento
    await page.getByRole('searchbox', { name: 'Cerca archetipi' }).fill('zzzz')
    await expect(page.getByRole('heading', { name: 'Nessun archetipo trovato' })).toBeVisible()
    await page.getByRole('button', { name: 'Azzera i filtri' }).click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(1)
    // duplica
    await page.getByRole('button', { name: /Azioni per Fiamma Eterna/ }).click()
    await page.getByRole('menuitem', { name: 'Duplica' }).click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Fiamma Eterna (copia)' })).toBeVisible()
    // elimina e annulla
    await page.getByRole('button', { name: /Azioni per Fiamma Eterna \(copia\)/ }).click()
    await page.getByRole('menuitem', { name: 'Elimina' }).click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByTestId('archetype-card')).toHaveCount(2)
    expect(errors).toEqual([])
  })

  test('pagina archetipo: nomi, note, carte chiave, varianti (crea, duplica, elimina+annulla); persistenza dopo ricarica', async ({ page }) => {
    await prepare(page, 'dark', 'it')
    await page.setViewportSize({ width: 1280, height: 900 })
    const s = await seed(page)
    await page.goto(`/archetipi/${s.archetypeId}`)
    await expect(page.getByTestId('archetype-title')).toHaveText('Drago Bianco')

    await page.getByTestId('name').fill('Blue-Eyes Deck')
    await page.getByTestId('name').blur()
    await page.getByTestId('notes').fill('Nuovo piano di gioco')
    await page.getByTestId('notes').blur()

    // carta chiave dal selettore
    await page.getByTestId('add-extenders').click()
    const dlg = page.getByRole('dialog')
    await dlg.getByRole('searchbox').fill('maxx')
    await dlg.getByTestId('picker-result').first().click()
    await dlg.getByRole('button', { name: /Fatto \(1 carta\)/ }).click()
    await expect(page.getByTestId('role-extenders').getByTestId('role-card')).toHaveCount(1)

    // varianti: 2 già presenti
    await expect(page.getByTestId('variant-card')).toHaveCount(2)
    await page.getByRole('button', { name: /Azioni per Versione torneo/ }).click()
    await page.getByRole('menuitem', { name: 'Duplica' }).click()
    await expect(page.getByTestId('variant-card')).toHaveCount(3)
    await expect(page.getByTestId('variant-card').filter({ hasText: 'Versione torneo (copia)' })).toHaveCount(1)
    await page.getByRole('button', { name: /Azioni per Versione torneo \(copia\)/ }).click()
    await page.getByRole('menuitem', { name: 'Elimina' }).click()
    await expect(page.getByTestId('variant-card')).toHaveCount(2)
    await page.getByRole('button', { name: 'Annulla' }).click()
    await expect(page.getByTestId('variant-card')).toHaveCount(3)

    // nuova variante: regole OCG → banlist OCG predefinita
    await page.getByTestId('new-variant').click()
    const vd = page.getByRole('dialog')
    await vd.getByLabel('Nome in italiano').fill('Versione OCG')
    await vd.getByRole('radio', { name: 'OCG' }).click()
    await expect(vd.getByLabel('Banlist')).toHaveValue('OCG|2026.10')
    await vd.getByRole('button', { name: 'Crea variante' }).click()
    await expect(page).toHaveURL(/\/mazzi\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('deck-title')).toHaveText('Versione OCG')

    await page.goto(`/archetipi/${s.archetypeId}`)
    await page.reload()
    await expect(page.getByTestId('name')).toHaveValue('Blue-Eyes Deck')
    await expect(page.getByTestId('notes')).toHaveValue('Nuovo piano di gioco')
    await expect(page.getByTestId('role-extenders').getByTestId('role-card')).toHaveCount(1)
  })

  test('stato vuoto varianti con azioni', async ({ page }) => {
    await prepare(page, 'light', 'en')
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/archetipi')
    await page.getByRole('button', { name: 'New archetype' }).click()
    await page.getByRole('dialog').getByLabel('Name in English').fill('Test')
    await page.getByRole('dialog').getByRole('button', { name: 'Create archetype' }).click()
    await expect(page.getByRole('heading', { name: 'No variants yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Import deck' }).first()).toBeVisible()
  })
})

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */
test.describe('editor (PC, pannelli affiancati)', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page, 'dark', 'it')
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test('ricerca IT/EN, un tocco, doppio tocco in Side, annulla/ripeti, legalità in tempo reale, cambio banlist', async ({ page }) => {
    const errors = collectErrors(page)
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    await expect(page.getByTestId('deck-editor')).toHaveAttribute('data-wide', 'true')
    await expect(page.getByTestId('legality-banner')).toHaveAttribute('data-legal', 'true')
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '40')
    await expect(page.getByTestId('counter-extra')).toHaveAttribute('data-count', '2')

    // ricerca in italiano e in inglese → stessa carta
    await search(page).fill('fioritura di cenere')
    await expect(page.getByTestId('search-result')).toHaveCount(1)
    await search(page).fill('ash blossom')
    await expect(page.getByTestId('search-result')).toHaveCount(1)

    // un tocco: +1 Main
    const ash = addBtn(page, 'Fioritura di Cenere')
    await ash.click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '41')
    await expect(page.getByTestId('in-deck')).toHaveText('1 nel mazzo')
    // doppio tocco (dopo la finestra del tocco singolo): +1 nel Side al posto del Main
    await page.waitForTimeout(400)
    await addBtn(page.getByTestId('search-result'), 'Fioritura').dblclick()
    await expect(page.getByTestId('counter-side')).toHaveAttribute('data-count', '1')
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '41')
    await expect(page.getByTestId('announce')).toContainText('Side')

    // annulla (un solo passo per il gesto doppio) e ripeti
    await page.getByTestId('deck-title').click()
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('counter-side')).toHaveAttribute('data-count', '0')
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '41')
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('counter-side')).toHaveAttribute('data-count', '1')
    await page.getByTestId('undo').click()
    await page.getByTestId('undo').click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '40')
    await expect(page.getByTestId('undo')).toBeDisabled()

    // Pentola dell'Avidità è Proibita in TCG 2026.10: banner + carta evidenziata
    await search(page).fill('pentola dell')
    await addBtn(page, "Pentola dell'Avidità").click()
    const banner = page.getByTestId('legality-banner')
    await expect(banner).toHaveAttribute('data-legal', 'false')
    await expect(banner).toContainText("Pentola dell'Avidità è Proibita")
    await expect(page.getByTestId('issue-pill').filter({ hasText: 'Proibita' })).toBeVisible()
    await expect(page.getByTestId('deck-tile').and(page.locator('[data-issue=forbidden]'))).toHaveCount(1)

    // cambio banlist → aggiornamento immediato (Genesys non la vieta)
    await page.getByLabel('Banlist').first().selectOption('GENESYS|147.89')
    await expect(banner).toHaveAttribute('data-legal', 'true')
    await expect(page.getByTestId('issue-pill')).toHaveCount(0)
    await page.getByLabel('Banlist').first().selectOption('OCG|2026.10')
    await expect(banner).toHaveAttribute('data-legal', 'false')

    // Limitata: 2 copie di Raigeki con la banlist TCG
    await page.getByLabel('Banlist').first().selectOption('TCG|2026.10')
    await search(page).fill('raigeki')
    const raigeki = addBtn(page, 'Raigeki')
    await raigeki.click()
    await expect(page.getByTestId('ban-status')).toHaveText('Limitata')
    await page.waitForTimeout(400) // fuori dalla finestra del doppio tocco
    await raigeki.click()
    await expect(banner).toContainText('Raigeki è Limitata: massimo 1 copia, ne hai 2')
    await expect(page.getByTestId('issue-pill').filter({ hasText: 'Limitata' })).toBeVisible()

    // salvataggio automatico: ricarica e ritrova le modifiche
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
    await page.reload()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '43') // 40 + Pentola + 2 Raigeki
    expect(errors).toEqual([])
  })

  test('vista elenco con stepper, statistiche, menu carta (sposta, rimuovi)', async ({ page }) => {
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    await page.getByTestId('view-list').click()
    await expect(page.getByTestId('list-main')).toBeVisible()
    const row = page.getByTestId('deck-row').first()
    const name = await row.getByRole('button').first().getAttribute('aria-label')
    expect(name).toBeTruthy()
    await row.getByRole('button', { name: /^Aggiungi una copia di/ }).click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '41')
    await row.getByRole('button', { name: /^Togli una copia di/ }).click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '40')
    await row.getByRole('button').first().click()
    await page.getByRole('menuitem', { name: 'Sposta nel Side' }).click()
    await expect(page.getByTestId('counter-side')).toHaveAttribute('data-count', '1')
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '39')
    await expect(page.getByTestId('deck-stats')).toBeVisible()
    await expect(page.getByTestId('deck-stats')).toContainText('Mostro')
    await expect(page.getByTestId('deck-stats')).toContainText('Link')
  })

  test('limiti: Extra oltre 15 e carta Extra nel Main segnalate', async ({ page }) => {
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    await search(page).fill('talker')
    const add = addBtn(page, 'Accesscode Talker')
    for (let i = 0; i < 3; i++) {
      await add.click()
      await page.waitForTimeout(350)
    }
    await expect(page.getByTestId('legality-banner')).toContainText('massimo 3 copie')
    await expect(page.getByTestId('counter-extra')).toHaveAttribute('data-count', '5')
  })

  test('esporta: testo, ydke e .ydk con copia a un tocco e download', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    await page.getByTestId('open-export').click()
    const dlg = page.getByTestId('export-dialog')
    await dlg.getByTestId('copy-text').click()
    const text = await page.evaluate(() => navigator.clipboard.readText())
    expect(text).toContain('Main Deck (40)')
    expect(text).toContain('Accesscode Talker')
    await dlg.getByTestId('copy-ydke').click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^ydke:\/\//)
    const [download] = await Promise.all([page.waitForEvent('download'), dlg.getByTestId('download-ydk').click()])
    expect(download.suggestedFilename()).toBe('versione-torneo.ydk')
  })

  test('import nel mazzo sostituisce la lista ed è annullabile', async ({ page }) => {
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    const ydk = serializeYdk({ main: fillerIds(45, 10), extra: [ID.utopia], side: [ID.ash] })
    await page.getByTestId('open-import').click()
    await page.getByTestId('import-input').fill(ydk)
    await page.getByTestId('import-run').click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '45')
    await expect(page.getByTestId('counter-side')).toHaveAttribute('data-count', '1')
    await page.getByRole('button', { name: 'Annulla', exact: true }).first().click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '40')
  })

  test('lista virtualizzata oltre 200 elementi', async ({ page }) => {
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    const ids = Array.from({ length: 300 }, (_, i) => 1000001 + i)
    await page.getByTestId('open-import').click()
    await page.getByTestId('import-input').fill(serializeYdk({ main: ids, extra: [], side: [] }))
    await page.getByTestId('import-run').click()
    await page.getByTestId('view-list').click()
    const list = page.getByTestId('list-main')
    await expect(list.locator('[data-virtual="true"]')).toHaveCount(1)
    expect(await list.getByTestId('deck-row').count()).toBeLessThan(60)
  })
})

test.describe('editor (telefono: tab + bottom sheet)', () => {
  test('tab Main/Extra/Side, bottom sheet di ricerca, aggiunta e nessuno scroll orizzontale', async ({ page }) => {
    await prepare(page, 'light', 'it')
    await page.setViewportSize({ width: 375, height: 800 })
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}`)
    await expect(page.getByTestId('deck-editor')).toHaveAttribute('data-wide', 'false')
    await expect(page.getByTestId('tab-main')).toContainText('40')
    await page.getByTestId('tab-extra').click()
    await expect(page.getByTestId('counter-extra')).toHaveAttribute('data-count', '2')
    await page.getByTestId('open-search').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('searchbox', { name: 'Cerca carte' }).fill('nibiru')
    await addBtn(sheet, 'Nibiru').click()
    await expect(sheet).toContainText('Main 41/60')
    await sheet.getByRole('button', { name: 'Chiudi' }).click()
    await page.getByTestId('tab-main').click()
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', '41')
    await page.getByTestId('tab-stats').click()
    await expect(page.getByTestId('deck-stats')).toBeVisible()
    await expectNoHorizontalScroll(page)
    expect(await smallTargets(page)).toEqual([])
  })

  test('scheletro durante il caricamento dei dati carte', async ({ page }) => {
    await prepare(page, 'dark', 'it')
    await page.setViewportSize({ width: 375, height: 800 })
    const s = await seed(page)
    await page.goto(`/mazzi/${s.variantId}?mockdelay=1200`)
    await expect(page.getByTestId('editor-skeleton')).toBeVisible()
    await expect(page.getByTestId('deck-title')).toBeVisible({ timeout: 5000 })
  })
})

/* ------------------------------------------------------------------ */
/* Import da un unico riquadro                                         */
/* ------------------------------------------------------------------ */
test.describe('import (pagina Mazzi)', () => {
  test.beforeEach(async ({ page }) => {
    await prepare(page, 'dark', 'it')
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  const finish = async (page: Page, expectMain: number) => {
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByRole('heading', { name: 'Nuova variante' })).toBeVisible()
    await dlg.getByRole('button', { name: 'Crea variante' }).click()
    await expect(page).toHaveURL(/\/mazzi\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('counter-main')).toHaveAttribute('data-count', String(expectMain))
  }

  test('incolla (riconoscimento automatico) di ydke://', async ({ page }) => {
    await seed(page)
    await page.goto('/mazzi')
    const ydke = serializeYdke({ main: fillerIds(41), extra: [ID.apollousa], side: [] })
    await page.getByTestId('import-input').evaluate((el, text) => {
      const dt = new DataTransfer()
      dt.setData('text', text)
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, ydke)
    await finish(page, 41)
  })

  test('testo italiano con righe ambigue, refusi e righe non trovate', async ({ page }) => {
    await seed(page)
    await page.goto('/mazzi')
    const txt = ['Main Deck', "3 Fioritura di Cenere & Gioiosa Primavera", '2 Spirito Specchio', "1 Pentola dell'Avidita", '1 Carta Che Non Esiste Mai Qwerty', 'Extra Deck', '1 Accesscode Talker'].join('\n')
    await page.getByTestId('import-input').fill(txt)
    await page.getByTestId('import-run').click()
    const review = page.getByTestId('review-dialog')
    await expect(review).toBeVisible()
    await expect(review.getByTestId('ambiguous-line')).toHaveCount(1)
    await expect(review.getByTestId('unmatched-lines')).toContainText('Carta Che Non Esiste Mai Qwerty')
    await review.getByTestId('ambiguous-line').getByRole('radio').first().check()
    await page.getByRole('button', { name: /Importa 7 carte/ }).click()
    await finish(page, 6) // 3 Ash + 2 Specchio + 1 Pentola (Extra: 1)
  })

  test('testo inglese, file .ydk dal selettore e JSON dell\'app', async ({ page }) => {
    await seed(page)
    await page.goto('/mazzi')
    await page.getByTestId('import-input').fill('Main Deck\n3 Ash Blossom & Joyous Spring\n1 Raigeki\nExtra Deck\n1 Number 39: Utopia')
    await page.getByTestId('import-run').click()
    await finish(page, 4)

    await page.goto('/mazzi')
    await page.getByTestId('import-file').setInputFiles({ name: 'Mio Mazzo.ydk', mimeType: 'text/plain', buffer: Buffer.from(serializeYdk({ main: fillerIds(40, 3), extra: [], side: [ID.maxxC] })) })
    const dlg = page.getByRole('dialog')
    await expect(dlg.getByLabel('Nome in italiano')).toHaveValue('Mio Mazzo')
    await finish(page, 40)

    await page.goto('/mazzi')
    await page.getByTestId('import-input').fill(serializeDeckJson({ main: fillerIds(42), extra: [], side: [] }))
    await page.getByTestId('import-run').click()
    await finish(page, 42)
  })

  test('trascina un file .ydk sul riquadro', async ({ page }) => {
    await seed(page)
    await page.goto('/mazzi')
    const ydk = serializeYdk({ main: fillerIds(44), extra: [], side: [] })
    await page.getByTestId('import-box').evaluate((el, text) => {
      const dt = new DataTransfer()
      dt.items.add(new File([text], 'trascinato.ydk', { type: 'text/plain' }))
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
    }, ydk)
    await finish(page, 44)
  })

  test('errori chiari: contenuto non riconosciuto e ydke corrotto', async ({ page }) => {
    await page.goto('/mazzi')
    await page.getByTestId('import-input').fill('lorem ipsum dolor sit amet')
    await page.getByTestId('import-run').click()
    await expect(page.getByTestId('import-error')).toContainText('Non ho riconosciuto nessuna carta')
    await page.getByTestId('import-input').fill('ydke://@@@!!!')
    await page.getByTestId('import-run').click()
    await expect(page.getByTestId('import-error')).toContainText('non è valido')
  })

  test('condivisione dal sistema: /mazzi?share=1 legge la cache del service worker', async ({ page }) => {
    await seed(page)
    await page.evaluate(async (ydk) => {
      const cache = await caches.open('combolab-share')
      await cache.put('/__share/meta', new Response(JSON.stringify({ title: '', text: '', url: '', files: ['condiviso.ydk'], at: Date.now() })))
      await cache.put('/__share/file/0', new Response(ydk))
    }, serializeYdk({ main: fillerIds(40, 5), extra: [], side: [] }))
    await page.goto('/mazzi?share=1')
    await expect(page.getByRole('dialog').getByLabel('Nome in italiano')).toHaveValue('condiviso')
    await expect(page).toHaveURL(/\/mazzi$/)
    expect(await page.evaluate(async () => (await caches.keys()).includes('combolab-share'))).toBe(false)
    await finish(page, 40)
  })
})

/* ------------------------------------------------------------------ */
/* Avviso nuova banlist                                                */
/* ------------------------------------------------------------------ */
test('nuova banlist: riepilogo delle varianti rese illegali, link, passaggio e chiusura', async ({ page }) => {
  await prepare(page, 'dark', 'it')
  await page.setViewportSize({ width: 1280, height: 900 })
  const s = await seed(page)
  await page.goto('/mazzi')
  const notice = page.getByTestId('banlist-notices')
  await expect(notice).toContainText('Banlist TCG 2026.10: 1 variante diventa illegale')
  await expect(notice).toContainText('Chiamato dalla Tomba è Limitata')
  await expect(notice.getByRole('link', { name: /Vecchia banlist/ })).toHaveAttribute('href', `/mazzi/${s.oldVariantId}`)
  // la variante legale con la 2026.10 non compare
  await expect(notice).not.toContainText('Versione torneo')
  await notice.getByRole('button', { name: 'Nascondi' }).click()
  await expect(notice).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('banlist-notices')).toHaveCount(0)

  // passaggio alla nuova banlist dall'editor: la variante risulta illegale
  await page.evaluate(() => localStorage.removeItem('combolab.banlistNotice.dismissed'))
  await page.reload()
  await page.getByTestId('banlist-notices').getByRole('button', { name: 'Passa alla TCG 2026.10' }).click()
  await expect(page.getByTestId('banlist-notices')).toHaveCount(0)
  await expect(page.getByTestId('variant-card').filter({ hasText: 'Vecchia banlist' }).getByTestId('variant-illegal')).toBeVisible()
})

/* ------------------------------------------------------------------ */
/* Qualità: larghezze, target, schermate                               */
/* ------------------------------------------------------------------ */
const WIDTHS = [360, 375, 768, 1024, 1440, 2560]
test('nessuno scroll orizzontale da 360 a 2560 px su tutte le schermate', async ({ page }) => {
  test.setTimeout(120_000)
  await prepare(page, 'dark', 'it')
  const s = await seed(page)
  const routes = ['/archetipi', `/archetipi/${s.archetypeId}`, '/mazzi', `/mazzi/${s.variantId}`]
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 })
    for (const r of routes) {
      await page.goto(r)
      await page.locator('h1').first().waitFor()
      await page.waitForTimeout(150)
      await expectNoHorizontalScroll(page)
    }
  }
})

test('target ≥ 44 px su telefono in archetipi, mazzi e dialog', async ({ page }) => {
  await prepare(page, 'dark', 'it')
  await page.setViewportSize({ width: 375, height: 800 })
  const s = await seed(page)
  for (const r of ['/archetipi', `/archetipi/${s.archetypeId}`, '/mazzi']) {
    await page.goto(r)
    await page.locator('h1').first().waitFor()
    await page.waitForTimeout(150)
    expect(await smallTargets(page), r).toEqual([])
  }
  await page.goto(`/archetipi/${s.archetypeId}`)
  await page.getByTestId('new-variant').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(500) // fine animazione di apertura (scala 0.98 → misure sfalsate)
  expect(await smallTargets(page), 'dialog variante').toEqual([])
})

const SHOT_WIDTHS = [375, 1440]
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
for (const width of SHOT_WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`schermate ${width} ${theme} ${lang}`, async ({ page }) => {
        test.setTimeout(90_000)
        const errors = collectErrors(page)
        await prepare(page, theme, lang)
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
        const s = await seed(page)
        test.info().annotations.push({ type: 'width', description: String(width) })
        const shot = async (name: string) => {
          await page.waitForTimeout(250)
          await expectNoHorizontalScroll(page)
          await page.screenshot({ path: `${SHOTS}/${name}-${width}-${theme}-${lang}.png`, fullPage: true })
        }
        await page.goto('/archetipi')
        await expect(page.getByTestId('archetype-card')).toHaveCount(2)
        await shot('archetipi')

        await page.goto(`/archetipi/${s.archetypeId}`)
        await expect(page.getByTestId('variant-card')).toHaveCount(2)
        await shot('archetipo')

        await page.goto('/mazzi')
        await expect(page.getByTestId('banlist-notices')).toBeVisible()
        await shot('mazzi')

        await page.goto(`/mazzi/${s.oldVariantId}`)
        await expect(page.getByTestId('legality-banner')).toBeVisible()
        // Pentola (Proibita) + 2 Raigeki (Limitata) per avere carte evidenziate
        if (width >= 1024) {
          await search(page).fill('pot of')
          await addBtn(page, '(Pot of Greed|Pentola dell)').first().click()
        }
        await page.getByLabel(/Banlist/).first().selectOption('TCG|2026.10')
        await expect(page.getByTestId('legality-banner')).toHaveAttribute('data-legal', 'false')
        await shot('editor')

        await page.getByTestId('view-list').click()
        await shot('editor-lista')

        await page.getByTestId('open-export').click()
        await expect(page.getByTestId('export-dialog')).toBeVisible()
        await shot('esporta')
        expect(errors, 'errori in console').toEqual([])
      })
    }
  }
}
