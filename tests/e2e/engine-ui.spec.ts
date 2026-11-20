import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/** Modalità automatica con motore finto (tests/harness/engine.html): ogni richiesta a 375/768/1024/1440 × scuro/chiaro × it/en. */
const WIDTHS = [375, 768, 1024, 1440] as const
const THEMES = ['dark', 'light'] as const
const LANGS = ['it', 'en'] as const
const OUT = process.env.SHOTS_DIR ?? 'test-results/visual-engine'
mkdirSync(OUT, { recursive: true })
const URL = '/tests/harness/engine.html'
/** richieste di scelta di carte: si risponde sul campo con la barra sottile (e la fascia per le carte fuori dal campo) */
const PICKS = new Set(['cardsField', 'cardsGrid', 'tribute', 'unselect', 'sum'])

/** [chiave di esempio, test id del pannello (assente = si risponde sul campo / overlay)] */
const REQS: [string, string | null][] = [
  ['idle', null], ['battle', null], ['chain', 'req-chain'], ['chainEmpty', 'req-chain'], ['effectYn', 'req-yesno'], ['yesNo', 'req-yesno'],
  ['option', 'req-option'], ['cardsField', null], ['cardsGrid', null], ['tribute', null], ['unselect', null], ['sum', null],
  ['counter', 'req-counter'], ['place', null], ['place2', null], ['position', 'req-position'], ['sort', 'req-sort'], ['race', 'req-race'],
  ['attribute', 'req-attr'], ['number', 'req-number'], ['announceCard', 'req-announce-card'], ['rps', 'req-rps'],
]

async function prepare(page: Page, theme: string, lang: string, width: number) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 })
  await page.addInitScript(([th, lg]) => {
    localStorage.setItem('combolab.theme', th!)
    localStorage.setItem('combolab.lang', lg!)
    localStorage.setItem('combolab.sound', JSON.stringify({ volume: 0, muted: true, categories: { game: false, ui: false, feedback: false }, vibrate: false }))
  }, [theme, lang])
}

/** Minimi: niente scroll orizzontale, niente elemento fuori viewport, target >= 44px, testo non tagliato. */
async function checks(page: Page, scope: string) {
  const r = await page.evaluate((sel) => {
    const vw = window.innerWidth
    const roots = [...document.querySelectorAll(sel)]
    const out = { bad: [] as string[], small: [] as string[], cut: [] as string[], sw: document.documentElement.scrollWidth, vw }
    for (const el of roots.flatMap((r) => [r, ...r.querySelectorAll('*')])) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width <= 1 || b.height <= 1) continue
      // la fascia scorre in orizzontale: le carte fuori dallo schermo sono dentro un contenitore che scorre
      if ((b.right > vw + 1 || b.left < -1) && !el.closest('.fp-list')) out.bad.push(`${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 30)} ${Math.round(b.left)}-${Math.round(b.right)}`)
      if (el.matches('button, input') && !el.closest('.sr-only') && !el.matches('[data-card] *') && (b.height < 43.5 || b.width < 43.5)) out.small.push(`${el.tagName} ${(el.textContent ?? '').trim().slice(0, 18)} ${Math.round(b.width)}x${Math.round(b.height)}`)
    }
    for (const el of roots.flatMap((r) => [...r.querySelectorAll('.eng-btn, .eng-pill, .eng-act, h2, .eng-row > span')])) {
      const e = el as HTMLElement
      if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible' && !getComputedStyle(e).textOverflow.includes('ellipsis')) out.cut.push(`${e.className}:${e.textContent}`)
    }
    return out
  }, scope)
  expect(r.sw, 'scroll orizzontale').toBeLessThanOrEqual(r.vw)
  expect(r.bad, 'fuori viewport').toEqual([])
  expect(r.small, 'target < 44px').toEqual([])
  expect(r.cut, 'testo tagliato').toEqual([])
}

for (const width of WIDTHS) {
  for (const theme of THEMES) {
    for (const lang of LANGS) {
      test.describe(`${width} ${theme} ${lang}`, () => {
        for (const [key, id] of REQS) {
          test(`richiesta ${key}`, async ({ page }) => {
            await prepare(page, theme, lang, width)
            await page.goto(`${URL}?req=${key}`)
            await page.getByTestId('auto-board').waitFor()
            if (id) await page.getByTestId(id).waitFor()
            else if (PICKS.has(key)) await page.getByTestId('pick-bar').waitFor()
            else if (key.startsWith('place')) await page.getByTestId('place-banner').waitFor()
            await page.waitForTimeout(350)
            await page.screenshot({ path: `${OUT}/${key}-${width}-${theme}-${lang}.png` })
            await checks(page, id ? '[data-engine-sheet]' : '.fp-bar, .fp-band')
            if (PICKS.has(key)) {
              // la barra e la fascia stanno SOTTO il campo (in flusso): non lo coprono mai
              const r = await page.evaluate(() => {
                const f = document.querySelector('.cl-field')!.getBoundingClientRect()
                return { fb: f.bottom, ft: f.top, others: [...document.querySelectorAll('.fp-bar, .fp-band')].map((e) => e.getBoundingClientRect().top), cands: document.querySelectorAll('[data-pick="cand"], [data-pick="chosen"], .fp-tile[data-state="cand"]').length }
              })
              for (const top of r.others) expect(top, 'la barra/fascia non copre il campo').toBeGreaterThanOrEqual(r.fb - 1)
              expect(r.cands, 'candidati evidenziati').toBeGreaterThan(0)
            }
            if (id) {
              const box = await page.getByTestId(id).boundingBox()
              expect(box!.y, 'pannello dentro il viewport').toBeGreaterThanOrEqual(0)
              expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1)
            }
          })
        }
        test('avvio (pannello, setup in sola lettura)', async ({ page }) => {
          await prepare(page, theme, lang, width)
          await page.goto(`${URL}?view=start`)
          await page.getByTestId('start-panel').waitFor()
          await page.waitForTimeout(250)
          await page.screenshot({ path: `${OUT}/start-${width}-${theme}-${lang}.png` })
          await checks(page, '[data-testid=start-panel]')
        })
        for (const kind of ['loading', 'error', 'unsupported']) {
          test(`avvisi ${kind}`, async ({ page }) => {
            await prepare(page, theme, lang, width)
            await page.goto(`${URL}?view=notices&kind=${kind}`)
            await page.getByTestId('auto-board').waitFor()
            await page.waitForTimeout(250)
            await page.screenshot({ path: `${OUT}/notices-${kind}-${width}-${theme}-${lang}.png` })
            await checks(page, '[data-testid=auto-dock], [data-testid=auto-notices]')
          })
        }
      })
    }
  }
}
