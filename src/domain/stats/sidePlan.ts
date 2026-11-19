/**
 * Piani di side: interfaccia usata dallo Stats Lab per il calcolo post-side. I piani li crea la feature "Side plan" (tabella `sidePlans`);
 * qui ci sono il tipo, la conversione in scambi per `deckOverride`, la validazione e il confronto pre/post.
 */
import type { HandExample, HandResult, StatsCard, Swap } from './types'

export interface SidePlan {
  id: string
  variantId: string
  /** Nome del matchup (es. "Snake-Eye"). */
  matchup: string
  /** Carte che escono dal Main. */
  outs: { cardId: number; count: number }[]
  /** Carte che entrano dal Side. */
  ins: { cardId: number; count: number }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function entries(v: unknown): { cardId: number; count: number }[] {
  if (!Array.isArray(v)) return []
  const out: { cardId: number; count: number }[] = []
  for (const e of v) {
    if (!isObj(e)) continue
    const cardId = typeof e.cardId === 'number' ? e.cardId : typeof e.id === 'number' ? e.id : NaN
    const count = typeof e.count === 'number' ? e.count : 1
    if (Number.isFinite(cardId) && count > 0) out.push({ cardId, count: Math.floor(count) })
  }
  return out
}

/** Legge un record della tabella `sidePlans` (forma tollerante: `matchup` stringa o {it,en}); null se non utilizzabile. */
export function normalizeSidePlan(raw: unknown, lang: 'it' | 'en' = 'it'): SidePlan | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.variantId !== 'string') return null
  if (raw.deletedAt) return null
  const m = raw.matchup
  const matchup = typeof m === 'string' ? m : isObj(m) ? String(m[lang] ?? m.en ?? m.it ?? '') : ''
  return { id: raw.id, variantId: raw.variantId, matchup: matchup || '—', outs: entries(raw.outs), ins: entries(raw.ins) }
}

/** Scambi uno a uno per `deckOverride`: le uscite e le entrate si appaiano in ordine; l'eccedenza diventa sola uscita o sola entrata. */
export function planToSwaps(plan: Pick<SidePlan, 'outs' | 'ins'>): Swap[] {
  const expand = (l: { cardId: number; count: number }[]) => l.flatMap((e) => Array<number>(Math.max(0, e.count)).fill(e.cardId))
  const outs = expand(plan.outs)
  const ins = expand(plan.ins)
  const n = Math.max(outs.length, ins.length)
  return Array.from({ length: n }, (_, i) => ({ out: outs[i] ?? 0, in: ins[i] ?? 0 }))
}

export type SidePlanIssue =
  | { code: 'unbalanced'; outs: number; ins: number }
  | { code: 'outNotInMain'; cardId: number }
  | { code: 'tooManyOuts'; cardId: number; have: number; want: number }
  | { code: 'inNotInSide'; cardId: number }

/** Controlli di coerenza: uscite = entrate, le carte in uscita sono nel Main (nelle copie indicate), quelle in entrata nel Side. */
export function validateSidePlan(plan: Pick<SidePlan, 'outs' | 'ins'>, main: readonly { id: number; count: number }[], side: readonly number[]): SidePlanIssue[] {
  const issues: SidePlanIssue[] = []
  const outN = plan.outs.reduce((a, e) => a + e.count, 0)
  const inN = plan.ins.reduce((a, e) => a + e.count, 0)
  if (outN !== inN) issues.push({ code: 'unbalanced', outs: outN, ins: inN })
  const have = new Map(main.map((c) => [c.id, c.count]))
  for (const e of plan.outs) {
    const h = have.get(e.cardId) ?? 0
    if (h === 0) issues.push({ code: 'outNotInMain', cardId: e.cardId })
    else if (e.count > h) issues.push({ code: 'tooManyOuts', cardId: e.cardId, have: h, want: e.count })
  }
  const inSide = new Set(side)
  for (const e of plan.ins) if (!inSide.has(e.cardId)) issues.push({ code: 'inNotInSide', cardId: e.cardId })
  return issues
}

export interface BrickChange {
  cards: HandExample['cards']
  fill: number
  /** null = la mano non è tra le più probabili in quel mazzo. */
  pre: number | null
  post: number | null
}

export interface SideDiff {
  /** Variazioni in punti percentuali (post − pre). */
  dPlayable: number
  dBrick: number
  dUnknown: number
  /** Mani brick più probabili che cambiano, per variazione assoluta decrescente. */
  bricks: BrickChange[]
}

const handKey = (h: Pick<HandExample, 'cards' | 'fill'>) => `${h.cards.map((c) => `${c.id}x${c.n}`).sort().join('+')}|${h.fill}`

/** Confronto pre/post-side: Δ playable%, Δ brick%, Δ da confermare e le mani brick più probabili che cambiano. */
export function diffHands(pre: HandResult, post: HandResult): SideDiff {
  const rows = new Map<string, BrickChange>()
  for (const h of pre.topBricks) rows.set(handKey(h), { cards: h.cards, fill: h.fill, pre: h.p, post: null })
  for (const h of post.topBricks) {
    const r = rows.get(handKey(h))
    if (r) r.post = h.p
    else rows.set(handKey(h), { cards: h.cards, fill: h.fill, pre: null, post: h.p })
  }
  const change = (r: BrickChange) => Math.abs((r.post ?? 0) - (r.pre ?? 0))
  return {
    dPlayable: (post.playable - pre.playable) * 100,
    dBrick: (post.brick - pre.brick) * 100,
    dUnknown: (post.unknown - pre.unknown) * 100,
    bricks: [...rows.values()].filter((r) => change(r) > 1e-9).sort((a, b) => change(b) - change(a)),
  }
}

/** Profilo delle carte che entrano dal Side (ruoli e partner salvati), per `HandInput.pool`. */
export const poolFor = (plan: Pick<SidePlan, 'ins'>, profile: (id: number) => StatsCard): StatsCard[] => [...new Set(plan.ins.map((e) => e.cardId))].map(profile)
