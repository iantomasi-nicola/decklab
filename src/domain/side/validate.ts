import type { Banlist, DeckLists, LegalityIssue, Rules } from '../types'
import type { CardIndex } from '../deck/cardIndex'
import { checkDeck, MAIN_MAX, MAIN_MIN, SIDE_MAX } from '../legality/checkDeck'
import { applySidePlan, countByCanonical, normalizeCounts, totalCount } from './apply'
import type { SideIssue, SidePlanData, SideValidation } from './types'

export interface ValidateContext {
  rules: Rules
  /** Senza banlist si salta solo il controllo di legalità (il resto resta valido). */
  banlist?: Banlist
  index: CardIndex
}

const issueKey = (i: LegalityIssue): string => `${i.code}|${i.cardId ?? ''}|${JSON.stringify(i.params)}`

/**
 * Controlla un piano: in = out, carte realmente presenti (Main per le OUT, Side per le IN), Main 40-60 dopo gli scambi,
 * Side ≤ 15, max 3 copie per carta canonica (alias inclusi), banlist/formato. I problemi che il mazzo base aveva già
 * non vengono attribuiti al piano.
 */
export function validateSidePlan(deck: DeckLists, plan: Pick<SidePlanData, 'outs' | 'ins'>, ctx: ValidateContext): SideValidation {
  const canonical = (id: number) => ctx.index.canonicalId(id)
  const outs = normalizeCounts(plan.outs)
  const ins = normalizeCounts(plan.ins)
  const outCount = totalCount(outs)
  const inCount = totalCount(ins)
  const issues: SideIssue[] = []

  if (outCount === 0 && inCount === 0) issues.push({ code: 'empty', severity: 'warning', params: {} })

  if (inCount !== outCount) {
    issues.push({
      code: 'unbalanced',
      severity: 'error',
      params: inCount > outCount ? { missing: inCount - outCount, side: 'out' } : { missing: outCount - inCount, side: 'in' },
    })
  }

  const mainHave = countByCanonical(deck.main, canonical)
  const sideHave = countByCanonical(deck.side, canonical)
  for (const o of outs) {
    const have = mainHave.get(o.cardId) ?? 0
    if (o.count > have) issues.push({ code: 'out-unavailable', severity: 'error', cardId: o.cardId, params: { want: o.count, have } })
  }
  for (const i of ins) {
    const have = sideHave.get(i.cardId) ?? 0
    if (i.count > have) issues.push({ code: 'in-unavailable', severity: 'error', cardId: i.cardId, params: { want: i.count, have } })
  }

  const after = applySidePlan(deck, { outs, ins }, canonical)
  if (after.main.length < MAIN_MIN || after.main.length > MAIN_MAX)
    issues.push({ code: 'main-size', severity: 'error', params: { count: after.main.length, min: MAIN_MIN, max: MAIN_MAX } })
  if (after.side.length > SIDE_MAX) issues.push({ code: 'side-size', severity: 'error', params: { count: after.side.length, max: SIDE_MAX } })

  for (const [cardId, n] of countByCanonical(after.main, canonical)) {
    if (n > 3) issues.push({ code: 'too-many-copies', severity: 'error', cardId, params: { count: n, max: 3 } })
  }

  if (ctx.banlist) {
    const before = new Set(checkDeck(deck, ctx.banlist, ctx.rules, ctx.index).map(issueKey))
    for (const li of checkDeck(after, ctx.banlist, ctx.rules, ctx.index)) {
      if (before.has(issueKey(li)) || li.code === 'main-size' || li.code === 'side-size' || li.code === 'too-many-copies') continue
      issues.push({ code: 'legality', severity: li.severity, ...(li.cardId !== undefined ? { cardId: li.cardId } : {}), params: { legalityCode: li.code, ...li.params } })
    }
  }

  return {
    issues,
    summary: { outCount, inCount, mainAfter: after.main.length, sideAfter: after.side.length, balanced: inCount === outCount },
    ok: issues.every((i) => i.severity !== 'error') && outCount + inCount > 0,
  }
}
