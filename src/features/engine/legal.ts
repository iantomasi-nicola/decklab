/** Azioni legali del core (SELECT_IDLECMD / SELECT_BATTLECMD) → destinazioni di trascinamento e azioni per carta. Pure. */
import type { GameState } from '@/domain/combo/state'
import type { Uid } from '@/domain/combo/types'
import type { CardInfo } from '@/features/combos/cardKind'
import { occupantAt, ZONE_COUNT } from '@/features/combos/zones'
import type { Answer } from '@/engine/protocol'
import { answerBattle, answerIdle } from '@/engine/answers'
import type { DescRef, PendingRequest } from '@/engine/requests'
import type { GameIconName } from '@/ui/gameIcons'
import type { EngKey } from './strings'

export type LegalKind = 'summon' | 'specialSummon' | 'monsterSet' | 'spellSet' | 'activate' | 'posChange' | 'attack' | 'chain'

export interface LegalAction {
  id: string
  kind: LegalKind
  uid: Uid
  answer: Answer
  icon: GameIconName
  labelKey: EngKey
  /** effetto (attiva/catena): testo del core */
  desc?: DescRef | null
  /** chiavi `Dest` (z:p:loc:seq | c:uid) su cui si può rilasciare la carta per eseguire l'azione */
  dests: string[]
  direct?: boolean
}

const zk = (p: 0 | 1, loc: string, seq: number) => `z:${p}:${loc}:${seq}`
const ICON: Record<LegalKind, GameIconName> = {
  summon: 'normalSummon', specialSummon: 'specialSummon', monsterSet: 'setMonster', spellSet: 'setMonster', activate: 'activation', posChange: 'posAtk', attack: 'attack', chain: 'activation',
}
const LABEL: Record<LegalKind, EngKey> = {
  summon: 'act.summon', specialSummon: 'act.specialSummon', monsterSet: 'act.monsterSet', spellSet: 'act.spellSet', activate: 'act.activate', posChange: 'act.posChange', attack: 'act.attack', chain: 'act.chain',
}

function freeZones(state: GameState, p: 0 | 1, loc: 'mzone' | 'szone' | 'fzone' | 'emz', seqs?: readonly number[]): string[] {
  const list = seqs ?? Array.from({ length: ZONE_COUNT[loc] }, (_, i) => i)
  return list.filter((s) => occupantAt(state, p, loc, s) === undefined && (loc !== 'emz' || occupantAt(state, 1, 'emz', s) === undefined)).map((s) => zk(loc === 'emz' ? 0 : p, loc, s))
}

/** Zone in cui ha senso rilasciare la carta per un'azione di evocazione/posa/attivazione dalla mano o da una pila. */
export function placementDests(kind: LegalKind, info: CardInfo, loc: string, state: GameState): string[] {
  if (kind === 'summon' || kind === 'monsterSet') return freeZones(state, 0, 'mzone')
  if (kind === 'specialSummon') return [...freeZones(state, 0, 'mzone'), ...(info.extra ? freeZones(state, 0, 'emz') : [])]
  if (kind === 'spellSet' || kind === 'activate') {
    if (kind === 'activate' && loc !== 'hand') return []
    if (info.kind === 'monster') return info.pendulum && kind === 'activate' ? freeZones(state, 0, 'szone', [0, 4]) : []
    return info.field ? freeZones(state, 0, 'fzone', [0]) : freeZones(state, 0, 'szone')
  }
  return []
}

/** Tutte le azioni offerte dal core a questo punto (vuoto se la richiesta non è un menu principale). */
export function legalActions(req: PendingRequest | null, infoOf: (uid: Uid) => CardInfo, state: GameState): LegalAction[] {
  if (!req) return []
  const out: LegalAction[] = []
  const add = (a: Omit<LegalAction, 'icon' | 'labelKey'> & { icon?: GameIconName }) => out.push({ icon: ICON[a.kind], labelKey: LABEL[a.kind], ...a })
  if (req.kind === 'idle') {
    const groups = [
      ['summon', req.summons, 'summon'],
      ['specialSummon', req.specialSummons, 'specialSummon'],
      ['monsterSet', req.monsterSets, 'monsterSet'],
      ['spellSet', req.spellSets, 'spellSet'],
      ['posChange', req.posChanges, 'posChange'],
    ] as const
    for (const [kind, list, act] of groups) {
      for (const o of list) {
        add({ id: `${kind}:${o.index}`, kind, uid: o.uid, answer: answerIdle(act, o.index), dests: placementDests(kind, infoOf(o.uid), o.place.loc, state) })
      }
    }
    for (const o of req.activates) {
      add({ id: `activate:${o.index}`, kind: 'activate', uid: o.uid, answer: answerIdle('activate', o.index), desc: o.desc, dests: placementDests('activate', infoOf(o.uid), o.place.loc, state) })
    }
  } else if (req.kind === 'battle') {
    const oppMonsters = Object.entries(state.places).filter(([, pl]) => pl.p === 1 && (pl.loc === 'mzone' || pl.loc === 'emz')).map(([u]) => `c:${u}`)
    for (const o of req.attacks) {
      const dests = o.canDirect ? [0, 1, 2, 3, 4].map((s) => zk(1, 'mzone', s)) : oppMonsters
      add({ id: `attack:${o.index}`, kind: 'attack', uid: o.uid, answer: answerBattle('attack', o.index), dests, direct: o.canDirect })
    }
    for (const o of req.chains) {
      add({ id: `chain:${o.index}`, kind: 'chain', uid: o.uid, answer: answerBattle('chain', o.index), desc: o.desc, dests: [] })
    }
  }
  return out
}

export const actionsForCard = (list: readonly LegalAction[], uid: Uid): LegalAction[] => list.filter((a) => a.uid === uid)

/** Chiavi di destinazione evidenziate quando si prende `uid`. */
export function destsForCard(list: readonly LegalAction[], uid: Uid): Set<string> {
  const s = new Set<string>()
  for (const a of list) if (a.uid === uid) for (const d of a.dests) s.add(d)
  return s
}

/** Azioni di `uid` eseguibili rilasciando su `destKey` (già risolto: zona o carta). */
export function actionsAt(list: readonly LegalAction[], uid: Uid, destKey: string): LegalAction[] {
  return list.filter((a) => a.uid === uid && a.dests.includes(destKey))
}

/** Perché una carta non ha azioni legali (chiave i18n), quando è noto. */
export function whyNot(req: PendingRequest | null, opts: { owner: 0 | 1; loc: string; isMonster: boolean; normalUsed: boolean }): 'why.notIdle' | 'why.normalUsed' | 'why.nothing' | 'why.opponent' {
  if (opts.owner === 1) return 'why.opponent'
  if (!req || (req.kind !== 'idle' && req.kind !== 'battle')) return 'why.notIdle'
  if (opts.loc === 'hand' && opts.isMonster && opts.normalUsed && req.kind === 'idle') return 'why.normalUsed'
  return 'why.nothing'
}
