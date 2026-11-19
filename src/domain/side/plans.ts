import type { DeckLists } from '../types'
import { countByCanonical, normalizeCounts, type Canonical } from './apply'
import type { SideCount, SideMatchup, SidePlanData, SideTurn } from './types'

export const emptyPlanData = (name: string, turn: SideTurn = 'first', archetype?: string): SidePlanData => ({
  matchup: { name, ...(archetype?.trim() ? { archetype: archetype.trim() } : {}), note: '', turn },
  outs: [],
  ins: [],
})

export const countOf = (list: readonly SideCount[], cardId: number): number => list.find((c) => c.cardId === cardId)?.count ?? 0

/** Imposta le copie di una carta (0 la toglie); `max` è il tetto (copie disponibili). */
export function setCount(list: readonly SideCount[], cardId: number, count: number, max = Infinity): SideCount[] {
  const n = Math.max(0, Math.min(Math.floor(count), max))
  const rest = list.filter((c) => c.cardId !== cardId)
  if (n === 0) return rest
  const idx = list.findIndex((c) => c.cardId === cardId)
  if (idx < 0) return [...rest, { cardId, count: n }]
  const next = [...list]
  next[idx] = { cardId, count: n }
  return next
}

export const adjustCount = (list: readonly SideCount[], cardId: number, delta: number, max = Infinity): SideCount[] =>
  setCount(list, cardId, countOf(list, cardId) + delta, max)

/** Tocco rapido: +1 fino al massimo, poi azzera (un tocco in più "toglie" la carta). */
export function cycleCount(list: readonly SideCount[], cardId: number, max: number): SideCount[] {
  const cur = countOf(list, cardId)
  return setCount(list, cardId, cur >= max ? 0 : cur + 1, max)
}

/** Copia del piano (nuovi dati, stessi scambi); `turn` opzionale per "duplica per l'altro turno". */
export function duplicatePlanData(plan: SidePlanData, opts: { name?: string; turn?: SideTurn } = {}): SidePlanData {
  const matchup: SideMatchup = { ...plan.matchup, ...(opts.name !== undefined ? { name: opts.name } : {}), ...(opts.turn ? { turn: opts.turn } : {}) }
  return { matchup, outs: plan.outs.map((c) => ({ ...c })), ins: plan.ins.map((c) => ({ ...c })) }
}

export const otherTurn = (t: SideTurn): SideTurn => (t === 'first' ? 'second' : 'first')

/** Toglie dagli scambi le carte (o le copie) che nel mazzo attuale non ci sono più: serve dopo aver copiato un piano o modificato il mazzo. */
export function clampToDeck(plan: Pick<SidePlanData, 'outs' | 'ins'>, deck: DeckLists, canonical: Canonical): Pick<SidePlanData, 'outs' | 'ins'> {
  const main = countByCanonical(deck.main, canonical)
  const side = countByCanonical(deck.side, canonical)
  const fit = (list: readonly SideCount[], have: Map<number, number>) =>
    normalizeCounts(list)
      .map((c) => ({ cardId: c.cardId, count: Math.min(c.count, have.get(c.cardId) ?? 0) }))
      .filter((c) => c.count > 0)
  return { outs: fit(plan.outs, main), ins: fit(plan.ins, side) }
}
