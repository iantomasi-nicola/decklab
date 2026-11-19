import type { Card } from '../types'
import { ENGINE_ROLES } from './types'

/** Bit del campo `type` (cards.cdb / EDOPro). */
const T = {
  MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80, TUNER: 0x1000, SYNCHRO: 0x2000,
  QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000,
} as const

export const ATTRIBUTE_KEYS = ['earth', 'water', 'fire', 'wind', 'light', 'dark', 'divine'] as const
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number]
const ATTR_BITS: Record<AttributeKey, number> = { earth: 0x1, water: 0x2, fire: 0x4, wind: 0x8, light: 0x10, dark: 0x20, divine: 0x40 }

export type MonsterKind = 'normal' | 'effect' | 'ritual' | 'pendulum' | 'tuner'
export type SpellKind = 'normal' | 'quickplay' | 'continuous' | 'equip' | 'field' | 'ritual'
export type TrapKind = 'normal' | 'continuous' | 'counter'

export interface Composition {
  total: number
  kinds: { monster: number; spell: number; trap: number }
  monsterKinds: Partial<Record<MonsterKind, number>>
  spellKinds: Partial<Record<SpellKind, number>>
  trapKinds: Partial<Record<TrapKind, number>>
  attributes: Partial<Record<AttributeKey, number>>
  /** Livelli dei mostri del Main (non Extra); chiave = livello. */
  levels: Record<number, number>
  /** Copie per ruolo (una carta con più ruoli conta in ciascuno). */
  roles: Record<string, number>
  /** Copie senza alcun ruolo. */
  untagged: number
  /** Carte non trovate nel dataset (non contate nel resto). */
  unknown: number
}

const bump = <K extends string | number>(r: Partial<Record<K, number>>, k: K, n: number) => {
  r[k] = (r[k] ?? 0) + n
}

export interface CompositionEntry {
  card: Card | undefined
  count: number
  tags: readonly string[]
}

/** Composizione del Main: tipi, attributi, livelli, ruoli. */
export function composition(entries: readonly CompositionEntry[]): Composition {
  const c: Composition = {
    total: 0, kinds: { monster: 0, spell: 0, trap: 0 }, monsterKinds: {}, spellKinds: {}, trapKinds: {}, attributes: {}, levels: {}, roles: {}, untagged: 0, unknown: 0,
  }
  for (const { card, count, tags } of entries) {
    if (count <= 0) continue
    if (!tags.length) c.untagged += count
    for (const t of new Set(tags)) bump(c.roles, t, count)
    if (!card) {
      c.unknown += count
      continue
    }
    c.total += count
    const ty = card.type
    if (ty & T.SPELL) {
      c.kinds.spell += count
      bump(c.spellKinds, ty & T.QUICKPLAY ? 'quickplay' : ty & T.CONTINUOUS ? 'continuous' : ty & T.EQUIP ? 'equip' : ty & T.FIELD ? 'field' : ty & T.RITUAL ? 'ritual' : 'normal', count)
    } else if (ty & T.TRAP) {
      c.kinds.trap += count
      bump(c.trapKinds, ty & T.COUNTER ? 'counter' : ty & T.CONTINUOUS ? 'continuous' : 'normal', count)
    } else {
      c.kinds.monster += count
      bump(c.monsterKinds, ty & T.PENDULUM ? 'pendulum' : ty & T.RITUAL ? 'ritual' : ty & T.TUNER ? 'tuner' : ty & T.EFFECT ? 'effect' : 'normal', count)
      for (const k of ATTRIBUTE_KEYS) if (card.attribute & ATTR_BITS[k]) bump(c.attributes, k, count)
      if (!(ty & (T.LINK | T.XYZ | T.SYNCHRO | T.FUSION))) bump(c.levels, card.level & 0xff, count)
    }
  }
  return c
}

export const isEngineRole = (tag: string): boolean => ENGINE_ROLES.includes(tag)
