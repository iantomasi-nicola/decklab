import { collectRules, effectiveLabelFrom, mergeCards } from './hand'
import type { HandInput, Label } from './types'

/** Etichetta "automatica" di un insieme (senza override manuali): da ruoli, partner, combo salvate e sottoinsiemi. */
export function derivedLabel(input: HandInput, ids: readonly number[], handSize = 6): Label {
  return effectiveLabelFrom(collectRules({ ...input, labels: {} }, handSize, false), {}, ids)
}

/** Etichetta effettiva: l'override manuale sull'insieme esatto vince sempre. */
export function effectiveLabel(input: HandInput, ids: readonly number[], handSize = 6): Label {
  return effectiveLabelFrom(collectRules({ ...input, labels: {} }, handSize, false), input.labels, ids)
}

export interface LabelTargets {
  pairs: number[][]
  /** Coppie BRICK + una carta C3: l'ipotesi del modello Deckspace per i tris da etichettare. */
  trios: number[][]
}

/**
 * Coppie e tris da rivedere: tutte le coppie tra carte C2/C3 e tutti i tris di carte C2/C3 con almeno una C3 (le carte S1 sono già giocabili da sole),
 * limitati alle copie realmente presenti. Il valore automatico viene dai ruoli; l'utente corregge solo le eccezioni.
 */
export function labelTargets(input: HandInput, handSize = 6): LabelTargets {
  const cards = mergeCards(input.cards).filter((c) => !c.tags.includes('S1') && (c.tags.includes('C2') || c.tags.includes('C3')))
  const multisets = (size: number): number[][] => {
    const out: number[][] = []
    const rec = (start: number, chosen: number[]) => {
      if (chosen.length === size) {
        out.push(chosen.map((i) => cards[i]!.id))
        return
      }
      for (let i = start; i < cards.length; i++) {
        if (chosen.filter((x) => x === i).length >= cards[i]!.count) continue
        rec(i, [...chosen, i])
      }
    }
    rec(0, [])
    return out
  }
  const withC3 = (ids: number[]) => ids.some((id) => cards.find((c) => c.id === id)?.tags.includes('C3'))
  const pairs = multisets(2).filter((p) => handSize >= 2 && p.every((id) => cards.find((c) => c.id === id)?.tags.includes('C2')))
  const trios = handSize >= 3 ? multisets(3).filter(withC3) : []
  return { pairs: pairs.map((p) => [...p].sort((a, b) => a - b)), trios: trios.map((t) => [...t].sort((a, b) => a - b)) }
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
