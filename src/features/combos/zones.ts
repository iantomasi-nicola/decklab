/** Geometria logica del campo: destinazioni, chiavi stringa (id dnd-kit) e occupazione delle zone. */
import type { GameState, NPlace } from '@/domain/combo/state'
import type { Loc, PlayerIdx, Uid } from '@/domain/combo/types'

export type ZoneLoc = 'mzone' | 'emz' | 'szone' | 'fzone'
export type PileLoc = 'gy' | 'banished' | 'hand' | 'deck' | 'extra'

export type Dest =
  | { t: 'zone'; p: PlayerIdx; loc: ZoneLoc; seq: number }
  | { t: 'pile'; p: PlayerIdx; loc: PileLoc }
  | { t: 'card'; uid: Uid }

export const ZONE_COUNT: Record<ZoneLoc, number> = { mzone: 5, emz: 2, szone: 5, fzone: 1 }
/** Le zone Pendulum sono le S/T 0 e 4 (regola corrente). */
export const PENDULUM_SEQS = [0, 4] as const
export const ALL_LOCS: readonly Loc[] = ['deck', 'hand', 'extra', 'gy', 'banished', 'mzone', 'emz', 'szone', 'fzone', 'overlay']

export function destKey(d: Dest): string {
  if (d.t === 'zone') return `z:${d.p}:${d.loc}:${d.seq}`
  if (d.t === 'pile') return `p:${d.p}:${d.loc}`
  return `c:${d.uid}`
}

export function parseDest(key: string): Dest | null {
  const [k, a, b, c] = key.split(':')
  if (k === 'z' && a && b && c !== undefined) return { t: 'zone', p: a === '1' ? 1 : 0, loc: b as ZoneLoc, seq: Number(c) }
  if (k === 'p' && a && b) return { t: 'pile', p: a === '1' ? 1 : 0, loc: b as PileLoc }
  if (k === 'c' && a) return { t: 'card', uid: a }
  return null
}

export function occupantAt(state: GameState, p: PlayerIdx, loc: ZoneLoc, seq: number): Uid | undefined {
  for (const [uid, pl] of Object.entries(state.places)) {
    if (pl.p === p && pl.loc === loc && (loc === 'fzone' ? true : pl.seq === seq)) return uid
  }
  return undefined
}

/** Prima zona libera, nell'ordine dato (di default dall'alto verso il basso). */
export function freeSeq(state: GameState, p: PlayerIdx, loc: ZoneLoc, order?: readonly number[]): number | undefined {
  const seqs = order ?? Array.from({ length: ZONE_COUNT[loc] }, (_, i) => i)
  return seqs.find((s) => occupantAt(state, p, loc, s) === undefined)
}

export function countAt(state: GameState, p: PlayerIdx, loc: Loc): number {
  let n = 0
  for (const pl of Object.values(state.places)) if (pl.p === p && pl.loc === loc) n++
  return n
}

export const samePlace = (a: NPlace, d: Dest): boolean =>
  d.t === 'zone' ? a.p === d.p && a.loc === d.loc && a.seq === d.seq : d.t === 'pile' ? a.p === d.p && a.loc === d.loc : false
