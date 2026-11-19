import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { C, openCombo, openPanel, seedCombo, type SeedCombo } from './helpers/combo'

/** Editor combo: screenshot 375/768/1024/1440 × scuro/chiaro × IT/EN + controlli geometrici del campo. */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })

const RATIO = 100 / 103.07
const RICH: SeedCombo = {
  cards: { u1: C.tengu, u2: C.rooklord, u3: C.spell, u4: C.trap, u5: C.field, u6: C.equip, u7: C.pendulum, u8: C.ash, u9: C.xyz, u10: C.tengu, u11: C.link, u12: C.trap, u13: C.ash, u14: C.spell, u15: C.trap, u16: C.rooklord, o1: C.ash, o2: C.rooklord, o3: C.trap, o4: C.spell, o5: C.equip, o6: C.ash, o7: C.tengu },
  hand: ['u1', 'u2', 'u3', 'u4', 'u7', 'u6', 'u13'],
  own: [
    { uid: 'u8', place: { loc: 'gy' } },
    { uid: 'u9', place: { loc: 'mzone', seq: 4, pos: 'FACEUP_ATK' } },
    { uid: 'u10', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_DEF' } },
    { uid: 'u11', place: { loc: 'emz', seq: 0, pos: 'FACEUP_ATK' } },
    { uid: 'u12', place: { loc: 'szone', seq: 2, pos: 'FACEDOWN' } },
    { uid: 'u5', place: { loc: 'fzone', pos: 'FACEUP' } },
    { uid: 'u13', place: { loc: 'overlay', seq: 0, host: 'u9' } },
    { uid: 'u14', place: { loc: 'banished' } },
    { uid: 'u15', place: { loc: 'banished' } },
    { uid: 'u16', place: { loc: 'mzone', seq: 2, pos: 'FACEUP_DEF' } },
  ],
  opp: [
    { uid: 'o1', place: { loc: 'mzone', seq: 1, pos: 'FACEDOWN_DEF' } },
    { uid: 'o2', place: { loc: 'mzone', seq: 3, pos: 'FACEUP_ATK' } },
    { uid: 'o3', place: { loc: 'szone', seq: 1, pos: 'FACEDOWN' } },
    { uid: 'o4', place: { loc: 'hand', seq: 0 } },
    { uid: 'o5', place: { loc: 'banished' } },
    { uid: 'o6', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_DEF' } },
    { uid: 'o7', place: { loc: 'mzone', seq: 4, pos: 'FACEUP_DEF' } },
  ],
  counters: { u9: { spell: 2 } },
  deck: { main: [C.tengu, C.rooklord, C.spell, C.trap, C.field, C.equip, C.pendulum, C.ash, C.tengu, C.ash], extra: [C.xyz, C.link] },
}
// la mano propria non include u13 (è materiale): la tolgo dalla mano
RICH.hand = ['u1', 'u2', 'u3', 'u4', 'u7', 'u6']

/** Controlli geometrici: il campo sta nel viewport, riempie lo spazio, nessuna carta/zona esce dal campo, mano sotto il campo. */
async function checkField(page: Page, label: string) {
  const g = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect()
    const field = document.querySelector('[data-field]')!
    const stage = field.parentElement!
    const f = r(field)
    const s = r(stage)
    const cells = [...field.querySelectorAll('.cl-cell')].map((c) => r(c))
    const cards = [...field.querySelectorAll('[data-card]')].map((c) => r(c.firstElementChild ?? c))
    const hand = r(field.querySelector('[data-zone="p:0:hand"]')!)
    const own = r(field.querySelector('[data-zone="z:0:szone:2"]')!)
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      f: { l: f.left, t: f.top, r: f.right, b: f.bottom, w: f.width, h: f.height },
      s: { w: s.width, h: s.height },
      cellsOut: cells.filter((c) => c.left < f.left - 1 || c.right > f.right + 1 || c.top < f.top - 1 || c.bottom > f.bottom + 1).length,
      cardsOut: cards.filter((c) => c.left < f.left - 1 || c.right > f.right + 1 || c.top < f.top - 1 || c.bottom > f.bottom + 1).length,
      handBelow: hand.top >= own.bottom - 1,
    }
  })
  expect(g.sw, `${label}: scroll orizzontale`).toBeLessThanOrEqual(g.vw)
  expect(g.f.l, `${label}: campo a sinistra`).toBeGreaterThanOrEqual(-1)
  expect(g.f.r, `${label}: campo a destra`).toBeLessThanOrEqual(g.vw + 1)
  expect(g.f.b, `${label}: campo in basso`).toBeLessThanOrEqual(g.vh + 1)
  const fit = Math.min(g.s.w, g.s.h * RATIO)
  expect(g.f.w / fit, `${label}: il campo riempie min(larghezza, altezza)`).toBeGreaterThan(0.97)
  expect(Math.abs(g.f.w / g.f.h - RATIO), `${label}: proporzioni del playmat`).toBeLessThan(0.01)
  expect(g.cellsOut, `${label}: zone fuori dal campo`).toBe(0)
  expect(g.cardsOut, `${label}: carte tagliate`).toBe(0)
  expect(g.handBelow, `${label}: la mano è sotto il campo`).toBe(true)
  return g
}

const SHOTS = [
  [375, 812],
  [768, 1024],
  [1024, 768],
  [1440, 900],
] as const

for (const [w, h] of SHOTS) {
  for (const theme of ['dark', 'light'] as const) {
    for (const lang of ['it', 'en'] as const) {
      test(`editor ${w}x${h} ${theme} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h })
        await openCombo(page, await seedCombo(page, RICH), lang, theme)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(400)
        const g = await checkField(page, `${w}x${h}`)
        if (w >= 1024) expect(await page.locator('[data-panel]').count(), 'pannello aperto di default su schermi larghi').toBe(1)
        else expect(await page.locator('[data-panel]').count(), 'pannello chiuso di default').toBe(0)
        expect(g.sw).toBeLessThanOrEqual(w)
        await page.screenshot({ path: `${OUT}/combo-editor-${w}-${theme}-${lang}.png` })
      })
    }
  }
}

test.describe('geometria su molte dimensioni', () => {
  for (const [w, h] of [[360, 640], [412, 915], [800, 375], [844, 390], [1280, 720], [1920, 1080], [2560, 1440], [1080, 1920], [3440, 1440]] as const) {
    test(`campo ${w}x${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await openCombo(page, await seedCombo(page, RICH))
      await page.waitForTimeout(300)
      await checkField(page, `${w}x${h}`)
    })
  }
})

test('pannello aperto: telefono = bottom sheet, tablet = cassetto, PC = colonna che riceve lo spazio avanzato', async ({ page }) => {
  for (const [w, h, kind] of [[375, 812, 'sheet'], [768, 1024, 'drawer'], [1440, 900, 'inline']] as const) {
    await page.setViewportSize({ width: w, height: h })
    await openCombo(page, await seedCombo(page, RICH))
    if (kind !== 'inline') await openPanel(page)
    else await page.waitForSelector('[data-panel]')
    await page.waitForTimeout(400)
    if (kind === 'sheet') await expect(page.getByRole('dialog')).toBeVisible()
    else await expect(page.locator('aside[data-panel]')).toBeVisible()
    await page.screenshot({ path: `${OUT}/combo-editor-panel-${w}.png` })
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.removeItem('combolab.combo.panel'))
  }
})
