import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
// @ts-expect-error modulo .mjs senza tipi
import { makeLong } from '../../fixtures/combo/makeLong.mjs'

export const WIDTHS = [375, 768, 1024, 1440] as const
export const THEMES = ['dark', 'light'] as const
export const LANGS = ['it', 'en'] as const

export async function prepare(page: Page, theme: string, lang: string) {
  await page.addInitScript(
    ([th, lg]) => {
      localStorage.setItem('combolab.theme', th!)
      localStorage.setItem('combolab.lang', lg!)
    },
    [theme, lang],
  )
}

/** Scrive in IndexedDB una combo lunga (generata da makeLong) e ritorna il suo id. */
export async function seedLong(page: Page, n: number): Promise<string> {
  const id = randomUUID()
  const doc = makeLong(n, { id })
  const now = new Date().toISOString()
  const archetypeId = randomUUID()
  doc.meta.archetype.id = archetypeId
  const write = async () => {
    await page.goto('/combo')
    await page.getByTestId('new-combo').waitFor()
    await page.waitForLoadState('networkidle')
    await page.evaluate(
      async ({ doc, archetypeId, now }) => {
        const db = await new Promise<IDBDatabase>((res, rej) => {
          const r = indexedDB.open('decklab')
          r.onsuccess = () => res(r.result)
          r.onerror = () => rej(r.error)
        })
        await new Promise<void>((res, rej) => {
          const tx = db.transaction(['archetypes', 'combos'], 'readwrite')
          tx.objectStore('archetypes').put({ id: archetypeId, name: { it: 'Prova', en: 'Test' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
          tx.objectStore('combos').put({ id: doc.meta.id, archetypeId, variantId: null, name: doc.meta.title, tagIds: [], payload: doc, updatedAt: now, deletedAt: null })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(tx.error)
        })
        db.close()
      },
      { doc, archetypeId, now },
    )
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await write()
      return id
    } catch (e) {
      if (attempt >= 2) throw e
    }
  }
}

/** Elementi visibili che escono dal viewport (esclusi quelli dentro contenitori che scorrono di proposito). */
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
      if (r.width <= 1 && r.height <= 1) continue
      if (r.right > vw + 1 || r.left < -1) {
        if (!clipped(el)) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').slice(0, 60)} [${Math.round(r.left)}..${Math.round(r.right)}]`)
      }
    }
    return bad
  })
}

/** Controlli interattivi visibili sotto i 44 px (nel contenuto indicato), esclusi quelli tagliati da un contenitore che scorre. */
export async function smallTargets(page: Page, scope = 'main') {
  return page.evaluate((scope) => {
    const out: string[] = []
    for (const el of document.querySelectorAll(`${scope} a[href], ${scope} button:not([disabled]), ${scope} input, ${scope} [role="slider"]`)) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cut = (() => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p)
          if (o.overflowX === 'auto' || o.overflowY === 'auto') {
            const pr = p.getBoundingClientRect()
            if (r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1 || r.top < pr.top - 1) return true
          }
        }
        return false
      })()
      if (cut) continue
      if (r.height < 43.5 || (r.width < 43.5 && !(el as HTMLElement).closest('[data-allow-narrow]'))) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    return out
  }, scope)
}

export interface Box { x: number; y: number; width: number; height: number }
export const overlap = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1
