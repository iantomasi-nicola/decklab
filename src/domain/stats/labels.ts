import { applyOverride, collectRules, collectUnknownPairs, effectiveLabelFrom, groupsOf, isC2, labelKey, mergeCards } from './hand'
import type { HandInput, Label, LabelState } from './types'

/** Stato "automatico" di un insieme (senza override manuali): da partner, combo salvate, gruppi e sottoinsiemi; UNKNOWN = da confermare. */
export function derivedLabel(input: HandInput, ids: readonly number[], handSize = 6): LabelState {
  const inp = applyOverride(input)
  return effectiveLabelFrom(collectRules({ ...inp, labels: {} }, handSize, false), {}, ids, collectUnknownPairs(inp, handSize, false))
}

/** Stato effettivo: l'override manuale sull'insieme esatto vince sempre. */
export function effectiveLabel(input: HandInput, ids: readonly number[], handSize = 6): LabelState {
  const inp = applyOverride(input)
  return effectiveLabelFrom(collectRules({ ...inp, labels: {} }, handSize, false), inp.labels, ids, collectUnknownPairs(inp, handSize, false))
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
  const cards = mergeCards(applyOverride(input).cards).filter((c) => !c.tags.includes('S1') && (isC2(c) || c.tags.includes('C3')))
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
  const pairs = multisets(2).filter((p) => handSize >= 2 && p.every((id) => { const c = cards.find((x) => x.id === id); return c ? isC2(c) : false }))
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

/**
 * "Deriva dalle combo salvate": trasforma le mani richieste di 2-3 carte in etichette PLAYABLE esplicite (modificabili),
 * senza toccare quelle già decise. Restituisce solo le etichette nuove.
 */
export function labelsFromCombos(input: HandInput, existing: Record<string, Label> = input.labels): Record<string, Label> {
  const inp = applyOverride(input)
  const inDeck = new Map(mergeCards(inp.cards).map((c) => [c.id, c.count]))
  const out: Record<string, Label> = {}
  for (const rule of inp.extraRules ?? []) {
    if (rule.length < 2 || rule.length > 3) continue
    const need = new Map<number, number>()
    for (const id of rule) need.set(id, (need.get(id) ?? 0) + 1)
    if ([...need].some(([id, n]) => (inDeck.get(id) ?? 0) < n)) continue
    const key = labelKey(rule)
    if (!existing[key]) out[key] = 'PLAYABLE'
  }
  return out
}

/** Compatibilità C2 per la matrice: stato effettivo di ogni coppia con l'indicazione della fonte. */
export type PairSource = 'manual' | 'strings' | 'combo' | 'group' | 'none'
export function pairSource(input: HandInput, a: number, b: number, handSize = 6): PairSource {
  const inp = applyOverride(input)
  const key = labelKey([a, b])
  if (inp.labels[key]) return 'manual'
  const cards = mergeCards(inp.cards)
  const ca = cards.find((c) => c.id === a)
  const cb = cards.find((c) => c.id === b)
  if (!ca || !cb) return 'none'
  if ((ca.brickWith ?? []).includes(b) || (cb.brickWith ?? []).includes(a) || (ca.comboWith ?? []).includes(b) || (cb.comboWith ?? []).includes(a)) return 'strings'
  if (collectRules({ ...inp, labels: {}, extraRules: inp.extraRules }, handSize, false).has(key) && (inp.extraRules ?? []).some((r) => labelKey(r) === key)) return 'combo'
  if (groupsOf(ca).some((g) => groupsOf(cb).includes(g))) return 'group'
  return 'none'
}
