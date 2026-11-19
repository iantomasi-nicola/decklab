import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { C, longDoc, openCombo, seedCombo, seedDoc, type SeedCombo } from './helpers/combo'

/** Schermate dell'editor combo (pannelli, finestre, lista) a 375/768/1024: niente overflow, bersagli touch >= 44 px. */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })

const SEED: SeedCombo = {
  cards: { u1: C.tengu, u2: C.rooklord, u3: C.spell, u8: C.ash, o1: C.ash },
  hand: ['u1', 'u2', 'u3'],
  own: [{ uid: 'u8', place: { loc: 'gy', seq: 0 } }],
  opp: [{ uid: 'o1', place: { loc: 'mzone', seq: 1, pos: 'FACEUP_ATK' } }],
  deck: { main: [C.tengu, C.rooklord, C.spell, C.ash, C.ash], extra: [C.xyz] },
}

/** Elementi interattivi fuori dal campo troppo piccoli per il tocco, o che escono dal viewport. */
async function audit(page: Page, label: string) {
  await page.waitForTimeout(400) // fine delle animazioni di apertura
  const r = await page.evaluate(() => {
    const vw = window.innerWidth
    const small: string[] = []
    const out: string[] = []
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=menuitem]'
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest('[data-field]') || el.closest('[data-pop-menu]') && false) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.display === 'none') continue
      const b = el.getBoundingClientRect()
      if (b.width <= 1 || b.height <= 1) continue // sr-only
      if (el.getAttribute('role') === 'switch' || el.closest('[data-radix-toast-viewport]')) continue
      if (b.right > vw + 1 || b.left < -1) out.push(`${el.tagName}.${(el.getAttribute('aria-label') ?? el.textContent ?? '').slice(0, 24)} [${Math.round(b.left)}..${Math.round(b.right)}]`)
      if ((b.height < 43.5 || b.width < 43.5) && !(el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox')) {
        // i testi lunghi in una riga larga sono bersagli ampi: serve l'altezza; le icone devono essere quadrate >= 44
        if (b.height < 43.5) small.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`)
      }
    }
    return { small, out, sw: document.documentElement.scrollWidth - vw }
  })
  expect(r.sw, `${label}: scroll orizzontale`).toBeLessThanOrEqual(0)
  expect(r.out, `${label}: elementi fuori dal viewport`).toEqual([])
  expect(r.small, `${label}: bersagli touch < 44 px`).toEqual([])
}

for (const [w, h] of [[375, 812], [768, 1024], [1024, 768]] as const) {
  test.describe(`editor ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: w < 1024 })

    test('pannelli: passi, configurazione, pile, dettagli', async ({ page }) => {
      await openCombo(page, await seedCombo(page, SEED), 'it')
      await page.evaluate(() => localStorage.setItem('combolab.field.pilesPanel', '1'))
      await page.reload()
      await page.waitForSelector('[data-field]')
      if ((await page.locator('[data-panel]').count()) === 0) await page.getByTestId('panel-toggle').click()
      for (const [name, re] of [['steps', /Passi/], ['setup', /Configurazione/], ['piles', /Pile/], ['info', /Dettagli/]] as const) {
        await page.getByRole('tab', { name: re }).click()
        await page.waitForTimeout(200)
        await audit(page, `${w} pannello ${name}`)
        await page.screenshot({ path: `${OUT}/combo-resp-${w}-${name}.png` })
      }
    })

    test('finestre: LP, aggiungi carta, sposta in…, menu azioni', async ({ page }) => {
      await openCombo(page, await seedCombo(page, SEED), 'it')
      await page.locator('[data-lp="0"]').click()
      await audit(page, `${w} LP`)
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-lp.png` })
      await page.keyboard.press('Escape')
      await page.getByTestId('add-menu').click()
      await page.getByRole('menuitem', { name: /Aggiungi carta o token/ }).click()
      await audit(page, `${w} aggiungi`)
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-add.png` })
      await page.keyboard.press('Escape')
      await page.locator('[data-card="u1"]').focus()
      await page.keyboard.press('Enter')
      await audit(page, `${w} sposta in`)
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-moveto.png` })
      await page.keyboard.press('Escape')
      await page.locator('[data-card="u8"]').click({ button: 'right' })
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-menu.png` })
    })

    test('lista combo e nuova combo', async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('combolab.lang', 'it'))
      await seedCombo(page, SEED)
      await seedDoc(page, longDoc(60))
      await page.goto('/combo')
      await page.getByTestId('new-combo').waitFor()
      await audit(page, `${w} lista`)
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-list.png` })
      await page.getByTestId('new-combo').click()
      await audit(page, `${w} nuova`)
      await page.screenshot({ path: `${OUT}/combo-resp-${w}-new.png` })
    })
  })
}
