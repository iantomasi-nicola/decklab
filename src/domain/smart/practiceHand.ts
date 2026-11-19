/** Mano di prova e ricerca inversa "cosa posso fare con...". Logica pura. */
import type { ComboDoc } from '../combo/types'
import type { CardIndex } from '../deck/cardIndex'

export type Rng = () => number

/** PRNG riproducibile (mulberry32), valori in [0,1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mescola (Fisher-Yates) e pesca `size` carte dal mazzo; non modifica l'input. `rng` può essere un seed numerico. */
export function drawHand(deck: readonly number[], size: number, rng: Rng | number): { hand: number[]; rest: number[] } {
  const r = typeof rng === 'number' ? mulberry32(rng) : rng
  const a = [...deck]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  const n = Math.max(0, Math.min(size, a.length))
  return { hand: a.slice(0, n), rest: a.slice(n) }
}

export interface ComboMatch {
  doc: ComboDoc
  /** tutte le carte necessarie sono presenti */
  playable: boolean
  /** passcode (canonici se c'è l'indice) richiesti, con molteplicità */
  required: number[]
  matched: number[]
  missing: number[]
  /** 0..1: quota di carte necessarie presenti (1 se nessun requisito) */
  score: number
}

function counts(list: readonly number[], canon: (n: number) => number): Map<number, number> {
  const m = new Map<number, number>()
  for (const c of list) m.set(canon(c), (m.get(canon(c)) ?? 0) + 1)
  return m
}

export function matchCombo(cards: readonly number[], doc: ComboDoc, index?: CardIndex): ComboMatch {
  const canon = (n: number) => index?.canonicalId(n) ?? n
  const have = counts(cards, canon)
  const required = doc.setup.hand.required.map((u) => doc.cards[u]).filter((c): c is number => c !== undefined).map(canon)
  const matched: number[] = []
  const missing: number[] = []
  for (const c of required) {
    const n = have.get(c) ?? 0
    if (n > 0) {
      have.set(c, n - 1)
      matched.push(c)
    } else missing.push(c)
  }
  return { doc, playable: missing.length === 0, required, matched, missing, score: required.length ? matched.length / required.length : 1 }
}

const byRank = (a: ComboMatch, b: ComboMatch) =>
  Number(b.playable) - Number(a.playable) || b.score - a.score || b.required.length - a.required.length ||
  (a.doc.meta.title.en ?? a.doc.meta.title.it ?? '').localeCompare(b.doc.meta.title.en ?? b.doc.meta.title.it ?? '')

/** Per ogni combo: la mano contiene le carte necessarie? Giocabili per prime, poi per punteggio. */
export function playableCombos(hand: readonly number[], combos: readonly ComboDoc[], index?: CardIndex): ComboMatch[] {
  return combos.map((d) => matchCombo(hand, d, index)).sort(byRank)
}

/** Ricerca inversa: combo compatibili con le carte date (complete, poi parziali con carte mancanti). Esclude combo senza requisiti o senza alcuna carta in comune. */
export function whatCanIDo(cards: readonly number[], combos: readonly ComboDoc[], index?: CardIndex): ComboMatch[] {
  return combos.map((d) => matchCombo(cards, d, index)).filter((m) => m.required.length > 0 && m.matched.length > 0).sort(byRank)
}
