import { test } from '@playwright/test'
import { openCombo, seedCombo } from './helpers/combo'
import { C } from './helpers/combo'
test('dbg', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const own = Array.from({ length: 5 }, (_, i) => ({ uid: `u${10 + i}`, place: { loc: 'banished', seq: i } }))
  const cards: Record<string, number> = {}
  own.forEach((o) => (cards[o.uid] = C.ash))
  await openCombo(page, await seedCombo(page, { cards, own }))
  const r = await page.evaluate(() => {
    const cell = document.querySelector('[data-zone="p:0:banished"]')!
    const g = (e: Element | null) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
    const card = cell.querySelector('[data-card]')!
    return { cell: g(cell), card: g(card), fit: g(card.firstElementChild), style: card.getAttribute('style'), cs: getComputedStyle(card).cssText.length, grid: getComputedStyle(cell).gridColumn }
  })
  console.log(JSON.stringify(r))
})
