import { expect, test, type Page } from '@playwright/test'
import { ID } from '../mocks/cardsData'
import { prepare } from './decks.helpers'
import { seedSide } from './side.helpers'

const tile = (page: Page, kind: 'out' | 'in', id: number) => page.locator(`[data-testid="tile-${kind}"][data-card-id="${id}"]`)

async function openNewPlan(page: Page, name: string) {
  await page.getByTestId('side-new').first().click()
  await page.getByRole('dialog').getByLabel(/Nome del matchup|Matchup name/).fill(name)
  await page.getByTestId('side-create').click()
  await expect(page.getByTestId('plan-editor')).toBeVisible()
  await expect(page.getByTestId('plan-name')).toHaveValue(name)
}

for (const vp of [{ w: 375, h: 812 }, { w: 1440, h: 900 }]) {
  test.describe(`flusso ${vp.w}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h })
      await prepare(page, 'dark', 'it')
      await seedSide(page)
      await page.goto('/side')
      await expect(page.getByTestId('plan-item')).toHaveCount(2)
    })

    test('crea, tocca, modifica e conserva dopo il ricaricamento', async ({ page }) => {
      await openNewPlan(page, 'Mirror')
      const tabIn = page.getByRole('radio', { name: /^IN/ })
      const narrow = await tabIn.isVisible()
      // OUT: due tocchi sul Drago (×3 nel Main), poi un "−"
      const be = tile(page, 'out', ID.blueEyes)
      await be.locator('button').first().click()
      await be.locator('button').first().click()
      await expect(be).toHaveAttribute('data-selected', '2')
      await be.getByTestId('tile-out-minus').click()
      await expect(be).toHaveAttribute('data-selected', '1')
      await expect(page.getByTestId('balance-text')).toContainText('Manca 1 IN')
      if (narrow) await tabIn.click()
      await tile(page, 'in', ID.imperm).locator('button').first().click()
      await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'true')
      await expect(page.getByTestId('balance-text')).toContainText('I conti tornano')
      // una carta non disponibile non può superare le copie: Maxx "C" ha 1 sola copia
      if (narrow) await page.getByRole('radio', { name: /^Mazzo/ }).click()
      await expect(page.locator('[data-testid="preview-tile"][data-in="1"]')).toHaveCount(1)
      await page.waitForTimeout(700)
      await page.reload()
      await expect(page.getByTestId('plan-item').filter({ hasText: 'Mirror' })).toHaveCount(1)
      await page.getByTestId('plan-item').filter({ hasText: 'Mirror' }).click()
      await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'true')
    })

    test('suggerimenti dai ruoli, annulla, duplica per l\'altro turno, elimina e ripristina', async ({ page }) => {
      await openNewPlan(page, 'Mirror')
      await page.getByTestId('side-suggest').click()
      await expect(page.getByTestId('balance-bar')).toHaveAttribute('data-ok', 'true')
      await expect(page.getByTestId('balance-out')).toHaveText('3')
      await expect(page.getByTestId('balance-in')).toHaveText('3')
      await expect(page.getByText(/Suggerimenti applicati: 3 OUT e 3 IN/)).toBeVisible()
      // annulla dal toast
      await page.getByRole('button', { name: 'Annulla' }).first().click()
      await expect(page.getByTestId('balance-out')).toHaveText('0')
      await page.getByTestId('side-suggest').click()
      await expect(page.getByTestId('balance-out')).toHaveText('3')

      await page.getByTestId('plan-menu').click()
      await page.getByRole('menuitem', { name: 'Duplica per il Secondo' }).click()
      await expect(page.getByText('Matchup duplicato')).toBeVisible()
      await expect(page.getByTestId('balance-out')).toHaveText('3')
      await page.getByTestId('plan-menu').click()
      await page.getByRole('menuitem', { name: 'Elimina matchup' }).click()
      await expect(page.getByText(/eliminato/)).toBeVisible()
      await page.getByRole('button', { name: 'Annulla' }).last().click()
      await expect(page.getByTestId('plan-editor')).toBeVisible()
    })

    test('esporta PNG nelle due orientazioni', async ({ page }) => {
      await page.getByTestId('plan-item').filter({ hasText: 'Snake-Eye' }).click()
      await page.getByTestId('side-export').click()
      const img = page.getByTestId('export-preview')
      await expect(img).toBeVisible()
      const dims = () => img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight])
      await expect.poll(dims).toEqual([1080, 1920])
      await page.screenshot({ path: `test-results/side/flow-${vp.w}-export-portrait.png` })
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()])
      expect(dl.suggestedFilename()).toMatch(/^side-plan-snake-eye-portrait\.png$/)
      await dl.saveAs(`test-results/side/export-${vp.w}-portrait.png`)
      await page.getByRole('radio', { name: 'Orizzontale' }).click()
      await expect.poll(dims).toEqual([1920, 1080])
      await page.screenshot({ path: `test-results/side/flow-${vp.w}-export-landscape.png` })
      const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()])
      await dl2.saveAs(`test-results/side/export-${vp.w}-landscape.png`)
      // il PNG è davvero un'immagine non vuota
      const png = await img.evaluate(async (el: HTMLImageElement) => {
        const c = document.createElement('canvas')
        c.width = el.naturalWidth
        c.height = el.naturalHeight
        c.getContext('2d')!.drawImage(el, 0, 0)
        return c.toDataURL('image/png')
      })
      expect(png.length).toBeGreaterThan(10_000)
      await page.getByRole('button', { name: 'Chiudi' }).click()
    })

    test('Side vuoto: la corsia IN spiega cosa fare', async ({ page }) => {
      await page.getByTestId('side-variant').selectOption({ label: 'Drago Bianco · Senza side' })
      await expect(page.getByTestId('side-new').first()).toBeVisible()
      await openNewPlan(page, 'Vuoto')
      const tabIn = page.getByRole('radio', { name: /^IN/ })
      if (await tabIn.isVisible()) await tabIn.click()
      await expect(page.getByText('Il Side è vuoto')).toBeVisible()
      await page.screenshot({ path: `test-results/side/flow-${vp.w}-empty-side.png`, fullPage: true })
    })
  })
}
