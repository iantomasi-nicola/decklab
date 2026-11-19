import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { encodeLink } from '../../src/domain/share/link'
import type { ComboDoc } from '../../src/domain/combo/types'

const doc = JSON.parse(readFileSync('tests/fixtures/combo/v1.json', 'utf8')) as ComboDoc
const link = encodeLink(doc)
const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
const OUT = 'test-results/visual-backup'
mkdirSync(OUT, { recursive: true })

async function prepare(page: Page, theme: string, lang: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Controlli minimi: niente scroll orizzontale, niente elemento fuori viewport, target >= 44px. */
async function checks(page: Page, scope = 'body') {
  const r = await page.evaluate((sel) => {
    const vw = window.innerWidth
    const bad: string[] = []
    const small: string[] = []
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    for (const el of document.querySelectorAll(`${sel} *`)) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width <= 1 || b.height <= 1) continue
      if ((b.right > vw + 1 || b.left < -1) && !clipped(el)) bad.push(`${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)}`)
      if (el.matches('button, a, input:not([type=file]):not([hidden]), select, textarea, [role=tab], [role=radio]') && !el.closest('.sr-only') && !el.classList.contains('sr-only')) {
        if (b.height < 43.5) small.push(`${el.tagName} ${(el.textContent ?? '').trim().slice(0, 20)} h=${Math.round(b.height)}`)
      }
    }
    return { bad, small, sw: document.documentElement.scrollWidth, w: vw }
  }, scope)
  expect(r.sw, 'scroll orizzontale').toBeLessThanOrEqual(r.w)
  expect(r.bad, 'fuori viewport').toEqual([])
  expect(r.small, 'target < 44px').toEqual([])
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      const tag = `${width}-${theme}-${lang}`
      test(`importa vuoto ${tag}`, async ({ page }) => {
        await prepare(page, theme, lang, width)
        await page.goto('/importa')
        await expect(page.locator('h1')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${OUT}/importa-vuoto-${tag}.png`, fullPage: true })
        await checks(page)
      })
      test(`importa anteprima ${tag}`, async ({ page }) => {
        await prepare(page, theme, lang, width)
        await page.goto(`/importa#${link}`)
        await expect(page.getByTestId('import-preview')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${OUT}/importa-anteprima-${tag}.png`, fullPage: true })
        await checks(page)
      })
      test(`impostazioni backup ${tag}`, async ({ page }) => {
        await prepare(page, theme, lang, width)
        await page.goto('/impostazioni')
        await page.getByTestId('backup-export').scrollIntoViewIfNeeded()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${OUT}/impostazioni-${tag}.png`, fullPage: true })
        await checks(page)
      })
      test(`ripristino anteprima ${tag}`, async ({ page }) => {
        await prepare(page, theme, lang, width)
        await page.goto('/impostazioni')
        const dl = page.waitForEvent('download')
        await page.getByTestId('backup-export').click()
        const path = await (await dl).path()
        await page.getByTestId('backup-file').setInputFiles(path)
        await page.getByTestId('backup-preview').waitFor()
        await page.getByRole('radio', { name: /sostituisci|replace/i }).click()
        await page.screenshot({ path: `${OUT}/ripristino-${tag}.png` })
        await checks(page, '[role=dialog]')
      })
      test(`condividi ${tag}`, async ({ page }) => {
        await prepare(page, theme, lang, width)
        await page.goto('/tests/harness/share.html')
        await expect(page.getByTestId('share-qr')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: `${OUT}/condividi-link-${tag}.png` })
        await checks(page, '[role=dialog]')
        await page.getByRole('tab').nth(1).click()
        await expect(page.locator('pre').first()).toContainText(/\S/)
        await page.screenshot({ path: `${OUT}/condividi-testo-${tag}.png` })
        await checks(page, '[role=dialog]')
      })
    }
  }
}

test('condividi: QR troppo lungo mostra l\'avviso', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto('/tests/harness/share.html?long=1')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.screenshot({ path: `${OUT}/condividi-lungo.png` })
})

test('importa da link, salva e apre la combo', async ({ page }) => {
  await page.goto(`/importa#${link}`)
  await expect(page.getByTestId('import-preview')).toContainText(/2/)
  await page.getByTestId('import-save').click()
  await expect(page.getByTestId('import-open')).toBeVisible()
  await page.getByTestId('import-open').click()
  await expect(page).toHaveURL(/\/combo\//)
})

test('importa da file (selezione) e da testo incollato', async ({ page }) => {
  await page.goto('/importa')
  await page.getByTestId('import-file').setInputFiles({ name: 'combo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) })
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await page.getByRole('button', { name: /svuota|clear/i }).click()
  await page.getByTestId('import-text').fill('1.AAAAAAAAAAAAAA')
  await page.getByTestId('import-run').click()
  await expect(page.getByTestId('import-invalid')).toBeVisible()
  await page.getByTestId('import-text').fill('non è niente')
  await page.getByTestId('import-run').click()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('backup: esporta, cancella, ripristina, annulla', async ({ page }) => {
  await page.goto('/importa#' + link)
  await page.getByTestId('import-save').click()
  await expect(page.getByTestId('import-open')).toBeVisible()
  await page.goto('/impostazioni')
  const dl = page.waitForEvent('download')
  await page.getByTestId('backup-export').click()
  const file = await (await dl).path()
  // cancella i dati locali
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases()
    await Promise.all(dbs.map((d) => new Promise((r) => { const q = indexedDB.deleteDatabase(d.name!); q.onsuccess = q.onerror = q.onblocked = () => r(null) })))
  })
  await page.goto('/impostazioni')
  await page.getByTestId('backup-file').setInputFiles(file!)
  await page.getByTestId('backup-confirm').click()
  await expect(page.getByTestId('backup-result')).toContainText(/\d/)
  await page.goto('/combo')
  await expect(page.getByText(doc.meta.title.it ?? doc.meta.title.en ?? '').first()).toBeVisible()
  await page.goto('/impostazioni')
  await page.getByTestId('backup-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"altro"}') })
  await expect(page.getByRole('alert')).toBeVisible()
})

test('sync disabilitata: messaggio chiaro e campi bloccati', async ({ page }) => {
  await page.goto('/impostazioni')
  const s = page.getByTestId('account-section')
  await expect(s).toContainText('VITE_SUPABASE_URL')
  await expect(page.getByTestId('account-send')).toBeDisabled()
  await expect(page.getByTestId('account-google')).toBeDisabled()
})
