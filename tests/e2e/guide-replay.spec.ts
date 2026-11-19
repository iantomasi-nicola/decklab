import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { newIds, seedGuideWithIds, type Seeded } from './helpers/guide'

const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
const OUT = process.env.SHOTS_DIR ?? 'test-results/guide'
mkdirSync(OUT, { recursive: true })

async function prepare(page: Page, theme: string, lang: string) {
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Elementi visibili che escono dal viewport (esclusi quelli dentro contenitori che scorrono di proposito). */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth
    const bad: string[] = []
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true
      }
      return false
    }
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (r.width <= 1 && r.height <= 1) continue
      if (r.right > vw + 1 || r.left < -1) {
        if (!clipped(el)) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
      }
    }
    return bad
  })
}

/** Controlli interattivi visibili sotto i 44 px (nel contenuto principale). */
async function smallTargets(page: Page, scope = 'main') {
  return page.evaluate((scope) => {
    const out: string[] = []
    for (const el of document.querySelectorAll(`${scope} a[href], ${scope} button:not([disabled])`)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const clipped = (() => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p)
          if (o.overflowX === 'auto' || o.overflowY === 'auto') {
            const pr = p.getBoundingClientRect()
            if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true
          }
        }
        return false
      })()
      if (clipped) continue
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  }, scope)
}

const ids: Seeded = newIds()
const seeded = (page: Page) => seedGuideWithIds(page, ids)

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`guida ${width} ${theme} ${lang}`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(String(e)))
        await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
        await prepare(page, theme, lang)
        await seeded(page)
        await page.goto(`/combo/${ids.motherId}/guida`)
        await expect(page.getByTestId('guide-page')).toBeVisible()
        await expect(page.locator('h1')).toBeVisible()
        await page.waitForTimeout(500) // dataset carte (nomi, legalità)
        await expect(page.getByTestId('legality-badge')).toHaveAttribute('data-state', 'legal')
        await expect(page.locator('[data-step]')).toHaveCount(7)
        await expect(page.getByTestId('guide-branch')).toHaveCount(1)
        await expect(page.getByTestId('guide-variants').locator('a')).toHaveCount(1)
        // nota con @carta resa come nome nella lingua scelta
        const note = lang === 'it' ? 'Tengu Resuscitato' : 'Reborn Tengu'
        await expect(page.locator('[data-step="1"]')).toContainText(note)
        await expect(page.locator('[data-step="1"]')).not.toContainText('@')
        await page.screenshot({ path: `${OUT}/guida-${width}-${theme}-${lang}.png`, fullPage: true })
        const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }))
        expect(sw.s, 'scroll orizzontale').toBeLessThanOrEqual(sw.w)
        expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
        expect(await smallTargets(page, '[data-testid="guide-page"]'), 'target < 44px').toEqual([])
        expect(errors).toEqual([])
      })
    }
  }
}

test('guida: carta proibita → badge illegale con motivo; combo vuota → messaggio', async ({ page }) => {
  await prepare(page, 'dark', 'en')
  await seeded(page)
  await page.goto(`/combo/${ids.illegalId}/guida`)
  await expect(page.getByTestId('legality-badge')).toHaveAttribute('data-state', 'illegal')
  await expect(page.getByTestId('legality-issues')).toContainText('Branded Expulsion')
  await page.goto(`/combo/${ids.emptyId}/guida`)
  await expect(page.getByText('This combo has no steps yet.')).toBeVisible()
})

test('guida: pulsanti Replay/Modifica, Impara disattivato, varianti collegate', async ({ page }) => {
  await prepare(page, 'dark', 'it')
  await seeded(page)
  await page.goto(`/combo/${ids.motherId}/guida`)
  await expect(page.getByTestId('guide-learn')).toBeDisabled()
  await page.getByTestId('guide-variants').locator('a').click()
  await expect(page).toHaveURL(new RegExp(`/combo/${ids.variantId}/guida`))
  // la variante mostra la madre con il passo di divergenza
  await expect(page.getByTestId('guide-variants')).toContainText('Diverge dopo il passo 3')
  await page.getByTestId('guide-replay').click()
  await expect(page).toHaveURL(new RegExp(`/combo/${ids.variantId}/replay`))
  await expect(page.getByTestId('replay-field')).toBeVisible()
})

test('guida: esporta copia il testo con i nomi al posto di @carta', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await prepare(page, 'dark', 'en')
  await seeded(page)
  await page.goto(`/combo/${ids.motherId}/guida`)
  await page.waitForTimeout(500)
  await page.getByTestId('guide-export').click()
  await page.getByRole('menuitem', { name: 'Numbered text' }).click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('1. Normal Summon')
  expect(text).toContain('Reborn Tengu')
  expect(text).not.toContain('@')
})

/* ------------------------------------------------------------------ replay */
for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test(`replay ${width} ${theme} ${lang}`, async ({ page }) => {
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(String(e)))
        const height = width < 768 ? 800 : 900
        await page.setViewportSize({ width, height })
        await prepare(page, theme, lang)
        await seeded(page)
        await page.goto(`/combo/${ids.motherId}/replay`)
        await page.waitForSelector('[data-field]')
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${OUT}/replay-start-${width}-${theme}-${lang}.png` })
        // passo 4: catena in corso (anelli evidenziati)
        for (let i = 1; i <= 3; i++) {
          await page.getByTestId('rp-next').click()
          await expect(page.getByTestId('rp-counter')).toContainText(String(i))
        }
        await page.waitForTimeout(350) // fine animazioni
        await expect(page.locator('[data-card][data-chain]')).toHaveCount(2)
        await expect(page.locator('[data-card][data-active]')).toHaveCount(1)
        await page.screenshot({ path: `${OUT}/replay-chain-${width}-${theme}-${lang}.png` })

        const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth, h: document.documentElement.scrollHeight, vh: window.innerHeight }))
        expect(sw.s, 'scroll orizzontale').toBeLessThanOrEqual(sw.w)
        expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
        expect(await smallTargets(page, '[data-testid="replay-page"]'), 'target < 44px').toEqual([])
        // campo dentro il viewport, controlli visibili; mano propria sotto il campo
        const f = (await page.locator('[data-field]').boundingBox())!
        expect(f.y).toBeGreaterThanOrEqual(0)
        expect(f.y + f.height).toBeLessThanOrEqual(height + 1)
        const bar = (await page.getByTestId('replay-controls').boundingBox())!
        expect(bar.y + bar.height).toBeLessThanOrEqual(height + 1)
        const hand = (await page.locator('[data-zone="p:0:hand"]').boundingBox())!
        const ownDeck = (await page.locator('[data-zone="p:0:deck"]').boundingBox())!
        expect(hand.y).toBeGreaterThan(ownDeck.y)
        expect(errors).toEqual([])
      })
    }
  }
}

test('replay: play/pausa, passi, velocità, salto, scorciatoie e ramo', async ({ page }) => {
  await prepare(page, 'dark', 'en')
  await page.setViewportSize({ width: 1024, height: 800 })
  await seeded(page)
  await page.goto(`/combo/${ids.motherId}/replay`)
  await page.waitForSelector('[data-field]')
  const counter = page.getByTestId('rp-counter')
  await expect(counter).toHaveText('Start')
  await page.keyboard.press('ArrowRight')
  await expect(counter).toHaveText('Step 1 of 7')
  await page.keyboard.press('ArrowLeft')
  await expect(counter).toHaveText('Start')
  await page.keyboard.press('End')
  await expect(counter).toHaveText('Step 7 of 7')
  await page.keyboard.press('Home')
  // velocità: ciclo fino a 3× e riproduzione fino alla fine
  const speed = page.getByTestId('rp-speed')
  await expect(speed).toHaveText('1×')
  for (let i = 0; i < 3; i++) await speed.click()
  await expect(speed).toHaveText('3×')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('Space')
  await expect(page.getByTestId('rp-play')).toHaveAttribute('data-playing', 'true')
  await expect(counter).toHaveText('Step 7 of 7', { timeout: 8000 })
  await expect(page.getByTestId('rp-play')).toHaveAttribute('data-playing', 'false')
  // salto dalla lista dei passi
  await page.getByTestId('replay-steplist').locator('[data-frame="3"]').click()
  await expect(counter).toHaveText('Step 3 of 7')
  await expect(page.locator('[data-card="o2"]')).toHaveCount(1) // il mostro avversario è ancora in campo
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-card="o2"][data-loc="gy"]')).toHaveCount(1)
  // ramo
  await page.getByTestId('rp-line').click()
  await page.getByRole('menuitem', { name: 'Ash on the search' }).click()
  await expect(counter).toHaveText('Step 2 of 2')
  await page.keyboard.press('ArrowRight')
  await expect(counter).toHaveText('Branch, step 1 of 2')
  await expect(page.locator('[data-card][data-active]')).toHaveCount(1)
})

test('replay: animazioni rapide dei movimenti, nessuna con prefers-reduced-motion', async ({ page }) => {
  await prepare(page, 'dark', 'en')
  await page.setViewportSize({ width: 1024, height: 800 })
  await seeded(page)
  await page.goto(`/combo/${ids.motherId}/replay`)
  await page.waitForSelector('[data-field]')
  await page.getByTestId('rp-next').click()
  const anim = await page.evaluate(() => {
    const el = document.querySelector('[data-card="u1"]')!
    return el.getAnimations().map((a) => ({ d: (a.effect!.getTiming().duration as number), keys: Object.keys((a.effect as KeyframeEffect).getKeyframes()[0]!).filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)) }))
  })
  expect(anim.length).toBeGreaterThan(0)
  for (const a of anim) {
    expect(a.d).toBeGreaterThanOrEqual(150)
    expect(a.d).toBeLessThanOrEqual(250)
    expect(a.keys.every((k) => k === 'transform' || k === 'opacity')).toBe(true)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('rp-next').click()
  const n = await page.evaluate(() => document.querySelector('[data-card="u2"]')!.getAnimations().length)
  expect(n).toBe(0)
})

test('replay: barra riducibile e combo senza passi', async ({ page }) => {
  await prepare(page, 'dark', 'it')
  await page.setViewportSize({ width: 375, height: 800 })
  await seeded(page)
  await page.goto(`/combo/${ids.motherId}/replay`)
  await page.waitForSelector('[data-field]')
  const h0 = (await page.locator('[data-field]').boundingBox())!.height
  await page.getByTestId('rp-expand').click()
  await expect(page.getByTestId('replay-timeline')).toBeVisible()
  const h1 = (await page.locator('[data-field]').boundingBox())!.height
  expect(h1).toBeLessThanOrEqual(h0)
  await page.goto(`/combo/${ids.emptyId}/replay`)
  await expect(page.getByTestId('replay-empty')).toBeVisible()
  await expect(page.getByTestId('rp-play')).toBeDisabled()
})
