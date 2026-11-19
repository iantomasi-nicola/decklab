import { computeHand, engineIds, mergeCards } from './hand'
import type { HandInput, SensitivityItem } from './types'

export const MAX_COPIES = 3

const withCount = (input: HandInput, id: number, count: number): HandInput => ({
  ...input,
  cards: mergeCards(input.cards).map((c) => (c.id === id ? { ...c, count } : c)),
})

/** Carte che non fanno parte di nessuna combinazione (riempimento): toglierne o aggiungerne una ha lo stesso effetto, qualunque sia. */
function fillIds(input: HandInput): Set<number> {
  const cards = mergeCards(input.cards)
  const engine = new Set(engineIds(cards, input.labels, input.extraRules))
  return new Set(cards.filter((c) => !engine.has(c.id)).map((c) => c.id))
}

/** Calcoli distinti che `sensitivity` eseguirà (per la barra di avanzamento): due per ogni carta engine più i due del riempimento. */
export function sensitivitySteps(input: HandInput): number {
  const cards = mergeCards(input.cards)
  const fill = fillIds(input)
  return cards.filter((c) => !fill.has(c.id)).length * 2 + 3
}

/**
 * Cosa succede se aggiungo/tolgo una copia: variazione di playable% (punti percentuali). La variazione di brick% è l'opposto,
 * perché ogni mano è PLAYABLE o BRICK. Con un mazzo ipotetico la copia tolta/aggiunta cambia le carte vuote; senza, la dimensione del mazzo.
 * Le carte di riempimento (non-engine) si calcolano una volta sola per tutte; la voce `id 0` è "una carta non-engine qualunque".
 * `onItem` riceve ogni voce appena pronta (risultati parziali); `shouldStop` permette di interrompere.
 */
export function sensitivity(input: HandInput, handSize: number, onStep?: () => void, onItem?: (item: SensitivityItem) => void): SensitivityItem[] {
  const cards = mergeCards(input.cards)
  const fill = fillIds(input)
  const base = computeHand(input, handSize).playable
  onStep?.()
  const out: SensitivityItem[] = []
  const push = (item: SensitivityItem) => {
    out.push(item)
    onItem?.(item)
  }
  const delta = (next: HandInput) => {
    const d = (computeHand(next, handSize).playable - base) * 100
    onStep?.()
    return d
  }
  const skip = () => {
    onStep?.()
    return null
  }

  // riempimento: una sola coppia di calcoli per tutte le carte non-engine
  const FILL = -1
  const plusFill = delta({ ...input, cards: [...cards, { id: FILL, count: 1, tags: [] }] })
  const donor = cards.find((c) => fill.has(c.id))
  const minusFill = donor ? delta(withCount(input, donor.id, donor.count - 1)) : skip()

  for (const c of cards) {
    if (fill.has(c.id)) {
      push({ id: c.id, count: c.count, minus: minusFill, plus: c.count < MAX_COPIES ? plusFill : null })
      continue
    }
    const minus = delta(withCount(input, c.id, c.count - 1))
    const plus = c.count < MAX_COPIES ? delta(withCount(input, c.id, c.count + 1)) : skip()
    push({ id: c.id, count: c.count, minus, plus })
  }
  push({ id: 0, count: 0, minus: minusFill, plus: plusFill })
  return sortByImpact(out)
}

export const impact = (s: SensitivityItem): number => Math.max(Math.abs(s.minus ?? 0), Math.abs(s.plus ?? 0))
export const sortByImpact = (items: SensitivityItem[]): SensitivityItem[] => [...items].sort((a, b) => impact(b) - impact(a))
