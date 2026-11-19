/** Stato mostrato dal campo in modalità automatica: tutto dal core (campo = `endboard`, pile = `piles`), contatori dai passi. */
import { applyStep, normPlace, type GameState, type NPlace } from '@/domain/combo/state'
import type { Uid } from '@/domain/combo/types'
import type { DuelState } from '@/engine/protocol'
import type { CardRef, PendingRequest } from '@/engine/requests'

/** Tutte le carte citate da una richiesta. */
export function refsOf(req: PendingRequest | null): CardRef[] {
  if (!req) return []
  switch (req.kind) {
    case 'idle': return [...req.summons, ...req.specialSummons, ...req.posChanges, ...req.monsterSets, ...req.spellSets, ...req.activates]
    case 'battle': return [...req.attacks, ...req.chains]
    case 'chain': return req.options
    case 'effectYn': return [req.card]
    case 'cards': return req.options
    case 'unselect': return [...req.selectable, ...req.selected]
    case 'sum': return [...req.mustSelect, ...req.options]
    case 'counter': return req.options
    case 'sort': return req.cards
    default: return []
  }
}

export interface AutoView {
  state: GameState
  registry: Record<Uid, number>
  /** carte del Deck proprio (segnaposto, non elencate) */
  deckCount: number
  handCount: number
  /** passcode del proprio Extra Deck sono in `state.places` (loc 'extra') */
  extraCount: number
}

const EMPTY: GameState = { places: {}, lp: [8000, 8000], counters: {} }

/** Segnalini dai passi normalizzati (il core non li elenca nel campo). */
export function countersOf(steps: DuelState['steps']): GameState['counters'] {
  let s: GameState = EMPTY
  for (const st of steps) if (st.counters?.length) s = applyStep(s, { ...st, moves: [] })
  return s.counters
}

export function viewFromDuel(d: DuelState): AutoView {
  const places: Record<Uid, NPlace> = {}
  for (const p of [0, 1] as const) {
    const piles = d.piles[p]
    for (const list of [piles.hand, piles.gy, piles.banished, piles.extra]) {
      for (const r of list) places[r.uid] = normPlace(r.place, p)
    }
  }
  for (const [board, p] of [[d.endboard.own, 0], [d.endboard.opponent, 1]] as const) {
    for (const bp of board?.places ?? []) places[bp.uid] = normPlace(bp.place, p)
  }
  const registry: Record<Uid, number> = { ...d.cards }
  for (const p of [0, 1] as const) for (const list of [d.piles[p].hand, d.piles[p].gy, d.piles[p].banished, d.piles[p].extra]) for (const r of list) registry[r.uid] = r.code
  return {
    state: { places, lp: [d.lp[0], d.lp[1]], counters: countersOf(d.steps) },
    registry,
    deckCount: d.piles[0].deckCount,
    handCount: d.piles[0].handCount,
    extraCount: d.piles[0].extra.length,
  }
}
