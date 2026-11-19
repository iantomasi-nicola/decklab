/**
 * Richieste in sospeso del core, tipizzate per la UI (contratto stabile: vedi docs/ENGINE-API.md).
 * `describeRequest` traduce un messaggio `SELECT_*`/`ANNOUNCE_*`/`SORT_*` del core in un `PendingRequest`:
 * carte come `CardRef` (uid + passcode + Place del formato combo), opzioni con `index` = posizione nell'elenco ORIGINALE del core
 * (è quello che le funzioni di `answers.ts` rimettono nella risposta). Nessun bigint: tutto serializzabile.
 */
import { OcgLocation, OcgMessageType as T } from './core'
import type { OcgMessage } from '@n1xx1/ocgcore-wasm'
import type { Loc, Place, PlayerIdx, Position, Uid } from '@/domain/combo/types'

/** Carta indicata dal core, già legata a uid e Place del formato combo. */
export interface CardRef {
  uid: Uid
  /** passcode (0 = carta coperta dell'avversario) */
  code: number
  place: Place
}
/** Zone "a pila" di un giocatore. `hand` nell'ordine reale; `gy`/`banished`: l'ultima è la cima. Carte coperte dell'avversario: `code` 0. */
export interface PlayerPiles {
  hand: CardRef[]
  gy: CardRef[]
  banished: CardRef[]
  extra: CardRef[]
  deckCount: number
  handCount: number
}

/** Opzione scegliibile: `index` = indice nell'elenco originale del core. */
export type Opt = CardRef & { index: number }

/** Riferimento a un testo: stringa di una carta (`str<index+1>` della carta `code`) oppure stringa di sistema (strings.conf). */
export type DescRef = { kind: 'card'; code: number; index: number } | { kind: 'system'; id: number }

export interface PlaceOpt {
  p: PlayerIdx
  loc: Extract<Loc, 'mzone' | 'emz' | 'szone' | 'fzone'>
  /** 0-4 per mzone/szone, 0-1 per emz, assente per fzone */
  seq?: number
  /** valori da rimettere nella risposta (indici del core) */
  core: { player: number; location: number; sequence: number }
}

export type IdleAction = 'summon' | 'specialSummon' | 'posChange' | 'monsterSet' | 'spellSet' | 'activate' | 'toBattle' | 'toEnd' | 'shuffle'
export type BattleAction = 'attack' | 'chain' | 'toMain2' | 'toEnd'

export type PendingRequest =
  | {
      kind: 'idle'
      summons: Opt[]
      specialSummons: Opt[]
      posChanges: Opt[]
      monsterSets: Opt[]
      spellSets: Opt[]
      activates: (Opt & { desc: DescRef | null })[]
      canBattle: boolean
      canEndTurn: boolean
      canShuffle: boolean
    }
  | { kind: 'battle'; attacks: (Opt & { canDirect: boolean })[]; chains: (Opt & { desc: DescRef | null })[]; canMain2: boolean; canEnd: boolean }
  /** `forced` = non si può passare. `options` vuoto = finestra senza effetti attivabili. */
  | { kind: 'chain'; forced: boolean; options: (Opt & { desc: DescRef | null })[]; hintTiming: number }
  | { kind: 'effectYn'; card: CardRef; desc: DescRef | null }
  | { kind: 'yesNo'; desc: DescRef | null }
  | { kind: 'option'; options: (DescRef | null)[] }
  /** `mode: 'tribute'` = SELECT_TRIBUTE (ogni opzione ha `tribute` = valore di tributo). */
  | { kind: 'cards'; mode: 'select' | 'tribute'; min: number; max: number; canCancel: boolean; options: (Opt & { tribute?: number })[] }
  | { kind: 'unselect'; min: number; max: number; canFinish: boolean; canCancel: boolean; selectable: Opt[]; selected: Opt[] }
  | { kind: 'sum'; amount: number; exact: boolean; min: number; max: number; mustSelect: (Opt & { value: number })[]; options: (Opt & { value: number })[] }
  | { kind: 'counter'; counterType: number; count: number; options: (Opt & { available: number })[] }
  /** `count` zone da scegliere fra `available` (la mappa del core indica le zone NON libere; qui sono già invertite). */
  | { kind: 'place'; mode: 'place' | 'disfield'; count: number; available: PlaceOpt[] }
  | { kind: 'position'; code: number; positions: Position[] }
  | { kind: 'sort'; mode: 'card' | 'chain'; cards: Opt[] }
  | { kind: 'announceRace'; count: number; available: number[] }
  | { kind: 'announceAttribute'; count: number; available: number[] }
  | { kind: 'announceNumber'; options: number[] }
  /** `opcodes` opaco (per `cardMatchesOpcode` del pacchetto); `candidates` = passcode già filtrati dal worker (può essere troncato). */
  | { kind: 'announceCard'; candidates: number[]; truncated: boolean }
  | { kind: 'rps' }

export interface RequestContext {
  /** team del core → PlayerIdx del formato combo */
  outP(team: number): PlayerIdx
  /** carta a una posizione del core (con uid e Place) */
  ref(l: { controller: number; location: number; sequence: number; overlay_sequence?: number }, code?: number): CardRef
  /** passcode che soddisfano l'opcode di ANNOUNCE_CARD */
  matchCodes(opcodes: unknown[]): { codes: number[]; truncated: boolean }
}

export function descRef(d: bigint): DescRef | null {
  if (d === 0n) return null
  return d >= 10000n ? { kind: 'card', code: Number(d >> 4n), index: Number(d & 15n) } : { kind: 'system', id: Number(d) }
}

const POSITIONS: [number, Position][] = [[1, 'FACEUP_ATK'], [4, 'FACEUP_DEF'], [8, 'FACEDOWN_DEF'], [2, 'FACEDOWN_DEF']]

function bits(mask: number): number[] {
  const out: number[] = []
  for (let b = 1; b <= 0x80000000 && b > 0; b *= 2) if (mask & b) out.push(b)
  return out
}

/** Zone libere a partire dalla mappa "occupate" del core (bit 0-6 mzone/emz, 8-12 szone, 13 zona campo; +16 per il team 1). */
function freePlaces(mask: number, ctx: RequestContext): PlaceOpt[] {
  const out: PlaceOpt[] = []
  for (const team of [0, 1] as const) {
    const base = team * 16
    const taken = (bit: number) => ((mask >>> (base + bit)) & 1) === 1
    const p = ctx.outP(team)
    for (let s = 0; s < 5; s++) if (!taken(s)) out.push({ p, loc: 'mzone', seq: s, core: { player: team, location: OcgLocation.MZONE, sequence: s } })
    for (let s = 5; s < 7; s++) if (!taken(s)) out.push({ p, loc: 'emz', seq: s - 5, core: { player: team, location: OcgLocation.MZONE, sequence: s } })
    for (let s = 0; s < 5; s++) if (!taken(8 + s)) out.push({ p, loc: 'szone', seq: s, core: { player: team, location: OcgLocation.SZONE, sequence: s } })
    if (!taken(13)) out.push({ p, loc: 'fzone', core: { player: team, location: OcgLocation.SZONE, sequence: 5 } })
  }
  return out
}

export function describeRequest(m: OcgMessage, ctx: RequestContext): PendingRequest | null {
  const opt = <L extends { code: number; controller: number; location: number; sequence: number; overlay_sequence?: number }>(l: L, index: number): Opt => ({ ...ctx.ref(l, l.code), index })
  switch (m.type) {
    case T.SELECT_IDLECMD:
      return {
        kind: 'idle',
        summons: m.summons.map(opt),
        specialSummons: m.special_summons.map(opt),
        posChanges: m.pos_changes.map(opt),
        monsterSets: m.monster_sets.map(opt),
        spellSets: m.spell_sets.map(opt),
        activates: m.activates.map((a, i) => ({ ...opt(a, i), desc: descRef(a.description) })),
        canBattle: m.to_bp,
        canEndTurn: m.to_ep,
        canShuffle: m.shuffle,
      }
    case T.SELECT_BATTLECMD:
      return {
        kind: 'battle',
        attacks: m.attacks.map((a, i) => ({ ...opt(a, i), canDirect: a.can_direct })),
        chains: m.chains.map((a, i) => ({ ...opt(a, i), desc: descRef(a.description) })),
        canMain2: m.to_m2,
        canEnd: m.to_ep,
      }
    case T.SELECT_CHAIN:
      return { kind: 'chain', forced: m.forced, options: m.selects.map((a, i) => ({ ...opt(a, i), desc: descRef(a.description) })), hintTiming: m.hint_timing }
    case T.SELECT_EFFECTYN:
      return { kind: 'effectYn', card: ctx.ref(m, m.code), desc: descRef(m.description) }
    case T.SELECT_YESNO:
      return { kind: 'yesNo', desc: descRef(m.description) }
    case T.SELECT_OPTION:
      return { kind: 'option', options: m.options.map(descRef) }
    case T.SELECT_CARD:
      return { kind: 'cards', mode: 'select', min: m.min, max: m.max, canCancel: m.can_cancel, options: m.selects.map(opt) }
    case T.SELECT_TRIBUTE:
      return { kind: 'cards', mode: 'tribute', min: m.min, max: m.max, canCancel: m.can_cancel, options: m.selects.map((a, i) => ({ ...opt(a, i), tribute: a.release_param })) }
    case T.SELECT_UNSELECT_CARD:
      return { kind: 'unselect', min: m.min, max: m.max, canFinish: m.can_finish, canCancel: m.can_cancel, selectable: m.select_cards.map(opt), selected: m.unselect_cards.map(opt) }
    case T.SELECT_SUM:
      return {
        kind: 'sum', amount: m.amount, exact: m.select_max !== 0, min: m.min, max: m.max,
        mustSelect: m.selects_must.map((a, i) => ({ ...opt(a, i), value: a.amount })),
        options: m.selects.map((a, i) => ({ ...opt(a, i), value: a.amount })),
      }
    case T.SELECT_COUNTER:
      return { kind: 'counter', counterType: m.counter_type, count: m.count, options: m.cards.map((a, i) => ({ ...opt(a, i), available: a.count })) }
    case T.SELECT_PLACE:
    case T.SELECT_DISFIELD:
      return { kind: 'place', mode: m.type === T.SELECT_PLACE ? 'place' : 'disfield', count: m.count, available: freePlaces(m.field_mask, ctx) }
    case T.SELECT_POSITION:
      return { kind: 'position', code: m.code, positions: POSITIONS.filter(([b]) => m.positions & b).map(([, p]) => p).filter((p, i, a) => a.indexOf(p) === i) }
    case T.SORT_CARD:
    case T.SORT_CHAIN:
      return { kind: 'sort', mode: m.type === T.SORT_CARD ? 'card' : 'chain', cards: m.cards.map((a, i) => ({ ...ctx.ref(a, a.code), index: i })) }
    case T.ANNOUNCE_RACE:
      return { kind: 'announceRace', count: m.count, available: bits(Number(m.available)) }
    case T.ANNOUNCE_ATTRIB:
      return { kind: 'announceAttribute', count: m.count, available: bits(m.available) }
    case T.ANNOUNCE_NUMBER:
      return { kind: 'announceNumber', options: m.options.map(Number) }
    case T.ANNOUNCE_CARD: {
      const r = ctx.matchCodes(m.opcodes)
      return { kind: 'announceCard', candidates: r.codes, truncated: r.truncated }
    }
    case T.ROCK_PAPER_SCISSORS:
      return { kind: 'rps' }
    default:
      return null
  }
}
