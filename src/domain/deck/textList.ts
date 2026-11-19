import type { Card, DeckLists } from '../types'
import { normalizeName, type CardIndex } from './cardIndex'

export type DeckSection = 'main' | 'extra' | 'side'

export interface MatchedLine {
  line: string
  card: Card // carta canonica
  count: number
  section?: DeckSection
  /** true se il match non era esatto (tollerante) */
  fuzzy: boolean
}
export interface AmbiguousLine {
  line: string
  count: number
  section?: DeckSection
  candidates: Card[]
}
export interface UnmatchedLine {
  line: string
  count: number
  section?: DeckSection
}
export interface TextListResult {
  matched: MatchedLine[]
  ambiguous: AmbiguousLine[]
  unmatched: UnmatchedLine[]
}

const SECTION_HEADERS: Record<string, DeckSection> = {
  main: 'main', 'main deck': 'main', 'mazzo principale': 'main', 'mazzo main': 'main', monsters: 'main',
  extra: 'extra', 'extra deck': 'extra',
  side: 'side', 'side deck': 'side', sideboard: 'side', 'mazzo side': 'side',
}

export function levenshteinWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

function maxDistance(len: number): number {
  if (len < 6) return 0
  return Math.min(3, Math.floor(len / 6))
}

type Found = { kind: 'one'; card: Card; fuzzy: boolean } | { kind: 'many'; cards: Card[] } | { kind: 'none' }

function dedupe(cards: Card[]): Card[] {
  return [...new Map(cards.map((c) => [c.id, c])).values()]
}

function exact(name: string, index: CardIndex): Found {
  const n = normalizeName(name)
  if (!n) return { kind: 'none' }
  const hits = index.findByName(n)
  if (hits.length === 1) return { kind: 'one', card: hits[0]!, fuzzy: false }
  if (hits.length > 1) return { kind: 'many', cards: hits }
  return { kind: 'none' }
}

function tolerant(name: string, index: CardIndex): Found {
  const n = normalizeName(name)
  if (!n) return { kind: 'none' }
  const max = maxDistance(n.length)
  let best = max + 1
  let cands: Card[] = []
  for (const e of index.names()) {
    const d = levenshteinWithin(n, e.normalized, max)
    if (d > max) continue
    if (d < best) { best = d; cands = [e.card] } else if (d === best) cands.push(e.card)
  }
  cands = dedupe(cands)
  if (cands.length === 1) return { kind: 'one', card: cands[0]!, fuzzy: true }
  if (cands.length > 1) return { kind: 'many', cards: cands }
  if (n.length >= 5) {
    const pre = dedupe(index.names().filter((e) => e.normalized.startsWith(n + ' ') || e.normalized.startsWith(n)).map((e) => e.card))
    if (pre.length === 1) return { kind: 'one', card: pre[0]!, fuzzy: true }
    if (pre.length > 1) return { kind: 'many', cards: pre }
  }
  return { kind: 'none' }
}

/** Interpretazioni "conteggio + nome" di una riga, in ordine di priorità. */
function interpretations(line: string): { name: string; count: number }[] {
  const out: { name: string; count: number }[] = [{ name: line, count: 1 }]
  let m = /^(\d{1,3})\s*[x×]?\s+(.+)$/i.exec(line) ?? /^(\d{1,3})\s*[x×]\s*(.+)$/i.exec(line)
  if (m) out.push({ name: m[2]!, count: Number(m[1]) })
  m = /^(.+?)\s*[x×]\s*(\d{1,3})$/i.exec(line)
  if (m) out.push({ name: m[1]!, count: Number(m[2]) })
  return out
}

export function parseTextList(text: string, index: CardIndex): TextListResult {
  const result: TextListResult = { matched: [], ambiguous: [], unmatched: [] }
  let section: DeckSection | undefined
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//') || line.startsWith('#') || line.startsWith('!')) continue
    const header = SECTION_HEADERS[normalizeName(line.replace(/[:(].*$/, ''))]
    if (header && !/^\d/.test(line)) { section = header; continue }

    const interps = interpretations(line)
    const emit = (found: Found, count: number): boolean => {
      if (found.kind === 'one') result.matched.push({ line, card: found.card, count, section, fuzzy: found.fuzzy })
      else if (found.kind === 'many') result.ambiguous.push({ line, count, section, candidates: found.cards })
      else return false
      return true
    }
    let done = false
    for (const it of interps) {
      const f = exact(it.name, index)
      if (f.kind !== 'none') { done = emit(f, it.count); break }
    }
    if (done) continue
    const parsed = interps[interps.length - 1]!
    const best = interps.length > 1 ? parsed : interps[0]!
    if (!emit(tolerant(best.name, index), best.count)) result.unmatched.push({ line, count: best.count, section })
  }
  return result
}

/** Costruisce DeckLists dai match (le ambigue/non trovate sono escluse). Senza sezione esplicita: Extra se isExtra, altrimenti Main. */
export function textResultToDeck(r: TextListResult): DeckLists {
  const deck: DeckLists = { main: [], extra: [], side: [] }
  for (const m of r.matched) {
    const s = m.section ?? (m.card.isExtra ? 'extra' : 'main')
    for (let i = 0; i < m.count; i++) deck[s].push(m.card.id)
  }
  return deck
}
