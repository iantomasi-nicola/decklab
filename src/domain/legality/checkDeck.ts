import type { Banlist, DeckLists, LegalityIssue, Rules } from '../types'
import type { CardIndex } from '../deck/cardIndex'

export const MAIN_MIN = 40
export const MAIN_MAX = 60
export const EXTRA_MAX = 15
export const SIDE_MAX = 15

/**
 * Controlla la legalità di un deck. Le copie si contano su main+extra+side per canonicalId (alias = stessa carta).
 * Punti Genesys: sommati su main+extra+side (assunzione da verificare sulla regola ufficiale, vedi ARCHITECTURE §4.3).
 */
export function checkDeck(deck: DeckLists, banlist: Banlist, rules: Rules, index: CardIndex): LegalityIssue[] {
  const issues: LegalityIssue[] = []
  const counts = new Map<number, number>()
  const unknown = new Set<number>()

  const sections = [
    ['main', deck.main],
    ['extra', deck.extra],
    ['side', deck.side],
  ] as const

  for (const [section, list] of sections) {
    const misplaced = new Set<number>()
    for (const id of list) {
      const card = index.byId(id)
      if (!card) {
        if (!unknown.has(id)) {
          unknown.add(id)
          issues.push({ code: 'unknown-card', severity: 'error', cardId: id, params: { id } })
        }
        continue
      }
      const canon = index.canonicalId(id)
      counts.set(canon, (counts.get(canon) ?? 0) + 1)
      if (section === 'main' && card.isExtra && !misplaced.has(canon)) {
        misplaced.add(canon)
        issues.push({ code: 'main-size', severity: 'error', cardId: canon, params: { reason: 'extra-card-in-main' } })
      } else if (section === 'extra' && !card.isExtra && !misplaced.has(canon)) {
        misplaced.add(canon)
        issues.push({ code: 'extra-size', severity: 'error', cardId: canon, params: { reason: 'non-extra-card-in-extra' } })
      }
    }
  }

  if (deck.main.length < MAIN_MIN || deck.main.length > MAIN_MAX)
    issues.push({ code: 'main-size', severity: 'error', params: { count: deck.main.length, min: MAIN_MIN, max: MAIN_MAX } })
  if (deck.extra.length > EXTRA_MAX)
    issues.push({ code: 'extra-size', severity: 'error', params: { count: deck.extra.length, min: 0, max: EXTRA_MAX } })
  if (deck.side.length > SIDE_MAX)
    issues.push({ code: 'side-size', severity: 'error', params: { count: deck.side.length, min: 0, max: SIDE_MAX } })

  for (const [canon, count] of counts) {
    const limit = banlist.limits[canon] ?? 3
    if (count > limit) {
      if (limit === 0) issues.push({ code: 'forbidden', severity: 'error', cardId: canon, params: { count, max: 0 } })
      else if (limit === 1) issues.push({ code: 'limited', severity: 'error', cardId: canon, params: { count, max: 1 } })
      else if (limit === 2) issues.push({ code: 'semi-limited', severity: 'error', cardId: canon, params: { count, max: 2 } })
      else issues.push({ code: 'too-many-copies', severity: 'error', cardId: canon, params: { count, max: 3 } })
    } else if (count > 3) {
      issues.push({ code: 'too-many-copies', severity: 'error', cardId: canon, params: { count, max: 3 } })
    }
    const card = index.byId(canon)
    if (card && ((rules === 'TCG' && card.tcg === false) || (rules === 'OCG' && card.ocg === false)))
      issues.push({ code: 'not-in-format', severity: 'error', cardId: canon, params: { rules } })
  }

  if (banlist.points && banlist.pointsCap !== undefined) {
    let total = 0
    for (const [canon, count] of counts) total += (banlist.points[canon] ?? 0) * count
    if (total > banlist.pointsCap)
      issues.push({ code: 'genesys-points', severity: 'error', params: { points: total, cap: banlist.pointsCap } })
  }
  return issues
}

export interface LegalityTarget {
  id: string
  kind: 'variant' | 'combo'
  deck: DeckLists
  rules: Rules
}

export interface LegalityDiffEntry {
  id: string
  kind: 'variant' | 'combo'
  /** problemi presenti solo con la nuova banlist */
  newIssues: LegalityIssue[]
  /** problemi presenti solo con la vecchia banlist */
  resolvedIssues: LegalityIssue[]
  wasLegal: boolean
  isLegal: boolean
  /** true se era legale e ora non lo è */
  becameIllegal: boolean
}

const issueKey = (i: LegalityIssue): string => `${i.code}|${i.cardId ?? ''}|${JSON.stringify(i.params)}`

const hasErrors = (l: LegalityIssue[]): boolean => l.some((i) => i.severity === 'error')

/** Confronta la legalità di varianti/combo tra due banlist; restituisce solo le voci che cambiano. */
export function diffLegality(
  prev: Banlist,
  next: Banlist,
  targets: readonly LegalityTarget[],
  index: CardIndex,
): LegalityDiffEntry[] {
  const out: LegalityDiffEntry[] = []
  for (const t of targets) {
    const a = checkDeck(t.deck, prev, t.rules, index)
    const b = checkDeck(t.deck, next, t.rules, index)
    const ka = new Set(a.map(issueKey))
    const kb = new Set(b.map(issueKey))
    const newIssues = b.filter((i) => !ka.has(issueKey(i)))
    const resolvedIssues = a.filter((i) => !kb.has(issueKey(i)))
    if (!newIssues.length && !resolvedIssues.length) continue
    const wasLegal = !hasErrors(a)
    const isLegal = !hasErrors(b)
    out.push({ id: t.id, kind: t.kind, newIssues, resolvedIssues, wasLegal, isLegal, becameIllegal: wasLegal && !isLegal })
  }
  return out
}
