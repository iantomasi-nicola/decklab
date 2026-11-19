import type { Banlist, LegalityCode, LegalityIssue } from '@/domain/types'

/** Problemi per carta (chiave = id canonico). */
export function issuesByCard(issues: readonly LegalityIssue[]): Map<number, LegalityIssue[]> {
  const m = new Map<number, LegalityIssue[]>()
  for (const i of issues) {
    if (i.cardId === undefined) continue
    const l = m.get(i.cardId)
    if (l) l.push(i)
    else m.set(i.cardId, [i])
  }
  return m
}

/** Chiave i18n del messaggio esteso (sotto `legality.issue.`). */
export function issueKey(i: LegalityIssue): string {
  if (i.code === 'main-size' || i.code === 'extra-size') return i.params.reason ? `${i.code}.${String(i.params.reason)}` : i.code
  return i.code
}

/** Chiave i18n dell'etichetta breve per le carte (sotto `legality.badge.`). */
export function badgeKey(code: LegalityCode): string {
  switch (code) {
    case 'main-size':
    case 'extra-size':
    case 'side-size':
      return 'wrongSection'
    case 'genesys-points':
      return 'points'
    default:
      return code
  }
}

/** Priorità di visualizzazione quando una carta ha più problemi. */
const ORDER: LegalityCode[] = ['forbidden', 'limited', 'semi-limited', 'too-many-copies', 'not-in-format', 'unknown-card', 'main-size', 'extra-size', 'side-size', 'genesys-points']
export const mainIssue = (issues: readonly LegalityIssue[]): LegalityIssue | undefined =>
  [...issues].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code))[0]

/** Limite di copie della banlist per la carta canonica (3 = illimitata). */
export const limitOf = (banlist: Banlist, canonicalId: number): 0 | 1 | 2 | 3 => banlist.limits[canonicalId] ?? 3

/** Etichetta informativa (anche per carte legali): solo se la carta è sulla banlist. */
export function banStatusKey(limit: 0 | 1 | 2 | 3): 'forbidden' | 'limited' | 'semi-limited' | undefined {
  return limit === 0 ? 'forbidden' : limit === 1 ? 'limited' : limit === 2 ? 'semi-limited' : undefined
}

/** Ordina i problemi: prima quelli sulle carte più gravi, poi quelli di dimensione. */
export function sortIssues(issues: readonly LegalityIssue[]): LegalityIssue[] {
  return [...issues].sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code))
}
