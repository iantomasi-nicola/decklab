import { allStates, moveMismatch } from '@/domain/combo/state'
import { validateCombo } from '@/domain/combo/validate'
import type { ComboDoc } from '@/domain/combo/types'

/** Passi della linea principale che non tornano più con lo stato (mosse da dove la carta non è, errori di validazione). Indice → motivi. */
export function incoherentSteps(doc: ComboDoc): Map<number, string[]> {
  const out = new Map<number, string[]>()
  const add = (i: number, why: string) => out.set(i, [...(out.get(i) ?? []), why])
  const { main } = allStates(doc)
  doc.steps.forEach((s, i) => {
    const before = main[i]
    if (!before) return
    for (const m of s.moves) {
      const r = moveMismatch(before, m)
      if (r) add(i, r)
    }
  })
  const res = validateCombo(doc)
  for (const issue of [...res.errors, ...res.warnings]) {
    if (issue.path[0] === 'steps' && typeof issue.path[1] === 'number' && issue.rule !== 'V9') add(issue.path[1], issue.code)
  }
  return out
}
