import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ID, MOCK_CARDS } from '../mocks/cardsData'
import { seedSide } from './side.helpers'
import { overflowing, smallTargets } from './decks.helpers'
import { sampleDoc } from './helpers/guide'

/**
 * Giro QA completo: ogni rotta × 375/768/1024/1440 × scuro/chiaro × it/en (mock carte, porta 4190).
 * Screenshot in test-results/qa/ e rapporto dei difetti automatici in test-results/qa/issues/*.json (non bloccanti: si guardano).
 *   npx playwright test -c playwright.qa.config.ts
 */
const OUT = 'test-results/qa'
mkdirSync(`${OUT}/issues`, { recursive: true })
const WIDTHS = [375, 768, 1024, 1440] as const
const HEIGHTS: Record<number, number> = { 375: 667, 768: 1024, 1024: 768, 1440: 900 }

// carte reali del fixture lungo → carte di prova dello stesso genere
const longDoc = JSON.parse(readFileSync('tests/fixtures/combo/long-60.json', 'utf8')) as { cards: Record<string, number>; deck: { main: number[]; extra: number[]; side: number[] }; meta: { id: string; archetype: { id?: string } } }
const realCols = (() => {
  const m = JSON.parse(readFileSync('public/data/manifest.json', 'utf8'))
  const c = JSON.parse(readFileSync(`public/data/${m.files.cards}`, 'utf8')).cols as { id: number[]; type: number[] }
  const t = new Map<number, number>()
  c.id.forEach((id, i) => t.set(id, c.type[i]!))
  return t
})()
const mockByKind = { mon: MOCK_CARDS.filter((c) => c.id >= 80000000 && c.id < 80000100).map((c) => c.id), spell: [81000000, 81000001, 81000002, 81000003, 81000004, 81000005], trap: [82000000, 82000001, 82000002, 82000003, 82000004, 82000005], extra: [ID.utopia, ID.baronne, ID.apollousa, 70000006, 70000007, 70000008, 70000009] }
function remap(codes: number[]): Map<number, number> {
  const out = new Map<number, number>()
  const n = { mon: 0, spell: 0, trap: 0, extra: 0 }
  for (const code of codes) {
    if (out.has(code)) continue
    const t = realCols.get(code) ?? 1
    const k = t & 2 ? 'spell' : t & 4 ? 'trap' : t & (0x40 | 0x2000 | 0x800000 | 0x4000000) ? 'extra' : 'mon'
    const list = mockByKind[k]
    out.set(code, list[n[k]++ % list.length]!)
  }
  return out
}
function toMock<T>(doc: T): T {
  const s = JSON.stringify(doc)
  const codes = [...new Set((s.match(/\b\d{5,9}\b/g) ?? []).map(Number))].filter((c) => realCols.has(c))
  const m = remap(codes)
  return JSON.parse(s.replace(/\b\d{5,9}\b/g, (x) => String(m.get(Number(x)) ?? x)))
}

interface Seeded { archetypeId: string; variantId: string; comboId: string; longId: string; autoId: string; extraArchId: string }

async function seedAll(page: Page): Promise<Seeded> {
  const side = await seedSide(page)
  const now = new Date().toISOString()
  const archetypeId = randomUUID()
  const comboId = randomUUID()
  const longId = randomUUID()
  const autoId = randomUUID()
  const guideDoc = toMock(sampleDoc({ id: comboId, archetypeId, legal: true, now }))
  const long = toMock(longDoc)
  long.meta.id = longId
  long.meta.archetype.id = archetypeId
  // modalità Automatica (senza motore raggiungibile in test: si vede lo stato di avviso/ripiego)
  const autoDoc = JSON.parse(JSON.stringify(guideDoc)) as typeof guideDoc & { x?: Record<string, unknown> }
  autoDoc.meta.id = autoId
  autoDoc.x = { playMode: 'auto' }
  await page.evaluate(
    async ({ docs, archetypeId, now }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('decklab')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(['archetypes', 'combos'], 'readwrite')
        tx.objectStore('archetypes').put({ id: archetypeId, name: { it: 'Combo di prova', en: 'Test combos' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
        for (const d of docs as { meta: { id: string; title: unknown } }[])
          tx.objectStore('combos').put({ id: d.meta.id, archetypeId, variantId: null, name: d.meta.title, tagIds: [], payload: d, updatedAt: now, deletedAt: null })
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      db.close()
      localStorage.setItem('combolab.stats.variant', '')
    },
    { docs: [guideDoc, long, autoDoc], archetypeId, now },
  )
  const archId = await page.evaluate(async (vid) => {
    const load = new Function('p', 'return import(p)') as (p: string) => Promise<{ repos: any }>
    const { repos } = await load('/src/data/repo.ts')
    const v = await repos.variants.get(vid)
    localStorage.setItem('combolab.stats.variant', vid)
    return v.archetypeId as string
  }, side.variantId)
  return { archetypeId: archId, variantId: side.variantId, comboId, longId, autoId, extraArchId: archetypeId }
}

const ROUTES: [string, (s: Seeded) => string][] = [
  ['home', () => '/'],
  ['archetipi', () => '/archetipi'],
  ['archetipo', (s) => `/archetipi/${s.archetypeId}`],
  ['mazzi', () => '/mazzi'],
  ['mazzo', (s) => `/mazzi/${s.variantId}`],
  ['combo-lista', () => '/combo'],
  ['combo-editor', (s) => `/combo/${s.comboId}`],
  ['combo-editor-lunga', (s) => `/combo/${s.longId}`],
  ['combo-editor-auto', (s) => `/combo/${s.autoId}`],
  ['guida', (s) => `/combo/${s.comboId}/guida`],
  ['guida-lunga', (s) => `/combo/${s.longId}/guida`],
  ['replay', (s) => `/combo/${s.comboId}/replay`],
  ['replay-lunga', (s) => `/combo/${s.longId}/replay`],
  ['side', () => '/side'],
  ['statistiche', () => '/statistiche'],
  ['impara', () => '/impara'],
  ['impostazioni', () => '/impostazioni'],
  ['importa', () => '/importa'],
]
const only = process.env.QA_ONLY?.split(',')
const themes = (process.env.QA_THEMES?.split(',') ?? ['dark', 'light']) as ('dark' | 'light')[]
const langs = (process.env.QA_LANGS?.split(',') ?? ['it', 'en']) as ('it' | 'en')[]

for (const theme of themes) {
  for (const lang of langs) {
    test.describe(`${theme} ${lang}`, () => {
      for (const [name, path] of ROUTES) {
        if (only && !only.includes(name)) continue
        test(`${name}`, async ({ page }) => {
          const errors: string[] = []
          page.on('console', (m) => {
            if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text())
          })
          page.on('pageerror', (e) => errors.push(String(e)))
          await page.addInitScript(([th, lg]) => {
            try {
              localStorage.setItem('combolab.theme', th!)
              localStorage.setItem('combolab.lang', lg!)
            } catch { /* */ }
          }, [theme, lang])
          await page.setViewportSize({ width: 1024, height: 768 })
          const seeded = await seedAll(page)
          const issues: Record<string, unknown> = {}
          for (const w of WIDTHS) {
            await page.setViewportSize({ width: w, height: HEIGHTS[w]! })
            await page.goto(path(seeded))
            await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
            await page.waitForLoadState('networkidle')
            await page.evaluate(() => document.fonts.ready)
            await page.waitForTimeout(name.includes('stat') ? 1800 : 700)
            await page.screenshot({ path: `${OUT}/${name}-${w}-${theme}-${lang}-vp.png` })
            if (!/editor|replay/.test(name)) {
              // pagina intera: niente barra fissa in mezzo e niente content-visibility (altrimenti i passi sotto la piega restano vuoti)
              await page.addStyleTag({ content: 'nav.fixed{display:none!important}*{content-visibility:visible!important}[class*=sticky]{position:static!important}' })
              await page.waitForTimeout(150)
              await page.screenshot({ path: `${OUT}/${name}-${w}-${theme}-${lang}.png`, fullPage: true })
            }
            const sw = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }))
            issues[w] = {
              hscroll: sw.s > sw.w ? sw : null,
              overflow: await overflowing(page),
              small: w === 375 ? await smallTargets(page) : undefined,
            }
          }
          writeFileSync(`${OUT}/issues/${name}-${theme}-${lang}.json`, JSON.stringify({ errors, issues }, null, 1))
          expect(errors, 'errori in console').toEqual([])
        })
      }
    })
  }
}

test('editor 375×667: le zone Mostri/Magie-Trappole hanno carta ≥ 42 px di larghezza (campo con avversario visibile; la cella è alta quanto la carta)', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('combolab.lang', 'it')
      localStorage.setItem('combolab.field.mineOnly', '0')
    } catch { /* */ }
  })
  await page.setViewportSize({ width: 1024, height: 768 })
  const seeded = await seedAll(page)
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto(`/combo/${seeded.comboId}`)
  await page.waitForSelector('[data-field]')
  await page.waitForTimeout(500)
  const size = async (key: string) => {
    const b = await page.locator(`[data-zone="${key}"] .cl-zone, [data-zone="${key}"]`).first().boundingBox()
    return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null
  }
  const own = { m: await size('z:0:mzone:2'), t: await size('z:0:szone:2'), opp: await size('z:1:mzone:2') }
  console.log('zone 375x667', JSON.stringify(own))
  await page.screenshot({ path: `${OUT}/editor-375x667-both.png` })
  // altezza cella = altezza carta; larghezza carta = altezza × 59/86
  expect((own.m!.h * 59) / 86).toBeGreaterThanOrEqual(41.5)
  expect((own.t!.h * 59) / 86).toBeGreaterThanOrEqual(41.5)
})
