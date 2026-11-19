import { collectRules, labelKey, mergeCards } from './hand'
import type { HandInput, Label } from './types'

/** Etichetta "automatica" di un insieme (senza override manuali): da ruoli, partner e combo salvate. */
export function derivedLabel(input: HandInput, ids: readonly number[], handSize = 6): Label {
  return collectRules({ ...input, labels: {} }, handSize, false).has(labelKey(ids)) ? 'PLAYABLE' : 'BRICK'
}

/** Etichetta effettiva: l'override manuale vince sempre. */
export function effectiveLabel(input: HandInput, ids: readonly number[], handSize = 6): Label {
  return input.labels[labelKey(ids)] ?? derivedLabel(input, ids, handSize)
}

export interface LabelTargets {
  pairs: number[][]
  /** Coppie BRICK + una carta C3: l'ipotesi del modello Deckspace per i tris da etichettare. */
  trios: number[][]
}

/**
 * Coppie e tris da rivedere: le coppie tra carte C2 (con copie sufficienti) e, per ogni coppia BRICK, ciascuna carta C3 che potrebbe completarla.
 * Sono *suggerimenti*: tutto il resto della mano resta riempimento non-engine.
 */
export function labelTargets(input: HandInput, handSize = 6): LabelTargets {
  const cards = mergeCards(input.cards)
  const c2 = cards.filter((c) => c.tags.includes('C2'))
  const c3 = cards.filter((c) => c.tags.includes('C3'))
  const pairs: number[][] = []
  for (let i = 0; i < c2.length; i++) for (let j = i; j < c2.length; j++) if (i !== j || c2[i]!.count >= 2) pairs.push([c2[i]!.id, c2[j]!.id])
  const count = new Map(cards.map((c) => [c.id, c.count]))
  const seen = new Set<string>()
  const trios: number[][] = []
  for (const p of pairs) {
    if (effectiveLabel(input, p, handSize) !== 'BRICK') continue
    for (const c of c3) {
      const trio = [...p, c.id].sort((a, b) => a - b)
      const need = new Map<number, number>()
      for (const id of trio) need.set(id, (need.get(id) ?? 0) + 1)
      if ([...need].some(([id, n]) => (count.get(id) ?? 0) < n)) continue
      const key = trio.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      trios.push(trio)
    }
  }
  return { pairs, trios }
}

/** Una mano "richiesta" da una combo salvata (`setup.hand.required` + mappa uid → passcode) come regola PLAYABLE. */
export function comboToRule(payload: unknown, canonical: (id: number) => number = (x) => x): number[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as { setup?: { hand?: { required?: unknown } }; cards?: Record<string, unknown> }
  const required = p.setup?.hand?.required
  if (!Array.isArray(required) || !required.length || !p.cards) return null
  const ids: number[] = []
  for (const uid of required) {
    const id = typeof uid === 'string' ? p.cards[uid] : undefined
    if (typeof id !== 'number') return null
    ids.push(canonical(id))
  }
  return ids
}
