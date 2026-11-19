import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { C, openCombo, seedCombo, type SeedCombo } from './helpers/combo'

/** Telefono: verticale (5 colonne, pile in fasce, "Il mio campo") e orizzontale (una riga). */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })

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


async function geometry(page: Page, label: string, opts: { minZone?: number; minWidth?: number } = {}) {
  const g = await page.evaluate(() => {
    const r = (el: Element) => el.getBoundingClientRect()
    const field = document.querySelector('[data-field]')!
    const stage = field.parentElement!
    const f = r(field)
    const s = r(stage)
    const cells = [...field.querySelectorAll('.cl-cell')].filter((c) => getComputedStyle(c).display !== 'none')
    const inside = (b: DOMRect) => b.left >= f.left - 1 && b.right <= f.right + 1 && b.top >= f.top - 1 && b.bottom <= f.bottom + 1
    const hand = r(field.querySelector('[data-zone="p:0:hand"]')!)
    const own = r(field.querySelector('[data-zone="z:0:szone:2"]')!)
    const zones = cells.filter((c) => c.hasAttribute('data-zone') && !(c.getAttribute('data-zone') ?? '').includes('hand')).map((c) => r(c))
    return {
      vw: window.innerWidth,
      sw: document.documentElement.scrollWidth,
      fill: [f.width / s.width, f.height / s.height],
      cellsOut: cells.filter((c) => !inside(r(c))).length,
      cardsOut: [...field.querySelectorAll('[data-card]')].filter((c) => c.getClientRects().length > 0 && !inside(r(c.firstElementChild ?? c))).length,
      handBelow: hand.top >= own.bottom - 1,
      minW: Math.min(...zones.map((z) => z.width)),
      narrow: cells.filter((c) => c.hasAttribute('data-zone') && c.getAttribute('data-zone') !== 'p:1:hand' && (r(c).width < 44 || r(c).height < 44)).map((c) => `${c.getAttribute('data-zone')}:${Math.round(r(c).width)}x${Math.round(r(c).height)}`),
      minH: Math.min(...zones.map((z) => z.height)),
      overlap: zones.filter((z, i) => zones.some((o, j) => j > i && z.left < o.right - 2 && z.right > o.left + 2 && z.top < o.bottom - 2 && z.bottom > o.top + 2)).length,
    }
  })
  expect(g.sw, `${label}: scroll orizzontale`).toBeLessThanOrEqual(g.vw)
  expect(g.cellsOut, `${label}: zone fuori dal campo`).toBe(0)
  expect(g.cardsOut, `${label}: carte tagliate`).toBe(0)
  expect(g.handBelow, `${label}: mano in basso`).toBe(true)
  expect(g.overlap, `${label}: zone sovrapposte`).toBe(0)
  if (opts.minWidth) expect(g.minW, `${label}: larghezza minima zona`).toBeGreaterThanOrEqual(opts.minWidth)
  if (opts.minZone) {
    expect(g.narrow, `${label}: zone strette`).toEqual([])
    expect(g.minW, `${label}: larghezza minima zona`).toBeGreaterThanOrEqual(opts.minZone)
    expect(g.minH, `${label}: altezza minima zona`).toBeGreaterThanOrEqual(opts.minZone)
  }
  return g
}

for (const [w, h] of [[375, 667], [390, 844], [430, 932]] as const) {
  for (const mine of [true, false]) {
    test(`telefono verticale ${w}x${h} ${mine ? 'Il mio campo' : 'entrambi'}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await page.addInitScript((m) => localStorage.setItem('combolab.field.mineOnly', m ? '1' : '0'), mine)
      await openCombo(page, await seedCombo(page, RICH), 'it', 'dark')
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/combo-phone-${w}x${h}-${mine ? 'mine' : 'both'}.png` })
      const g = await geometry(page, `${w}x${h} mine=${mine}`, { minZone: mine ? 44 : 0, minWidth: 44 })
      // il campo riempie l'area utile (larghezza intera)
      expect(g.fill[0]).toBeGreaterThan(0.99)
      expect(g.fill[1]).toBeGreaterThan(0.99)
      await page.screenshot({ path: `${OUT}/combo-phone-${w}x${h}-${mine ? 'mine' : 'both'}.png` })
    })
  }
}

for (const [w, h] of [[667, 375], [844, 390]] as const) {
  test(`telefono orizzontale ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await openCombo(page, await seedCombo(page, RICH), 'it', 'dark')
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/combo-phone-${w}x${h}.png` })
    await geometry(page, `${w}x${h}`)
  })
}
