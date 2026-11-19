import type { PlayerIdx, Uid } from '@/domain/combo/types'

/** Carta scelta come origine: un'istanza già nello stato oppure una carta ancora nel Deck/Extra (l'uid nasce al salvataggio). */
export type Sel =
  | { kind: 'uid'; uid: Uid }
  | { kind: 'fresh'; p: PlayerIdx; loc: 'deck' | 'extra'; code: number }
