import type { DeckLists } from '../types'
import type { SideCount, SidePlanData } from './types'

export type Canonical = (id: number) => number
const identity: Canonical = (id) => id

/** Somma i conteggi per carta, scarta zeri e negativi (ordine di prima comparsa). */
export function normalizeCounts(list: readonly SideCount[]): SideCount[] {
  const m = new Map<number, number>()
  for (const { cardId, count } of list) {
    const n = Math.floor(count)
    if (n > 0) m.set(cardId, (m.get(cardId) ?? 0) + n)
  }
  return [...m].map(([cardId, count]) => ({ cardId, count }))
}

export const totalCount = (list: readonly SideCount[]): number => list.reduce((n, c) => n + Math.max(0, c.count), 0)

/** Copie per carta canonica in una lista di passcode. */
export function countByCanonical(list: readonly number[], canonical: Canonical = identity): Map<number, number> {
  const m = new Map<number, number>()
  for (const id of list) {
    const c = canonical(id)
    m.set(c, (m.get(c) ?? 0) + 1)
  }
  return m
}

/** Toglie fino a `count` copie (dalla fine) di una carta canonica; restituisce la lista rimasta e i passcode tolti. */
function take(list: readonly number[], cardId: number, count: number, canonical: Canonical): { rest: number[]; taken: number[] } {
  const rest = [...list]
  const taken: number[] = []
  for (let i = rest.length - 1; i >= 0 && taken.length < count; i--) {
    if (canonical(rest[i]!) === cardId) taken.push(...rest.splice(i, 1))
  }
  return { rest, taken: taken.reverse() }
}

/** Inserisce i passcode accanto alle copie già presenti della stessa carta (la lista resta raggruppata). */
function insertGrouped(list: number[], ids: readonly number[], canonical: Canonical): number[] {
  const out = [...list]
  for (const id of ids) {
    const c = canonical(id)
    let at = -1
    for (let i = out.length - 1; i >= 0; i--) {
      if (canonical(out[i]!) === c) {
        at = i
        break
      }
    }
    if (at < 0) out.push(id)
    else out.splice(at + 1, 0, id)
  }
  return out
}

/**
 * Mazzo risultante dopo il side: le carte OUT passano dal Main al Side, le IN dal Side al Main.
 * Se una carta non ha abbastanza copie lo scambio viene limitato a quelle disponibili (la validazione lo segnala).
 * L'Extra Deck non cambia.
 */
export function applySidePlan(deck: DeckLists, plan: Pick<SidePlanData, 'outs' | 'ins'>, canonical: Canonical = identity): DeckLists {
  let main = [...deck.main]
  const movedOut: number[] = []
  for (const { cardId, count } of normalizeCounts(plan.outs)) {
    const r = take(main, cardId, count, canonical)
    main = r.rest
    movedOut.push(...r.taken)
  }
  let side = [...deck.side]
  const movedIn: number[] = []
  for (const { cardId, count } of normalizeCounts(plan.ins)) {
    const r = take(side, cardId, count, canonical)
    side = r.rest
    movedIn.push(...r.taken)
  }
  return { main: insertGrouped(main, movedIn, canonical), extra: [...deck.extra], side: insertGrouped(side, movedOut, canonical) }
}

export interface PreviewRow {
  /** Passcode canonico. */
  cardId: number
  /** Passcode da mostrare (primo trovato nel Main o nel Side: l'artwork scelto dall'utente). */
  shownId: number
  /** Copie che restano nel Main. */
  keep: number
  /** Copie che escono. */
  out: number
  /** Copie che entrano. */
  in: number
}

/** Righe per l'anteprima del Main post-side (una per carta), nell'ordine del Main attuale e poi le carte che entrano. */
export function previewRows(deck: DeckLists, plan: Pick<SidePlanData, 'outs' | 'ins'>, canonical: Canonical = identity): PreviewRow[] {
  const rows = new Map<number, PreviewRow>()
  for (const id of deck.main) {
    const c = canonical(id)
    const r = rows.get(c) ?? { cardId: c, shownId: id, keep: 0, out: 0, in: 0 }
    r.keep++
    rows.set(c, r)
  }
  const outs = new Map(normalizeCounts(plan.outs).map((o) => [o.cardId, o.count]))
  for (const [c, n] of outs) {
    const r = rows.get(c)
    if (!r) continue
    const moved = Math.min(n, r.keep)
    r.keep -= moved
    r.out = moved
  }
  const sideCount = countByCanonical(deck.side, canonical)
  for (const { cardId, count } of normalizeCounts(plan.ins)) {
    const have = sideCount.get(cardId) ?? 0
    const n = Math.min(count, have)
    if (n <= 0) continue
    const shown = deck.side.find((id) => canonical(id) === cardId) ?? cardId
    const r = rows.get(cardId) ?? { cardId, shownId: shown, keep: 0, out: 0, in: 0 }
    r.in = n
    rows.set(cardId, r)
  }
  return [...rows.values()]
}
