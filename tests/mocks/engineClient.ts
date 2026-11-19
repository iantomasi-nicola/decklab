/**
 * Motore finto per i test dell'interfaccia automatica: stati e richieste costruiti a mano (stessi tipi di src/engine),
 * più un `EngineClient` che scorre una sequenza di stati. Nessun wasm, nessuna rete.
 */
import type { EngineClient } from '../../src/engine/client'
import type { Answer, DuelSnapshot, DuelState, EngineEvent, InitResult } from '../../src/engine/protocol'
import type { CardRef, Opt, PendingRequest, PlayerPiles } from '../../src/engine/requests'
import type { Board, Loc, Position, Uid } from '../../src/domain/combo/types'

export const CODE = {
  ash: 14558127, tengu: 10028593, rook: 10060427, xyz: 10000030, link: 10019086, spell: 10065487,
  trap: 10045474, field: 10080320, equip: 10004783, pend: 10024317,
} as const

export const ref = (uid: Uid, code: number, loc: Loc, seq = 0, pos?: Position, p: 0 | 1 = 0): CardRef => ({ uid, code, place: { p, loc, seq, ...(pos ? { pos } : {}) } })
export const opt = (r: CardRef, index: number): Opt => ({ ...r, index })

export interface SampleBoard {
  cards: Record<Uid, number>
  piles: [PlayerPiles, PlayerPiles]
  endboard: { own: Board; opponent: Board }
  hand: CardRef[]
  field: CardRef[]
  gy: CardRef[]
  extra: CardRef[]
  oppField: CardRef[]
}

export function sampleBoard(): SampleBoard {
  const hand = [ref('u1', CODE.tengu, 'hand', 0), ref('u2', CODE.ash, 'hand', 1), ref('u3', CODE.spell, 'hand', 2), ref('u4', CODE.trap, 'hand', 3), ref('u5', CODE.rook, 'hand', 4)]
  const field = [ref('u6', CODE.ash, 'mzone', 1, 'FACEUP_ATK'), ref('u7', CODE.trap, 'szone', 2, 'FACEDOWN'), ref('u12', CODE.field, 'fzone', 0, 'FACEUP')]
  const gy = [ref('u8', CODE.tengu, 'gy', 0), ref('u9', CODE.ash, 'gy', 1)]
  const extra = [ref('u10', CODE.xyz, 'extra', 0), ref('u11', CODE.link, 'extra', 1)]
  const oppField = [ref('o1', CODE.rook, 'mzone', 2, 'FACEUP_ATK', 1), ref('o2', CODE.ash, 'mzone', 3, 'FACEUP_DEF', 1), ref('o3', 0, 'szone', 1, 'FACEDOWN', 1)]
  const cards: Record<Uid, number> = {}
  for (const r of [...hand, ...field, ...gy, ...extra, ...oppField]) cards[r.uid] = r.code
  const oppHand = [0, 1, 2, 3].map((i) => ref(`o${10 + i}`, 0, 'hand', i, undefined, 1))
  return {
    cards, hand, field, gy, extra, oppField,
    piles: [
      { hand, gy, banished: [], extra, deckCount: 28, handCount: hand.length },
      { hand: oppHand, gy: [], banished: [], extra: [], deckCount: 36, handCount: oppHand.length },
    ],
    endboard: {
      own: { lp: 8000, places: field.map((r) => ({ uid: r.uid, place: r.place })) },
      opponent: { lp: 8000, places: oppField.map((r) => ({ uid: r.uid, place: r.place })) },
    },
  }
}

export function makeState(pending: PendingRequest | null, over: Partial<DuelState> = {}): DuelState {
  const b = sampleBoard()
  return {
    delta: [], pending, position: 0, total: 0, canUndo: false, canRedo: false, ended: false, steps: [], cards: b.cards, requiredHand: [],
    endboard: b.endboard, lp: [8000, 8000], piles: b.piles, replays: 0, errors: [], autoApplied: 0, ...over,
  }
}

/** Richieste di esempio, una per `kind`. */
export function sampleRequests(): Record<string, PendingRequest> {
  const b = sampleBoard()
  const [tengu, ash, spell, trap, rook] = b.hand
  const [mon] = b.field
  const [xyz, link] = b.extra
  return {
    idle: {
      kind: 'idle', summons: [opt(tengu!, 0), opt(ash!, 1)], specialSummons: [opt(xyz!, 0), opt(link!, 1)], posChanges: [opt(mon!, 0)],
      monsterSets: [opt(tengu!, 0), opt(ash!, 1)], spellSets: [opt(spell!, 0), opt(trap!, 1)],
      activates: [{ ...opt(spell!, 0), desc: { kind: 'card', code: CODE.spell, index: 0 } }, { ...opt(mon!, 1), desc: { kind: 'card', code: CODE.ash, index: 1 } }],
      canBattle: true, canEndTurn: true, canShuffle: false,
    },
    battle: { kind: 'battle', attacks: [{ ...opt(mon!, 0), canDirect: false }], chains: [], canMain2: true, canEnd: true },
    chain: {
      kind: 'chain', forced: false, hintTiming: 0,
      options: [{ ...opt(trap!, 0), desc: { kind: 'card', code: CODE.trap, index: 0 } }, { ...opt(mon!, 1), desc: { kind: 'card', code: CODE.ash, index: 1 } }, { ...opt(spell!, 2), desc: null }],
    },
    chainEmpty: { kind: 'chain', forced: false, hintTiming: 0, options: [] },
    effectYn: { kind: 'effectYn', card: mon!, desc: { kind: 'card', code: CODE.ash, index: 0 } },
    yesNo: { kind: 'yesNo', desc: { kind: 'system', id: 1190 } },
    option: { kind: 'option', options: [{ kind: 'card', code: CODE.ash, index: 0 }, { kind: 'card', code: CODE.ash, index: 1 }, null] },
    cardsField: { kind: 'cards', mode: 'select', min: 1, max: 2, canCancel: true, options: [opt(b.oppField[0]!, 0), opt(b.oppField[1]!, 1), opt(mon!, 2), opt(ash!, 3)] },
    cardsGrid: {
      kind: 'cards', mode: 'select', min: 1, max: 1, canCancel: false,
      options: Array.from({ length: 14 }, (_, i) => opt(ref(`d${i}`, [CODE.tengu, CODE.ash, CODE.rook, CODE.spell, CODE.trap][i % 5]!, 'deck', i), i)),
    },
    tribute: { kind: 'cards', mode: 'tribute', min: 2, max: 2, canCancel: true, options: [{ ...opt(mon!, 0), tribute: 1 }, { ...opt(b.field[1]!, 1), tribute: 2 }, { ...opt(ash!, 2), tribute: 1 }] },
    unselect: { kind: 'unselect', min: 2, max: 3, canFinish: false, canCancel: true, selectable: [opt(mon!, 0), opt(ash!, 1), opt(tengu!, 2)], selected: [opt(rook!, 0)] },
    sum: {
      kind: 'sum', amount: 8, exact: true, min: 1, max: 3,
      mustSelect: [{ ...opt(mon!, 0), value: 4 }],
      options: [{ ...opt(ash!, 0), value: 3 }, { ...opt(tengu!, 1), value: 4 }, { ...opt(rook!, 2), value: 7 }, { ...opt(spell!, 3), value: 1 + (2 << 16) }],
    },
    counter: { kind: 'counter', counterType: 0x1, count: 3, options: [{ ...opt(mon!, 0), available: 2 }, { ...opt(b.field[1]!, 1), available: 4 }] },
    place: {
      kind: 'place', mode: 'place', count: 1,
      available: [0, 2, 4].map((s) => ({ p: 0 as const, loc: 'mzone' as const, seq: s, core: { player: 0, location: 4, sequence: s } })),
    },
    place2: {
      kind: 'place', mode: 'disfield', count: 2,
      available: [0, 2, 3, 4].map((s) => ({ p: 0 as const, loc: 'mzone' as const, seq: s, core: { player: 0, location: 4, sequence: s } })),
    },
    position: { kind: 'position', code: CODE.ash, positions: ['FACEUP_ATK', 'FACEUP_DEF', 'FACEDOWN_DEF'] },
    sort: { kind: 'sort', mode: 'chain', cards: [opt(mon!, 0), opt(ash!, 1), opt(rook!, 2), opt(tengu!, 3)] },
    race: { kind: 'announceRace', count: 1, available: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536] },
    attribute: { kind: 'announceAttribute', count: 1, available: [1, 2, 4, 8, 16, 32, 64] },
    number: { kind: 'announceNumber', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    announceCard: { kind: 'announceCard', candidates: [CODE.ash, CODE.tengu, CODE.rook, CODE.xyz, CODE.link, CODE.spell, CODE.trap, CODE.field, CODE.equip, CODE.pend], truncated: false },
    rps: { kind: 'rps' },
  }
}

export interface FakeClient extends EngineClient {
  answers: Answer[]
  started: unknown[]
  emit(e: EngineEvent): void
}

/** Client finto: `states[i]` è lo stato dopo i risposte; `respond` avanza di uno (o chiama `onRespond`). */
export function scenarioClient(states: DuelState[], opts: { onRespond?: (a: Answer, i: number) => DuelState | Error | undefined; delayMs?: number } = {}): FakeClient {
  let i = 0
  const answers: Answer[] = []
  const listeners = new Set<(e: EngineEvent) => void>()
  const wait = () => (opts.delayMs ? new Promise<void>((r) => setTimeout(r, opts.delayMs)) : Promise.resolve())
  const at = (n: number): DuelState => ({ ...states[n]!, position: n, total: states.length - 1, canUndo: n > 0, canRedo: n < states.length - 1 })
  const init: InitResult = { core: 'fake', api: [11, 0], scriptsCommit: 'fake', cdbVersion: 'fake', cards: 0 }
  const client: FakeClient = {
    answers, started: [],
    emit: (e) => listeners.forEach((l) => l(e)),
    init: async () => init,
    startDuel: async (req) => { client.started.push(req); i = 0; answers.length = 0; await wait(); return at(0) },
    respond: async (a) => {
      await wait()
      const r = opts.onRespond?.(a, i)
      if (r instanceof Error) throw r
      answers.length = i
      answers.push(a)
      if (r) { states[i + 1] = r }
      i = Math.min(i + 1, states.length - 1)
      return at(i)
    },
    undo: async () => { i = Math.max(0, i - 1); return at(i) },
    redo: async () => { i = Math.min(states.length - 1, i + 1); return at(i) },
    replay: async (a) => { answers.splice(0, answers.length, ...a); i = Math.min(a.length, states.length - 1); return at(i) },
    snapshot: async () => ({ seed: 1, answers: [...answers], auto: answers.map(() => false), log: [], piles: states[i]!.piles, redo: [] }) as DuelSnapshot,
    engineBlock: async () => ({ core: 'fake', scriptsCommit: 'fake', cdbVersion: 'fake', mode: 'MR5', seed: [1], responses: answers.map((a) => btoa(JSON.stringify(a))) }),
    preload: async () => undefined,
    dispose: async () => undefined,
    onEvent: (fn) => { listeners.add(fn); return () => void listeners.delete(fn) },
    terminate: () => undefined,
  }
  return client
}
