import { computeHand, mergeCards } from './hand'
import type { HandInput, SensitivityItem } from './types'

export const MAX_COPIES = 3

const withCount = (input: HandInput, id: number, count: number): HandInput => ({
  ...input,
  cards: mergeCards(input.cards).map((c) => (c.id === id ? { ...c, count } : c)),
})

/** Passi di calcolo che `sensitivity` eseguirà (per la barra di avanzamento). */
export function sensitivitySteps(input: HandInput): number {
  return mergeCards(input.cards).length * 2 + 3
}

/**
 * Cosa succede se aggiungo/tolgo una copia: variazione di playable% (punti percentuali). La variazione di brick% è l'opposto,
 * perché ogni mano è PLAYABLE o BRICK. Con un mazzo ipotetico la copia tolta/aggiunta cambia le carte vuote; senza, la dimensione del mazzo.
 * La voce `id 0` è una carta di riempimento qualunque (non-engine) in più o in meno.
 */
export function sensitivity(input: HandInput, handSize: number, onStep?: () => void): SensitivityItem[] {
  const cards = mergeCards(input.cards)
  const base = computeHand(input, handSize).playable
  const out: SensitivityItem[] = []
  const delta = (next: HandInput) => {
    const d = (computeHand(next, handSize).playable - base) * 100
    onStep?.()
    return d
  }
  for (const c of cards) {
    const minus = delta(withCount(input, c.id, c.count - 1))
    const plus = c.count < MAX_COPIES ? delta(withCount(input, c.id, c.count + 1)) : (onStep?.(), null)
    out.push({ id: c.id, count: c.count, minus, plus })
  }
  // riempimento generico: +1 carta non-engine (id sintetico negativo, nessun ruolo)
  const FILL = -1
  const plusFill = delta({ ...input, cards: [...cards, { id: FILL, count: 1, tags: [] }] })
  const filler = cards.find((c) => !c.tags.length)
  const minusFill = filler ? delta(withCount(input, filler.id, filler.count - 1)) : null
  out.push({ id: 0, count: 0, minus: minusFill, plus: plusFill })
  onStep?.()
  return out.sort((a, b) => impact(b) - impact(a))
}

const impact = (s: SensitivityItem) => Math.max(Math.abs(s.minus ?? 0), Math.abs(s.plus ?? 0))
