import type { Card } from '@/domain/types'

/** Bit del campo `type` (cards.cdb / EDOPro) usati dal campo. */
const T = {
  MONSTER: 0x1,
  SPELL: 0x2,
  TRAP: 0x4,
  FUSION: 0x40,
  RITUAL: 0x80,
  SYNCHRO: 0x2000,
  TOKEN: 0x4000,
  EQUIP: 0x40000,
  FIELD: 0x80000,
  XYZ: 0x800000,
  PENDULUM: 0x1000000,
  LINK: 0x4000000,
} as const

export type ExtraKind = 'fusion' | 'synchro' | 'xyz' | 'link'

/** Cosa serve sapere di una carta per decidere dove può andare. Carta sconosciuta = mostro generico. */
export interface CardInfo {
  kind: 'monster' | 'spell' | 'trap'
  extra: ExtraKind | null
  ritual: boolean
  pendulum: boolean
  field: boolean
  equip: boolean
  token: boolean
  level: number
}

export const UNKNOWN_INFO: CardInfo = {
  kind: 'monster', extra: null, ritual: false, pendulum: false, field: false, equip: false, token: false, level: 0,
}

export function cardInfo(card: Pick<Card, 'type' | 'level'> | undefined): CardInfo {
  if (!card) return UNKNOWN_INFO
  const t = card.type
  const kind = t & T.SPELL ? 'spell' : t & T.TRAP ? 'trap' : 'monster'
  const extra: ExtraKind | null =
    kind !== 'monster' ? null : t & T.LINK ? 'link' : t & T.XYZ ? 'xyz' : t & T.SYNCHRO ? 'synchro' : t & T.FUSION ? 'fusion' : null
  return {
    kind,
    extra,
    ritual: kind === 'monster' && !!(t & T.RITUAL),
    pendulum: kind === 'monster' && !!(t & T.PENDULUM),
    field: kind === 'spell' && !!(t & T.FIELD),
    equip: kind === 'spell' && !!(t & T.EQUIP),
    token: !!(t & T.TOKEN),
    level: card.level & 0xff,
  }
}
