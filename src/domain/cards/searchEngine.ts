/**
 * Motore di ricerca carte (puro, senza DOM): usato dal Web Worker (src/workers/cards.worker.ts) e dai test.
 *
 * - Un documento per carta BASE (gli artwork alternativi confluiscono nella base, come in CardIndex).
 * - Campi `en` e `it`: nomi normalizzati (normalizeName: minuscole, senza accenti/apostrofi, "&" → "and").
 * - MiniSearch: prefisso + fuzzy (solo su termini ≥ 4 caratteri), AND tra i termini (fallback OR se nulla).
 * - Riordino: nome identico > nome che inizia con la query > parola che inizia con la query > contiene > resto.
 */
import MiniSearch from 'minisearch'
import type { Card, Lang } from '../types'
import { normalizeName } from '../deck/cardIndex'

export type CardFilters = {
  kind?: 'monster' | 'spell' | 'trap'
  extraOnly?: boolean
  attribute?: number
  race?: number
  levelMin?: number
  levelMax?: number
  setcode?: number
  inFormat?: 'TCG' | 'OCG'
}

export interface SearchOptions {
  limit?: number
  filters?: CardFilters
  lang?: Lang
}

export interface SearchEngine {
  search(query: string, opts?: SearchOptions): Card[]
  /** Numero di carte base indicizzate. */
  size: number
}

interface Doc {
  id: number
  en: string
  it: string
}

interface Names {
  en: string[]
  it: string[]
}

const TYPE_MONSTER = 0x1
const TYPE_SPELL = 0x2
const TYPE_TRAP = 0x4

/** Una carta soddisfa i filtri (tutti opzionali; attributo/razza sono maschere di bit EDOPro). */
export function matchesFilters(c: Card, f: CardFilters | undefined): boolean {
  if (!f) return true
  if (f.kind === 'monster' && !(c.type & TYPE_MONSTER)) return false
  if (f.kind === 'spell' && !(c.type & TYPE_SPELL)) return false
  if (f.kind === 'trap' && !(c.type & TYPE_TRAP)) return false
  if (f.extraOnly && !c.isExtra) return false
  if (f.attribute !== undefined && !(c.attribute & f.attribute)) return false
  if (f.race !== undefined && !(c.race & f.race)) return false
  if (f.levelMin !== undefined && c.level < f.levelMin) return false
  if (f.levelMax !== undefined && c.level > f.levelMax) return false
  if (f.setcode !== undefined) {
    const want = f.setcode
    // regola EDOPro: stessa famiglia (12 bit bassi) e sottotipo contenuto
    if (!c.setcodes.some((s) => (s & 0xfff) === (want & 0xfff) && (s & want) === want)) return false
  }
  if (f.inFormat === 'TCG' && !c.tcg) return false
  if (f.inFormat === 'OCG' && !c.ocg) return false
  return true
}

const tokenize = (s: string) => s.split(' ').filter(Boolean)

export function createSearchEngine(cards: readonly Card[]): SearchEngine {
  const byId = new Map<number, Card>()
  for (const c of cards) byId.set(c.id, c)
  const baseOf = (c: Card): Card => (c.alias ? (byId.get(c.alias) ?? c) : c)

  // nomi di ogni carta base (anche quelli degli artwork alternativi, se diversi)
  const names = new Map<number, Names>()
  const bases = new Map<number, Card>()
  for (const c of cards) {
    const b = baseOf(c)
    bases.set(b.id, b)
    let n = names.get(b.id)
    if (!n) names.set(b.id, (n = { en: [], it: [] }))
    const en = normalizeName(c.name.en)
    if (en && !n.en.includes(en)) n.en.push(en)
    const it = c.name.it ? normalizeName(c.name.it) : ''
    if (it && !n.it.includes(it)) n.it.push(it)
  }

  const docs: Doc[] = []
  for (const [id, n] of names) docs.push({ id, en: n.en.join(' '), it: n.it.join(' ') })

  const mini = new MiniSearch<Doc>({
    fields: ['en', 'it'],
    idField: 'id',
    tokenize,
    processTerm: (t) => t, // già normalizzato
    searchOptions: { tokenize, processTerm: (t) => t },
  })
  mini.addAll(docs)

  // ordine alfabetico stabile per le ricerche solo-filtri
  let alphabetical: Card[] | undefined
  const allSorted = () =>
    (alphabetical ??= [...bases.values()].sort((a, b) => a.name.en.localeCompare(b.name.en)))

  const rank = (id: number, q: string, lang: Lang, score: number): number => {
    const n = names.get(id)!
    let best = 0
    for (const l of ['en', 'it'] as const) {
      const langBoost = l === lang ? 1 : 0.85
      for (const name of n[l]) {
        let bonus = 0
        if (name === q) bonus = 1000
        else if (name.startsWith(q)) bonus = 500 - name.length * 2
        else if (name.includes(' ' + q)) bonus = 200 - name.length * 2
        else if (name.includes(q)) bonus = 100
        else if (q.includes(' ')) {
          // ogni termine è prefisso di una parola, nell'ordine digitato
          const ws = name.split(' ')
          let from = 0
          let ok = true
          for (const t of tokenize(q)) {
            const i = ws.findIndex((w, k) => k >= from && w.startsWith(t))
            if (i < 0) { ok = false; break }
            from = i + 1
          }
          if (ok) bonus = 150 - name.length * 2
        }
        best = Math.max(best, bonus * langBoost)
      }
    }
    return best + score
  }

  return {
    size: bases.size,
    search(query, opts = {}) {
      const limit = opts.limit ?? 20
      const lang = opts.lang ?? 'it'
      const f = opts.filters
      const q = normalizeName(query)
      if (!q) {
        if (!f) return []
        const out: Card[] = []
        for (const c of allSorted()) {
          if (matchesFilters(c, f)) out.push(c)
          if (out.length >= limit) break
        }
        return out
      }

      const out: Card[] = []
      const seen = new Set<number>()
      const push = (c: Card | undefined) => {
        if (c && !seen.has(c.id) && matchesFilters(c, f) && out.length < limit) {
          seen.add(c.id)
          out.push(c)
        }
      }
      // passcode digitato per intero
      if (/^\d{5,10}$/.test(q)) {
        const c = byId.get(Number(q))
        if (c) push(baseOf(c))
      }

      const terms = tokenize(q)
      const base = {
        prefix: true,
        fuzzy: (t: string) => (t.length >= 8 ? 0.25 : t.length >= 4 ? 0.2 : false),
        boost: { [lang]: 1.4 },
        filter: (r: { id: number }) => matchesFilters(bases.get(r.id as number)!, f),
      }
      let hits = mini.search(q, { ...base, combineWith: 'AND' })
      if (!hits.length && terms.length > 1) hits = mini.search(q, { ...base, combineWith: 'OR' })

      const ranked = hits.map((h) => ({ id: h.id as number, s: rank(h.id as number, q, lang, h.score) }))
      ranked.sort((a, b) => b.s - a.s)
      for (const r of ranked) {
        push(bases.get(r.id))
        if (out.length >= limit) break
      }
      return out
    },
  }
}
