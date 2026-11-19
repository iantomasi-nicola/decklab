import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { existsSync, readFileSync } from 'node:fs'
import { longDoc, openCombo, openPanel, seedDoc } from './helpers/combo'

/** Combo lunghe (60 passi): lista passi efficiente, ricerca/salto, blocchi comprimibili, scorrimento al passo corrente. */
const OUT = process.env.SHOT_DIR ?? 'test-results/visual'
mkdirSync(OUT, { recursive: true })
const FIXTURE = 'tests/fixtures/combo/long-60.json'
const doc = () => (existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : longDoc(60))

async function open(page: Page, w: number, h: number, lang: 'it' | 'en' = 'en', theme: 'dark' | 'light' = 'dark') {
  await page.setViewportSize({ width: w, height: h })
  await page.addInitScript(() => {
    ;(window as unknown as { __long: number[] }).__long = []
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (window as unknown as { __long: number[] }).__long.push(e.duration))).observe({ entryTypes: ['longtask'] })
    } catch {
      /* longtask non supportato */
    }
  })
  await openCombo(page, await seedDoc(page, doc()), lang, theme)
  await openPanel(page)
  await page.getByRole('tab', { name: /Steps|Passi/ }).click()
  await page.waitForSelector('[data-steps]')
}

const stepsCount = (page: Page) => page.locator('[data-steps] li[data-step-id]').count()

test.describe('combo da 60 passi (desktop)', () => {
  test('tutti i passi sono nella lista, senza scroll orizzontale né task lunghi', async ({ page }) => {
    await open(page, 1440, 900)
    expect(await stepsCount(page)).toBe(60)
    const panel = page.locator('aside[data-panel] > div').last()
    expect(await panel.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0)
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long)
    expect(Math.max(0, ...long), `task lunghi (ms): ${long.join(', ')}`).toBeLessThan(600)
  })

  test('salto a un passo e scorrimento automatico al passo corrente', async ({ page }) => {
    await open(page, 1440, 900)
    const search = page.getByTestId('step-search')
    await search.fill('47')
    await search.press('Enter')
    const row = page.locator('[data-step-index="46"]')
    await expect(row).toHaveAttribute('data-step-id', /.+/)
    await expect(row.locator('button[aria-current="step"]')).toBeVisible()
    const panel = page.locator('aside[data-panel] > div').last()
    const [r, p] = await Promise.all([row.boundingBox(), panel.boundingBox()])
    expect(r!.y).toBeGreaterThanOrEqual(p!.y - 1)
    expect(r!.y + r!.height).toBeLessThanOrEqual(p!.y + p!.height + 1)
    // il campo mostra lo stato dopo quel passo: la barra del passo non serve su PC, ma il cursore è lì
    await expect(page.getByTestId('save-state')).toBeVisible()
  })

  test('ricerca nei passi: conteggio e navigazione tra i risultati', async ({ page }) => {
    await open(page, 1440, 900)
    await page.getByTestId('step-search').fill('Note on step')
    await expect(page.getByTestId('step-matches')).toHaveText(/^1\/\d+$/)
    const total = Number((await page.getByTestId('step-matches').innerText()).split('/')[1])
    expect(total).toBeGreaterThanOrEqual(6)
    await page.getByRole('button', { name: /Next match|Risultato successivo/ }).click()
    await expect(page.getByTestId('step-matches')).toHaveText(`2/${total}`)
    await page.getByTestId('step-search').fill('zzzz-nessuno')
    await expect(page.getByTestId('step-matches')).toHaveText(/None|Nessuno/)
  })

  test('catena e ordine libero sono blocchi comprimibili', async ({ page }) => {
    await open(page, 1440, 900)
    const blocks = page.locator('[data-steps] li[data-block]')
    await expect(blocks).toHaveCount(2)
    await page.getByTestId('toggle-blocks').click()
    expect(await stepsCount(page)).toBe(60 - 3 - 3) // i passi dei due blocchi spariscono
    await expect(blocks.first().getByRole('button', { name: /Chain|Catena/ })).toHaveAttribute('aria-expanded', 'false')
    await blocks.first().getByRole('button', { name: /Chain|Catena/ }).click()
    expect(await stepsCount(page)).toBe(60 - 3)
    // saltando a un passo dentro il blocco compresso, il blocco si apre
    await page.getByTestId('toggle-blocks').click()
    await page.getByTestId('step-search').fill('22')
    await page.getByTestId('step-search').press('Enter')
    await expect(page.locator('[data-step-index="21"]')).toBeVisible()
  })

  test('azioni del passo allineate e mai sovrapposte al testo', async ({ page }) => {
    await open(page, 1440, 900)
    const bad = await page.evaluate(() => {
      const out: string[] = []
      for (const li of document.querySelectorAll('[data-steps] li[data-step-id]')) {
        const [main, menu] = li.querySelectorAll(':scope > div:first-child > *') as NodeListOf<HTMLElement>
        if (!main || !menu) continue
        const a = main.getBoundingClientRect()
        const b = menu.getBoundingClientRect()
        if (a.width && b.width && (a.right > b.left + 1 || b.right > li.getBoundingClientRect().right + 1)) out.push(li.getAttribute('data-step-id')!)
      }
      return out
    })
    expect(bad).toEqual([])
  })
})

test('telefono: barra del passo sotto il campo e lista nel foglio', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openCombo(page, await seedDoc(page, doc()), 'en')
  await expect(page.locator('[data-step-strip]')).toBeVisible()
  await expect(page.locator('[data-step-strip]')).toContainText('Step 60 of 60')
  await page.getByRole('button', { name: /Previous step/ }).click()
  await expect(page.locator('[data-step-strip]')).toContainText('Step 59 of 60')
  await page.locator('[data-step-strip] button').nth(1).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('[data-step-index="58"] button[aria-current="step"]')).toBeVisible()
})

for (const [w, h] of [[375, 812], [768, 1024], [1024, 768], [1440, 900]] as const) {
  for (const theme of ['dark', 'light'] as const) {
    for (const lang of ['it', 'en'] as const) {
      test(`lista 60 passi ${w}x${h} ${theme} ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h })
        await openCombo(page, await seedDoc(page, doc()), lang, theme)
        await openPanel(page).catch(async () => undefined)
        if ((await page.locator('[data-panel]').count()) === 0) await page.getByTestId('panel-toggle').click()
        await page.getByRole('tab', { name: /Steps|Passi/ }).click()
        await page.getByTestId('step-search').fill('30')
        await page.getByTestId('step-search').press('Enter')
        await page.waitForTimeout(300)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow).toBeLessThanOrEqual(0)
        await page.screenshot({ path: `${OUT}/combo-long-${w}-${theme}-${lang}.png` })
      })
    }
  }
}
