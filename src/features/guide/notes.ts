/**
 * Note dei passi con carte inline (`@Ash`, `@[Nome completo]`, `@u3`, `@14558127`): puro, nessun React.
 * Spec: docs/ROADMAP.md fase 3, "Note con carte inline".
 */
import { normalizeName } from '@/domain/deck/cardIndex'
import type { ComboDoc } from '@/domain/combo/types'

export type NoteSeg = { t: 'text'; s: string } | { t: 'card'; code: number; raw: string }

export interface NoteResolver {
  /** uid del documento ("u3", "o1") → passcode */
  byUid(uid: string): number | undefined
  /** passcode noto al documento? */
  hasCode(code: number): boolean
  /** Passcode della carta il cui nome (IT o EN) inizia con `normalized` (già normalizzato); esatto ha la precedenza. */
  byNamePrefix(normalized: string): number | undefined
}

/** Costruisce un resolver sulle carte citate dal documento (registro + mazzo). `namesOf` restituisce i nomi (IT/EN) di un passcode. */
export function makeNoteResolver(doc: Pick<ComboDoc, 'cards' | 'deck'>, namesOf: (code: number) => string[]): NoteResolver {
  const codes = new Set<number>([...Object.values(doc.cards), ...doc.deck.main, ...doc.deck.extra, ...doc.deck.side])
  const entries: { n: string; code: number }[] = []
  for (const code of codes) for (const name of namesOf(code)) if (name) entries.push({ n: normalizeName(name), code })
  return makeResolverFromEntries(doc.cards, codes, entries)
}

export function makeResolverFromEntries(cards: Record<string, number>, codes: ReadonlySet<number>, entries: { n: string; code: number }[]): NoteResolver {
  return {
    byUid: (uid) => cards[uid],
    hasCode: (code) => codes.has(code),
    byNamePrefix(normalized) {
      if (!normalized) return undefined
      const exact = entries.find((e) => e.n === normalized)
      if (exact) return exact.code
      // prefisso su confine di parola
      return entries.find((e) => e.n.startsWith(normalized + ' '))?.code
    },
  }
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’&-]*/gu
const MAX_WORDS = 8

/** Spezza il testo in segmenti di testo e carte. Ciò che non si risolve resta testo (con la `@`). */
export function parseNote(text: string, r: NoteResolver): NoteSeg[] {
  const out: NoteSeg[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', s: buf })
    buf = ''
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (ch !== '@') {
      buf += ch
      i++
      continue
    }
    const rest = text.slice(i + 1)
    // @[Nome completo]
    const br = /^\[([^\]\n]+)\]/.exec(rest)
    if (br) {
      const code = r.byNamePrefix(normalizeName(br[1]!))
      if (code !== undefined) {
        flush()
        out.push({ t: 'card', code, raw: br[0] })
        i += 1 + br[0].length
        continue
      }
    }
    // @u3 / @o1
    const uid = /^[uo]\d+\b/.exec(rest)
    if (uid) {
      const code = r.byUid(uid[0])
      if (code !== undefined) {
        flush()
        out.push({ t: 'card', code, raw: uid[0] })
        i += 1 + uid[0].length
        continue
      }
    }
    // @14558127
    const num = /^\d{5,10}\b/.exec(rest)
    if (num && r.hasCode(Number(num[0]))) {
      flush()
      out.push({ t: 'card', code: Number(num[0]), raw: num[0] })
      i += 1 + num[0].length
      continue
    }
    // @Ash Blossom: sequenza di parole più lunga che è prefisso del nome di una carta
    const words: { end: number; text: string }[] = []
    WORD.lastIndex = 0
    let m: RegExpExecArray | null
    let prevEnd = 0
    while (words.length < MAX_WORDS && (m = WORD.exec(rest))) {
      if (words.length > 0 && !/^[ \t]+$/.test(rest.slice(prevEnd, m.index))) break // solo spazi tra le parole
      if (words.length === 0 && m.index !== 0) break
      prevEnd = m.index + m[0].length
      words.push({ end: prevEnd, text: m[0] })
    }
    let hit: { code: number; end: number } | undefined
    for (let k = words.length; k >= 1; k--) {
      const run = rest.slice(0, words[k - 1]!.end)
      const code = r.byNamePrefix(normalizeName(run))
      if (code !== undefined) {
        hit = { code, end: words[k - 1]!.end }
        break
      }
    }
    if (hit) {
      flush()
      out.push({ t: 'card', code: hit.code, raw: rest.slice(0, hit.end) })
      i += 1 + hit.end
      continue
    }
    buf += ch
    i++
  }
  flush()
  return out
}

/** Testo semplice con i riferimenti resi come nome nella lingua scelta. */
export function noteToPlain(segs: readonly NoteSeg[], nameOf: (code: number) => string): string {
  return segs.map((s) => (s.t === 'text' ? s.s : nameOf(s.code))).join('')
}
