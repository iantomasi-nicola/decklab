import { expect, type Page } from '@playwright/test'
import { ID, fillerIds } from '../mocks/cardsData'

export type Seed = { archetypeId: string; variantId: string; oldVariantId: string; archetype2Id: string }

export async function prepare(page: Page, theme = 'dark', lang = 'it') {
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Dati di prova scritti con i repository reali (stesso modulo dell'app: nessun doppione di Dexie). */
export async function seed(page: Page): Promise<Seed> {
  await page.goto('/impostazioni')
  await expect(page.locator('h1')).toBeVisible()
  return page.evaluate(
    async ({ filler, ids }) => {
      const load = new Function('p', 'return import(p)') as (p: string) => Promise<{ repos: any }>
      const { repos } = await load('/src/data/repo.ts')
      const a = await repos.archetypes.create({
        name: { it: 'Drago Bianco', en: 'Blue-Eyes' },
        notes: { it: 'Apri con una carta starter e proteggi la linea.', en: 'Open with a starter and protect the line.' },
        keyCards: [ids.blueEyes, ids.darkMagician],
        starters: [ids.ash],
        extenders: [],
      })
      const a2 = await repos.archetypes.create({ name: { it: 'Mago Nero', en: 'Dark Magician' }, keyCards: [], starters: [], extenders: [] })
      const v = await repos.variants.create({
        archetypeId: a.id,
        name: { it: 'Versione torneo', en: 'Tournament build' },
        rules: 'TCG',
        banlist: { format: 'TCG', id: '2026.10' },
        deck: { main: filler.slice(0, 40), extra: [ids.accesscode, ids.baronne], side: [] },
      })
      // legale con la banlist 2026.09, illegale con la 2026.10 (Chiamato dalla Tomba diventa Limitata)
      const old = await repos.variants.create({
        archetypeId: a.id,
        name: { it: 'Vecchia banlist', en: 'Old banlist' },
        rules: 'TCG',
        banlist: { format: 'TCG', id: '2026.09' },
        deck: { main: [...filler.slice(0, 37), ids.calledByGrave, ids.calledByGrave, ids.calledByGrave], extra: [], side: [] },
      })
      return { archetypeId: a.id, variantId: v.id, oldVariantId: old.id, archetype2Id: a2.id }
    },
    { filler: fillerIds(60), ids: ID },
  )
}

/** Elementi visibili che escono dal viewport (esclusi i contenitori che scorrono di proposito). */
export async function overflowing(page: Page) {
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
      if (r.width === 0 || r.height === 0 || (r.width <= 1 && r.height <= 1)) continue
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 50)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
    }
    return bad
  })
}

export async function expectNoHorizontalScroll(page: Page) {
  const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(sw.s, 'scroll orizzontale').toBeLessThanOrEqual(sw.w)
  expect(await overflowing(page), 'elementi oltre il viewport').toEqual([])
}

/** Controlli interattivi più piccoli di 44px (radio/checkbox dentro una label e file input nascosti esclusi). */
export async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a, button, [role=tab], select, textarea, input:not([type=radio]):not([type=file]):not([type=checkbox])')]
      .filter((e) => !e.closest('.sr-only') && !(e as HTMLElement).classList.contains('sr-only'))
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { t: (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }
      })
      .filter((r) => r.h > 0 && (r.h < 43.5 || r.w < 43.5)),
  )
}

export const collectErrors = (page: Page) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}
