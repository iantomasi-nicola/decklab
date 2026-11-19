/**
 * Un "passaggio" di duello, sincrono e neutro rispetto all'ambiente (Worker e Node):
 * crea il duello, aggiunge le carte (ordine deciso da noi), avvia, e rigioca le risposte date fino alla prossima richiesta.
 * Se manca uno script il chiamante lo scarica e rigioca da capo (vedi session.ts).
 */
import {
  OcgDuelMode, OcgLocation, OcgMessageType, OcgPosition, OcgProcessResult, OcgResponseType, type OcgCoreSync,
} from './core'
import type { OcgCardData, OcgMessage, OcgResponse } from '@n1xx1/ocgcore-wasm'
import type { Board, Loc, Place, Position, Uid } from '@/domain/combo/types'
import { FILLER_CODE } from './cards'
import { PRELOADED_SCRIPTS } from './constants'
import { coreSeedFrom, shuffleDeck } from './prng'
import type { StartDuelRequest } from './protocol'
import type { ScriptStore } from './scripts'

// ---------------------------------------------------------------- piano del duello

/** Una carta fisica aggiunta al core (ordine di `PlanCard[]` = ordine di `duelNewCard`). */
export interface PlanCard {
  /** indice fisico stabile (posizione in `plan.cards`) */
  idx: number
  code: number
  team: 0 | 1
  location: number
  sequence: number
  position: number
  /** `main`/`extra` del giocatore, `board` = piazzata da setup.own/opponent, `filler` = riempitivo avversario */
  origin: 'main' | 'extra' | 'board' | 'filler'
  /** uid noto dal setup (mano richiesta, board); gli altri li assegna il normalizzatore */
  uid?: Uid
}

export interface DuelPlan {
  cards: PlanCard[]
  /** ordine finale del mazzo del giocatore: indici fisici (`PlanCard.idx`), 0 = cima */
  deckTop: number[]
  startingDraw: [number, number]
  lp: [number, number]
  coreSeed: [bigint, bigint, bigint, bigint]
  /** uid → passcode per le carte note dal setup */
  uidCodes: Record<Uid, number>
}

const MZONE_EMZ_BASE = 5 // il core numera le EMZ come mzone 5 e 6

export function locToCore(p: Place): { location: number; sequence: number } {
  const seq = p.seq ?? 0
  switch (p.loc) {
    case 'deck': return { location: OcgLocation.DECK, sequence: 1 } // indifferente: l'ordine lo dà il piano
    case 'hand': return { location: OcgLocation.HAND, sequence: 0 }
    case 'extra': return { location: OcgLocation.EXTRA, sequence: 0 }
    case 'gy': return { location: OcgLocation.GRAVE, sequence: 0 }
    case 'banished': return { location: OcgLocation.REMOVED, sequence: 0 }
    case 'mzone': return { location: OcgLocation.MZONE, sequence: seq }
    case 'emz': return { location: OcgLocation.MZONE, sequence: MZONE_EMZ_BASE + seq }
    case 'szone': return { location: OcgLocation.SZONE, sequence: seq }
    case 'fzone': return { location: OcgLocation.SZONE, sequence: 5 }
    case 'overlay': throw new Error('Setup: i materiali Xyz iniziali non sono supportati')
  }
}

export function posToCore(pos: Position | undefined, loc: Loc): number {
  switch (pos) {
    case 'FACEUP_ATK': return OcgPosition.FACEUP_ATTACK
    case 'FACEUP_DEF': return OcgPosition.FACEUP_DEFENSE
    case 'FACEDOWN_DEF': return OcgPosition.FACEDOWN_DEFENSE
    case 'FACEUP': return OcgPosition.FACEUP_ATTACK
    case 'FACEDOWN': return OcgPosition.FACEDOWN_DEFENSE
    default: return loc === 'mzone' || loc === 'emz' ? OcgPosition.FACEUP_ATTACK : loc === 'szone' || loc === 'fzone' ? OcgPosition.FACEUP_ATTACK : OcgPosition.FACEDOWN_DEFENSE
  }
}

const OPPONENT_DECK_SIZE = 40

/**
 * Costruisce il piano: copie fisiche, ordine del mazzo (`deckOrder`/shuffle, con `hand.required` in cima),
 * mano iniziale (`startingDrawCount`), board iniziale di entrambi.
 */
export function buildPlan(req: StartDuelRequest): DuelPlan {
  const { deck, setup } = req
  const cardsByUid = req.cards ?? {}
  const mainIdx = deck.main.map((_, i) => i)
  const order = req.deckOrder ?? shuffleDeck(req.seed, deck.main.length)
  if (order.length !== deck.main.length || new Set(order).size !== order.length || order.some((i) => !mainIdx.includes(i))) {
    throw new Error('deckOrder non è una permutazione degli indici del main deck')
  }

  const cards: PlanCard[] = []
  const used = new Set<number>() // indici main/extra già assegnati a setup (mano richiesta/board)
  const uidCodes: Record<Uid, number> = {}
  const takeCopy = (code: number, from: 'main' | 'extra', byOrder: boolean): number => {
    const list = from === 'main' ? deck.main : deck.extra
    const candidates = byOrder && from === 'main' ? order : list.map((_, i) => i)
    for (const i of candidates) if (list[i] === code && !used.has(from === 'main' ? i : 1000 + i)) { used.add(from === 'main' ? i : 1000 + i); return i }
    return -1
  }

  // mano richiesta: copie reali del main, in cima
  const requiredIdx: number[] = []
  const requiredUid = new Map<number, Uid>()
  for (const uid of setup.hand.required) {
    const code = cardsByUid[uid]
    if (code === undefined) throw new Error(`Setup: uid ${uid} non presente in cards`)
    const i = takeCopy(code, 'main', true)
    if (i < 0) throw new Error(`Setup: ${uid} (${code}) non è nel main deck in numero sufficiente`)
    requiredIdx.push(i)
    requiredUid.set(i, uid)
    uidCodes[uid] = code
  }

  // board del giocatore: copie tolte da main/extra (stesso passcode)
  const ownPlaced: { code: number; uid: Uid; place: Place; from: 'main' | 'extra'; i: number }[] = []
  for (const bp of setup.own?.places ?? []) {
    const code = cardsByUid[bp.uid]
    if (code === undefined) throw new Error(`Setup: uid ${bp.uid} non presente in cards`)
    const isExtraLoc = bp.place.loc === 'extra'
    let from: 'main' | 'extra' = isExtraLoc ? 'extra' : 'main'
    let i = takeCopy(code, from, false)
    if (i < 0 && !isExtraLoc) { from = 'extra'; i = takeCopy(code, 'extra', false) }
    if (i < 0) throw new Error(`Setup: ${bp.uid} (${code}) non è nel mazzo`)
    ownPlaced.push({ code, uid: bp.uid, place: bp.place, from, i })
    uidCodes[bp.uid] = code
  }

  // carte fisiche del giocatore: main (indice = posizione nella lista), poi extra
  const mainCard: PlanCard[] = deck.main.map((code, i) => ({ idx: -1, code, team: 0, location: OcgLocation.DECK, sequence: 1, position: OcgPosition.FACEDOWN_DEFENSE, origin: 'main', ...(requiredUid.has(i) ? { uid: requiredUid.get(i)! } : {}) }))
  const extraCard: PlanCard[] = deck.extra.map((code) => ({ idx: -1, code, team: 0, location: OcgLocation.EXTRA, sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE, origin: 'extra' }))
  for (const o of ownPlaced) {
    const target = o.from === 'main' ? mainCard[o.i]! : extraCard[o.i]!
    const loc = locToCore(o.place)
    target.location = loc.location
    target.sequence = loc.sequence
    target.position = posToCore(o.place.pos, o.place.loc)
    target.uid = o.uid
    if (o.place.loc === 'deck') target.origin = 'main'
  }

  // ordine di aggiunta: le carte del mazzo si aggiungono dal fondo alla cima (sequence 0 = cima)
  const inDeck = (i: number) => mainCard[i]!.location === OcgLocation.DECK
  const finalOrder = [...requiredIdx, ...order.filter((i) => !requiredIdx.includes(i))].filter(inDeck)
  const placedMain = mainCard.filter((c) => !inDeck(deck.main.indexOf(c.code) >= 0 ? mainCard.indexOf(c) : -1))
  void placedMain
  const physical: PlanCard[] = []
  const idxOfMain = new Map<number, number>()
  const addPhys = (c: PlanCard): number => { c.idx = physical.length; physical.push(c); return c.idx }
  // 1) carte del mazzo, dal fondo alla cima
  for (const i of [...finalOrder].reverse()) idxOfMain.set(i, addPhys(mainCard[i]!))
  // 2) main piazzati altrove (board/mano)
  mainCard.forEach((c, i) => { if (!inDeck(i)) idxOfMain.set(i, addPhys(c)) })
  // 3) extra
  for (const c of extraCard) addPhys(c)
  cards.push(...physical)
  const deckTop = finalOrder.map((i) => idxOfMain.get(i)!)

  // avversario: riempitivo + board
  const oppDraw = 0
  for (let i = 0; i < OPPONENT_DECK_SIZE; i++) {
    cards.push({ idx: cards.length, code: FILLER_CODE, team: 1, location: OcgLocation.DECK, sequence: 1, position: OcgPosition.FACEDOWN_DEFENSE, origin: 'filler' })
  }
  for (const bp of setup.opponent?.board?.places ?? []) {
    const code = cardsByUid[bp.uid]
    if (code === undefined) throw new Error(`Setup: uid ${bp.uid} non presente in cards`)
    const loc = locToCore({ ...bp.place, p: 1 })
    uidCodes[bp.uid] = code
    cards.push({ idx: cards.length, code, team: 1, location: loc.location, sequence: loc.sequence, position: posToCore(bp.place.pos, bp.place.loc), origin: 'board', uid: bp.uid })
  }

  const handSize = setup.hand.fill === 'none' ? requiredIdx.length : Math.max(setup.hand.size, requiredIdx.length)
  const lpOf = (b: Board | undefined) => b?.lp ?? 8000
  return {
    cards,
    deckTop,
    startingDraw: [Math.min(handSize, finalOrder.length), oppDraw],
    lp: [lpOf(setup.own), lpOf(setup.opponent?.board)],
    coreSeed: coreSeedFrom(req.seed),
    uidCodes,
  }
}

// ---------------------------------------------------------------- esecuzione

/** Tipi di messaggio che chiedono una risposta (il core si ferma). */
export const REQUEST_TYPES: ReadonlySet<number> = new Set([
  OcgMessageType.SELECT_BATTLECMD, OcgMessageType.SELECT_IDLECMD, OcgMessageType.SELECT_EFFECTYN, OcgMessageType.SELECT_YESNO,
  OcgMessageType.SELECT_OPTION, OcgMessageType.SELECT_CARD, OcgMessageType.SELECT_CHAIN, OcgMessageType.SELECT_PLACE,
  OcgMessageType.SELECT_POSITION, OcgMessageType.SELECT_TRIBUTE, OcgMessageType.SORT_CHAIN, OcgMessageType.SELECT_COUNTER,
  OcgMessageType.SELECT_SUM, OcgMessageType.SELECT_DISFIELD, OcgMessageType.SORT_CARD, OcgMessageType.SELECT_UNSELECT_CARD,
  OcgMessageType.ANNOUNCE_RACE, OcgMessageType.ANNOUNCE_ATTRIB, OcgMessageType.ANNOUNCE_CARD, OcgMessageType.ANNOUNCE_NUMBER,
  OcgMessageType.ROCK_PAPER_SCISSORS,
])
export const isRequest = (m: OcgMessage): boolean => REQUEST_TYPES.has(m.type)

export interface RunInput {
  lib: OcgCoreSync
  plan: DuelPlan
  cardReader: (code: number) => OcgCardData | null
  scripts: ScriptStore
  /** risposte del giocatore da rigiocare, in ordine */
  answers: readonly OcgResponse[]
  /** risposte automatiche dell'avversario (funzione pura del messaggio): null = lasciare la richiesta alla UI */
  opponentPolicy?: (req: OcgMessage) => OcgResponse | null
}

export interface RunResult {
  /** log[0] = avvio, log[i] = messaggi dopo la risposta utente i */
  log: OcgMessage[][]
  /** ultima richiesta in sospeso, se il duello non è finito */
  pending: OcgMessage | null
  ended: boolean
  /** una risposta registrata non è più valida (RETRY) */
  diverged: boolean
  /** quante risposte utente sono state consumate */
  consumed: number
  errors: string[]
}

export function runDuel(inp: RunInput): RunResult {
  const { lib, plan, scripts } = inp
  const errors: string[] = []
  const handle = lib.createDuel({
    flags: OcgDuelMode.MODE_MR5,
    seed: plan.coreSeed,
    team1: { startingLP: plan.lp[0], startingDrawCount: plan.startingDraw[0], drawCountPerTurn: 1 },
    team2: { startingLP: plan.lp[1], startingDrawCount: plan.startingDraw[1], drawCountPerTurn: 1 },
    cardReader: inp.cardReader,
    scriptReader: scripts.read,
    errorHandler: (_t, text) => errors.push(text),
  })
  if (!handle) throw new Error('createDuel ha fallito')
  try {
    // `loadScript(null)` lancia TypeError (bug noto): si caricano solo gli script già in memoria
    for (const n of PRELOADED_SCRIPTS) {
      const src = scripts.read(n)
      if (src != null) lib.loadScript(handle, n, src)
    }
    for (const c of plan.cards) {
      lib.duelNewCard(handle, { team: c.team, duelist: 0, code: c.code, controller: c.team, location: c.location, sequence: c.sequence, position: c.position })
    }
    lib.startDuel(handle)

    const log: OcgMessage[][] = [[]]
    let consumed = 0
    let pending: OcgMessage | null = null
    let ended = false
    let diverged = false
    let guard = 0
    for (;;) {
      if (++guard > 100000) throw new Error('duello: troppi passi senza richiesta')
      const status = lib.duelProcess(handle)
      const msgs = lib.duelGetMessage(handle)
      log[log.length - 1]!.push(...msgs)
      if (status === OcgProcessResult.END) { ended = true; break }
      if (status === OcgProcessResult.CONTINUE) continue
      const req = [...msgs].reverse().find(isRequest)
      if (!req) {
        if (msgs.some((m) => m.type === OcgMessageType.RETRY)) { diverged = true; break }
        throw new Error('WAITING senza richiesta')
      }
      const auto = req.type !== OcgMessageType.RETRY && 'player' in req && req.player === 1 ? inp.opponentPolicy?.(req) ?? null : null
      let resp: OcgResponse
      if (auto) resp = auto
      else if (consumed < inp.answers.length) {
        resp = inp.answers[consumed]!
        consumed++
        log.push([])
      } else {
        pending = req
        break
      }
      lib.duelSetResponse(handle, resp)
    }
    return { log, pending, ended, diverged, consumed, errors }
  } finally {
    lib.destroyDuel(handle)
  }
}

export { OcgResponseType }
