import type { DeckLists } from '../types'
import { countByCanonical, type Canonical } from './apply'
import type { SideCount, SideMatchup } from './types'

/**
 * Suggerimenti SMART. Non inventano nulla: usano solo i ruoli/tag già assegnati alle carte nello Stats Lab
 * (S1/C2/C3/NS/NE/GARNET e tag liberi) e il Side che l'utente ha costruito.
 *
 * Tag riconosciuti (maiuscole/spazi/trattini ignorati):
 * - `handtrap` / `ht`            carta di interazione: candidata IN dal Side (meglio ancora se si gioca per primo)
 * - `breaker` / `bb` / `removal` rompe-board: candidata IN, soprattutto se si gioca per secondo
 * - `ne` / `nonengine`           non-engine: IN se è nel Side; se è nel Main è la prima carta da tagliare
 * - `anti:<nome>` / `vs:<nome>` / `<nome>` (carta nel Side) utile contro quell'archetipo o matchup
 * - `out:<nome>` / `dead:<nome>` (carta nel Main) morta contro quell'archetipo o matchup
 * - carta nel Main con brick su sé stessa (partner "brick" = sé stessa nello Stats Lab) candidata OUT
 */
export interface CardRole {
  tags: readonly string[]
  /** La carta fa brick con sé stessa (partner "brick" contiene il suo stesso passcode). */
  selfBrick?: boolean
}

export type SuggestReason = 'anti' | 'handtrap' | 'breaker' | 'nonEngine' | 'dead' | 'brick'
export type SuggestedSwap = SideCount & { reason: SuggestReason }

export interface SuggestContext {
  deck: DeckLists
  canonical: Canonical
  matchup: Pick<SideMatchup, 'name' | 'archetype' | 'turn'>
  /** Ruoli per passcode canonico. */
  roles: ReadonlyMap<number, CardRole>
}

export interface Suggestion {
  outs: SuggestedSwap[]
  ins: SuggestedSwap[]
  /** Candidati trovati ma senza controparte (es. 4 IN ma solo 2 OUT): da completare a mano. */
  unmatched: { ins: number; outs: number }
  /** Perché non c'è nulla da proporre. */
  empty: null | 'no-roles' | 'no-in' | 'no-out'
}

const ENGINE = new Set(['s1', 'c2', 'c3', 'garnet'])
const HT = new Set(['handtrap', 'ht'])
const BREAKER = new Set(['breaker', 'bb', 'removal', 'boardbreaker'])
const NE = new Set(['ne', 'nonengine'])

export const normTag = (s: string): string => s.toLowerCase().replace(/\s+/g, '').replace(/[-_.]/g, '')

function targetMatches(target: string, keys: readonly string[]): boolean {
  const t = normTag(target)
  if (!t) return false
  return keys.some((k) => k === t || (t.length >= 3 && k.includes(t)) || (k.length >= 3 && t.includes(k)))
}

interface Cand {
  cardId: number
  score: number
  reason: SuggestReason
  max: number
}

const prefixed = (tag: string, prefixes: readonly string[]): string | null => {
  const n = normTag(tag)
  for (const p of prefixes) if (n.startsWith(`${p}:`)) return n.slice(p.length + 1)
  return null
}

const MAX_SWAPS = 15

export function suggestSwaps(ctx: SuggestContext): Suggestion {
  const keys = [ctx.matchup.archetype, ctx.matchup.name].map((s) => normTag(s ?? '')).filter(Boolean)
  const mainCount = countByCanonical(ctx.deck.main, ctx.canonical)
  const sideCount = countByCanonical(ctx.deck.side, ctx.canonical)
  const second = ctx.matchup.turn === 'second'

  const isAnti = (tags: readonly string[]) =>
    tags.some((t) => {
      const target = prefixed(t, ['anti', 'vs'])
      return target !== null ? targetMatches(target, keys) : !t.includes(':') && keys.length > 0 && targetMatches(t, keys) && !HT.has(normTag(t)) && !BREAKER.has(normTag(t)) && !NE.has(normTag(t)) && !ENGINE.has(normTag(t))
    })
  const isDead = (tags: readonly string[]) =>
    tags.some((t) => {
      const target = prefixed(t, ['out', 'dead'])
      return target !== null && targetMatches(target, keys)
    })

  let anyRole = false
  const ins: Cand[] = []
  for (const [cardId, have] of sideCount) {
    const role = ctx.roles.get(cardId)
    if (!role || !role.tags.length) continue
    anyRole = true
    const tags = role.tags
    const norm = tags.map(normTag)
    const offers: Cand[] = []
    const max = Math.min(have, Math.max(0, 3 - (mainCount.get(cardId) ?? 0)))
    const offer = (score: number, reason: SuggestReason) => offers.push({ cardId, score, reason, max })
    if (isAnti(tags)) offer(100, 'anti')
    if (norm.some((t) => HT.has(t))) offer(second ? 40 : 45, 'handtrap')
    if (norm.some((t) => BREAKER.has(t))) offer(second ? 60 : 15, 'breaker')
    if (norm.some((t) => NE.has(t))) offer(20, 'nonEngine')
    const best = offers.sort((a, b) => b.score - a.score)[0]
    if (best && best.max > 0) ins.push(best)
  }

  const outs: Cand[] = []
  for (const [cardId, have] of mainCount) {
    const role = ctx.roles.get(cardId)
    if (!role) continue
    const tags = role.tags
    if (tags.length) anyRole = true
    const norm = tags.map(normTag)
    if (isDead(tags)) {
      outs.push({ cardId, score: 100, reason: 'dead', max: have })
      continue
    }
    if (isAnti(tags) || norm.some((t) => ENGINE.has(t))) continue
    if (role.selfBrick) outs.push({ cardId, score: 60, reason: 'brick', max: 1 })
    else if (norm.some((t) => NE.has(t) || HT.has(t))) outs.push({ cardId, score: 30, reason: 'nonEngine', max: 1 })
  }

  const byScore = (a: Cand, b: Cand) => b.score - a.score
  ins.sort(byScore)
  outs.sort(byScore)
  const inTotal = ins.reduce((n, c) => n + c.max, 0)
  const outTotal = outs.reduce((n, c) => n + c.max, 0)
  const n = Math.min(inTotal, outTotal, MAX_SWAPS)

  const pick = (cands: Cand[]): SuggestedSwap[] => {
    const res: SuggestedSwap[] = []
    let left = n
    for (const c of cands) {
      if (left <= 0) break
      const take = Math.min(c.max, left)
      res.push({ cardId: c.cardId, count: take, reason: c.reason })
      left -= take
    }
    return res
  }

  const empty: Suggestion['empty'] = n > 0 ? null : !anyRole ? 'no-roles' : inTotal === 0 ? 'no-in' : 'no-out'
  return { outs: pick(outs), ins: pick(ins), unmatched: { ins: Math.max(0, inTotal - n), outs: Math.max(0, outTotal - n) }, empty }
}
