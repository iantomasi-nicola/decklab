import type { Card, DeckLists } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'

/** Bit del campo `type` (cards.cdb / EDOPro). */
export const T = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  FUSION: 0x40,
  SYNCHRO: 0x2000,
  XYZ: 0x800000,
  PENDULUM: 0x1000000,
  LINK: 0x4000000,
} as const

export const ATTRIBUTES = [
  ['earth', 0x1],
  ['water', 0x2],
  ['fire', 0x4],
  ['wind', 0x8],
  ['light', 0x10],
  ['dark', 0x20],
  ['divine', 0x40],
] as const
export type AttributeKey = (typeof ATTRIBUTES)[number][0]

export type Kind = 'monster' | 'spell' | 'trap'
export const kindOf = (c: Pick<Card, 'type'>): Kind => (c.type & T.SPELL ? 'spell' : c.type & T.TRAP ? 'trap' : 'monster')

export type ExtraKind = 'fusion' | 'synchro' | 'xyz' | 'link'
export const extraKindOf = (c: Pick<Card, 'type'>): ExtraKind =>
  c.type & T.LINK ? 'link' : c.type & T.XYZ ? 'xyz' : c.type & T.SYNCHRO ? 'synchro' : 'fusion'

/** Livello/rango/link: il campo `level` può contenere la scala Pendulum nei byte alti. */
export const levelOf = (c: Pick<Card, 'level'>): number => c.level & 0xff

export interface DeckStats {
  total: number
  unknown: number
  kinds: Record<Kind, number>
  extraKinds: Record<ExtraKind, number>
  levels: Record<number, number>
  ranks: Record<number, number>
  links: Record<number, number>
  attributes: Partial<Record<AttributeKey, number>>
}

const bump = (r: Record<number, number>, k: number) => {
  r[k] = (r[k] ?? 0) + 1
}

/** Statistiche essenziali di Main + Extra (il Side non conta nella composizione). */
export function computeStats(deck: DeckLists, index: CardIndex): DeckStats {
  const s: DeckStats = {
    total: 0,
    unknown: 0,
    kinds: { monster: 0, spell: 0, trap: 0 },
    extraKinds: { fusion: 0, synchro: 0, xyz: 0, link: 0 },
    levels: {},
    ranks: {},
    links: {},
    attributes: {},
  }
  for (const id of [...deck.main, ...deck.extra]) {
    const c = index.byId(id)
    if (!c) {
      s.unknown++
      continue
    }
    s.total++
    const kind = kindOf(c)
    s.kinds[kind]++
    if (kind !== 'monster') continue
    const lv = levelOf(c)
    if (c.isExtra) {
      const ek = extraKindOf(c)
      s.extraKinds[ek]++
      if (ek === 'xyz') bump(s.ranks, lv)
      else if (ek === 'link') bump(s.links, lv)
      else bump(s.levels, lv)
    } else bump(s.levels, lv)
    const attr = ATTRIBUTES.find(([, bit]) => c.attribute & bit)
    if (attr) s.attributes[attr[0]] = (s.attributes[attr[0]] ?? 0) + 1
  }
  return s
}
