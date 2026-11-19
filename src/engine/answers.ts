/**
 * Costruttori di risposte per ogni `PendingRequest` (contratto stabile: docs/ENGINE-API.md).
 * Gli `index` sono quelli delle opzioni (`Opt.index`). Tutte funzioni pure; il risultato va a `client.respond(answer)`.
 */
import { OcgResponseType as R } from './core'
import { SelectBattleCMDAction, SelectIdleCMDAction } from '@n1xx1/ocgcore-wasm'
import type { OcgAttribute, OcgPosition, OcgRace } from '@n1xx1/ocgcore-wasm'
import type { Position } from '@/domain/combo/types'
import type { Answer } from './protocol'
import type { BattleAction, IdleAction, PendingRequest, PlaceOpt } from './requests'

const IDLE: Record<IdleAction, SelectIdleCMDAction> = {
  summon: SelectIdleCMDAction.SELECT_SUMMON,
  specialSummon: SelectIdleCMDAction.SELECT_SPECIAL_SUMMON,
  posChange: SelectIdleCMDAction.SELECT_POS_CHANGE,
  monsterSet: SelectIdleCMDAction.SELECT_MONSTER_SET,
  spellSet: SelectIdleCMDAction.SELECT_SPELL_SET,
  activate: SelectIdleCMDAction.SELECT_ACTIVATE,
  toBattle: SelectIdleCMDAction.TO_BP,
  toEnd: SelectIdleCMDAction.TO_EP,
  shuffle: SelectIdleCMDAction.SHUFFLE,
}
const BATTLE: Record<BattleAction, SelectBattleCMDAction> = {
  attack: SelectBattleCMDAction.SELECT_BATTLE,
  chain: SelectBattleCMDAction.SELECT_CHAIN,
  toMain2: SelectBattleCMDAction.TO_M2,
  toEnd: SelectBattleCMDAction.TO_EP,
}
const POS: Record<Position, number> = { FACEUP_ATK: 1, FACEUP_DEF: 4, FACEDOWN_DEF: 8, FACEUP: 1, FACEDOWN: 8 }

/** `index` = `Opt.index` dell'opzione scelta (omesso per toBattle/toEnd/shuffle). */
export const answerIdle = (action: IdleAction, index?: number): Answer => ({ type: R.SELECT_IDLECMD, action: IDLE[action], index: index ?? null })
export const answerBattle = (action: BattleAction, index?: number): Answer => ({ type: R.SELECT_BATTLECMD, action: BATTLE[action], index: index ?? null })
/** `null` = passa. */
export const answerChain = (index: number | null): Answer => ({ type: R.SELECT_CHAIN, index })
export const answerEffectYn = (yes: boolean): Answer => ({ type: R.SELECT_EFFECTYN, yes })
export const answerYesNo = (yes: boolean): Answer => ({ type: R.SELECT_YESNO, yes })
export const answerOption = (index: number): Answer => ({ type: R.SELECT_OPTION, index })
/** `indices` = `Opt.index` scelti; `null` = annulla (solo se `canCancel`). */
export const answerCards = (req: Extract<PendingRequest, { kind: 'cards' }>, indices: number[] | null): Answer =>
  req.mode === 'tribute' ? { type: R.SELECT_TRIBUTE, indicies: indices } : { type: R.SELECT_CARD, indicies: indices }
/** Una carta alla volta: `index` = `Opt.index` di `selectable` (o di `selected` per deselezionare); `null` = fine/annulla. */
export const answerUnselect = (index: number | null): Answer => ({ type: R.SELECT_UNSELECT_CARD, index })
export const answerSum = (indices: number[]): Answer => ({ type: R.SELECT_SUM, indicies: indices })
/** `counts[i]` = segnalini da togliere alla i-esima opzione. */
export const answerCounter = (counts: number[]): Answer => ({ type: R.SELECT_COUNTER, counters: counts })
export const answerPlace = (req: Extract<PendingRequest, { kind: 'place' }>, places: PlaceOpt[]): Answer => {
  const list = places.map((p) => p.core) as never
  return req.mode === 'disfield' ? { type: R.SELECT_DISFIELD, places: list } : { type: R.SELECT_PLACE, places: list }
}
export const answerPosition = (position: Position): Answer => ({ type: R.SELECT_POSITION, position: POS[position] as OcgPosition })
/** `order` = nuovo ordine (indici), `null` = ordine proposto dal core. */
export const answerSort = (order: number[] | null): Answer => ({ type: R.SORT_CARD, order })
export const answerRace = (races: number[]): Answer => ({ type: R.ANNOUNCE_RACE, races: races.map((r) => BigInt(r) as unknown as OcgRace) })
export const answerAttribute = (attributes: number[]): Answer => ({ type: R.ANNOUNCE_ATTRIB, attributes: attributes as OcgAttribute[] })
export const answerNumber = (value: number): Answer => ({ type: R.ANNOUNCE_NUMBER, value })
export const answerCard = (code: number): Answer => ({ type: R.ANNOUNCE_CARD, card: code })
export const answerRps = (value: 1 | 2 | 3): Answer => ({ type: R.ROCK_PAPER_SCISSORS, value })
