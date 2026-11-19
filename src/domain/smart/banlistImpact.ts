/** Impatto di una banlist sui passi di una combo + sostituti suggeriti. Logica pura. */
import type { Banlist, Card } from '../types'
import type { ComboDoc, Step, Uid } from '../combo/types'
import type { CardIndex } from '../deck/cardIndex'

export type RestrictionStatus = 'forbidden' | 'limited' | 'semi-limited'
export type UseRole = 'card' | 'target' | 'cost' | 'searched' | 'move' | 'hand'

export interface BanlistHit {
  /** null = carta necessaria in mano (setup) */
  stepId: string | null
  branchId?: string
  uid: Uid
  cardId: number // canonico
  status: RestrictionStatus
  max: number
  /** copie distinte (uid) di questa carta nella combo */
  copies: number
  /** la combo usa più copie di quante ne consenta la banlist */
  excess: boolean
  role: UseRole
}

const STATUS: Record<number, RestrictionStatus> = { 0: 'forbidden', 1: 'limited', 2: 'semi-limited' }

function usesOf(s: Step): [Uid, UseRole][] {
  const out: [Uid, UseRole][] = []
  if (s.card) out.push([s.card, 'card'])
  for (const u of s.targets ?? []) out.push([u, 'target'])
  for (const c of s.costs ?? []) for (const u of c.cards) out.push([u, 'cost'])
  for (const u of s.searched ?? []) out.push([u, 'searched'])
  for (const m of s.moves) out.push([m.uid, 'move'])
  return out
}

export function banlistImpact(doc: ComboDoc, banlist: Banlist, index: CardIndex): BanlistHit[] {
  const canonOf = (uid: Uid): number | undefined => {
    const c = doc.cards[uid]
    return c === undefined ? undefined : index.canonicalId(c)
  }
  const copies = new Map<number, Set<Uid>>()
  for (const uid of Object.keys(doc.cards)) {
    if (uid.startsWith('o')) continue
    const c = canonOf(uid)!
    if (!copies.has(c)) copies.set(c, new Set())
    copies.get(c)!.add(uid)
  }
  const hits: BanlistHit[] = []
  const mk = (stepId: string | null, branchId: string | undefined, uid: Uid, role: UseRole) => {
    if (uid.startsWith('o')) return
    const cardId = canonOf(uid)
    if (cardId === undefined) return
    const max = banlist.limits[cardId]
    if (max === undefined) return
    const n = copies.get(cardId)?.size ?? 1
    hits.push({ stepId, ...(branchId ? { branchId } : {}), uid, cardId, status: STATUS[max]!, max, copies: n, excess: n > max, role })
  }
  for (const uid of doc.setup.hand.required) mk(null, undefined, uid, 'hand')
  const walk = (steps: Step[], branchId?: string) => {
    for (const s of steps) {
      const seen = new Set<Uid>()
      for (const [uid, role] of usesOf(s)) {
        if (seen.has(uid)) continue
        seen.add(uid)
        mk(s.id, branchId, uid, role)
      }
    }
  }
  walk(doc.steps)
  for (const b of doc.branches) walk(b.steps, b.id)
  return hits
}

export interface Replacement { card: Card; score: number }

const KIND_MASK = 0x7 // monstro 0x1, magia 0x2, trappola 0x4

export function suggestReplacements(cardId: number, index: CardIndex, opts: { banlist?: Banlist; limit?: number } = {}): Replacement[] {
  const src = index.byId(index.canonicalId(cardId))
  if (!src) return []
  const seen = new Set<number>()
  const out: Replacement[] = []
  for (const e of index.names()) {
    const c = e.card
    if (seen.has(c.id) || c.id === src.id) continue
    seen.add(c.id)
    if (c.isExtra !== src.isExtra) continue
    if ((c.type & KIND_MASK) !== (src.type & KIND_MASK)) continue
    if (opts.banlist && (opts.banlist.limits[c.id] ?? 3) === 0) continue
    const shared = c.setcodes.filter((s) => src.setcodes.includes(s)).length
    if (src.setcodes.length && shared === 0) continue
    const union = new Set([...c.setcodes, ...src.setcodes]).size
    let score = union ? (shared / union) * 50 : 0
    const sameBits = c.type === src.type ? 20 : popShared(c.type, src.type)
    score += sameBits
    if (c.race === src.race) score += 8
    if (c.attribute === src.attribute) score += 6
    if (c.level === src.level) score += 8
    score += Math.max(0, 8 - Math.abs(c.atk - src.atk) / 500)
    out.push({ card: c, score: Math.round(score * 100) / 100 })
  }
  out.sort((a, b) => b.score - a.score || a.card.id - b.card.id)
  return out.slice(0, opts.limit ?? 10)
}

function popShared(a: number, b: number): number {
  let x = a & b
  let n = 0
  while (x) { n += x & 1; x >>>= 1 }
  return Math.min(n, 5) * 3
}
