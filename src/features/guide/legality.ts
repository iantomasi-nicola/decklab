/** Legalità della combo con la banlist ATTUALE (l'ultima del formato), ricalcolata ogni volta (puro). */
import type { ComboDoc } from '@/domain/combo/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { checkDeck } from '@/domain/legality/checkDeck'
import type { Banlist, LegalityIssue } from '@/domain/types'

export type Legality =
  | { kind: 'loading' }
  | { kind: 'noDeck' }
  | { kind: 'legal'; banlist: string; missing: boolean }
  | { kind: 'illegal'; banlist: string; missing: boolean; issues: LegalityIssue[] }

const cmp = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

/** Ultima banlist del formato (id più alto). */
export const latestOf = (banlists: readonly Banlist[], format: Banlist['format']): Banlist | undefined =>
  banlists.filter((b) => b.format === format).sort((a, b) => cmp(b.id, a.id))[0]

export function legalityOf(doc: ComboDoc, data: { index: CardIndex; banlists: readonly Banlist[] } | null): Legality {
  if (!data) return { kind: 'loading' }
  if (doc.deck.main.length === 0 && doc.deck.extra.length === 0) return { kind: 'noDeck' }
  const latest = latestOf(data.banlists, doc.meta.rules)
  const missing = !latest
  const banlist: Banlist = latest ?? { format: doc.meta.rules, id: '', limits: {} }
  const label = `${banlist.format}${banlist.id ? ` ${banlist.id}` : ''}`
  const issues = checkDeck(doc.deck, banlist, doc.meta.rules, data.index)
  return issues.length === 0 ? { kind: 'legal', banlist: label, missing } : { kind: 'illegal', banlist: label, missing, issues }
}

/** Carte (id canonico) con limiti di copie violati: servono a marcare i passi interessati. */
export const limitedCards = (issues: readonly LegalityIssue[]): Set<number> =>
  new Set(issues.filter((i) => i.cardId !== undefined && ['forbidden', 'limited', 'semi-limited', 'too-many-copies'].includes(i.code)).map((i) => i.cardId!))
