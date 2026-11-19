/** Duello → documento combo: ogni stato del motore sostituisce i passi normalizzati; le carte non citate non si salvano. Puro. */
import type { ComboDoc, Step, Uid } from '@/domain/combo/types'
import type { DuelState } from '@/engine/protocol'

/** Uid citati dal documento (passi, setup, board, mano richiesta). */
export function usedUids(doc: Pick<ComboDoc, 'steps' | 'branches' | 'setup'>): Set<Uid> {
  const s = new Set<Uid>()
  const step = (st: Step) => {
    if (st.card) s.add(st.card)
    for (const m of st.moves) s.add(m.uid)
    for (const u of st.targets ?? []) s.add(u)
    for (const u of st.searched ?? []) s.add(u)
    for (const c of st.costs ?? []) for (const u of c.cards) s.add(u)
    for (const c of st.counters ?? []) s.add(c.uid)
    for (const m of st.moves) if (m.to.host) s.add(m.to.host)
  }
  doc.steps.forEach(step)
  for (const b of doc.branches) b.steps.forEach(step)
  for (const u of doc.setup.hand.required) s.add(u)
  for (const b of [doc.setup.own, doc.setup.opponent?.board]) for (const p of b?.places ?? []) s.add(p.uid)
  return s
}

export function docFromDuel(doc: ComboDoc, d: Pick<DuelState, 'steps' | 'cards' | 'requiredHand'>, engine: ComboDoc['engine'] | null): ComboDoc {
  const required = d.requiredHand
  const next: ComboDoc = {
    ...doc,
    meta: { ...doc.meta, source: 'engine' },
    steps: d.steps,
    branches: doc.branches.filter((b) => d.steps.some((s) => s.id === b.condition.afterStep)),
    setup: { ...doc.setup, hand: { ...doc.setup.hand, required, size: Math.max(doc.setup.hand.size, required.length) } },
    ...(engine ? { engine } : {}),
  }
  const all: Record<Uid, number> = { ...doc.cards, ...d.cards }
  const used = usedUids(next)
  const cards: Record<Uid, number> = {}
  for (const u of used) if (all[u] !== undefined) cards[u] = all[u]!
  return { ...next, cards }
}

/** Mazzo → richiesta di avvio del motore. `order` = permutazione del main (assente = mescolata dal seed). */
export function requestFromDoc(doc: ComboDoc, seed: number, order?: number[]) {
  return {
    deck: { main: doc.deck.main, extra: doc.deck.extra },
    cards: doc.cards,
    setup: doc.setup,
    seed,
    ...(order ? { deckOrder: order } : {}),
  }
}

/** Seed e ordine del mazzo salvati nel blocco `engine` (`seed = [seed, ...ordine]`). */
export function savedSeed(doc: ComboDoc): { seed: number; order?: number[] } | null {
  const e = doc.engine
  if (!e || e.seed.length === 0) return null
  const order = e.seed.slice(1)
  return { seed: e.seed[0]!, ...(order.length === doc.deck.main.length ? { order } : {}) }
}

export const isAutoDoc = (doc: ComboDoc | null): boolean => doc?.x?.playMode === 'auto'
