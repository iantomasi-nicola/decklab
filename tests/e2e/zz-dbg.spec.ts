import { test } from '@playwright/test'
import { C, openCombo, seedCombo } from './helpers/combo'
test('dbg', async ({ page }) => {
  page.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)))
  page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 500)))
  const id = await seedCombo(page, { cards: { u1: C.tengu }, hand: ['u1'] })
  await page.addInitScript(() => localStorage.setItem('combolab.lang', 'en'))
  await page.goto(`/combo/${id}`)
  await page.waitForTimeout(2000)
  console.log(await page.locator('main').innerText())
})
