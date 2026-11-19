/** Stato di gioco derivato dai passi di una combo (riduttore puro, nessun motore). Spec: docs/COMBO_FORMAT.md §7, §9, §14. */
import type { Board, BoardPlacement, ComboDoc, Endboard, Loc, Move, Place, PlayerIdx, Step, Uid } from './types'

export const DEFAULT_LP = 8000
export const FIELD_LOCS: readonly Loc[] = ['mzone', 'emz', 'szone', 'fzone', 'overlay']

/** Place normalizzato: `p` sempre esplicito. */
export type NPlace = Place & { p: PlayerIdx }

export interface GameState {
  /** uid → posizione corrente. Le carte non ancora rivelate non compaiono. */
  readonly places: Readonly<Record<Uid, NPlace>>
  readonly lp: readonly [number, number]
  /** uid → tipo → quantità (> 0) */
  readonly counters: Readonly<Record<Uid, Readonly<Record<string, number>>>>
}

export function ownerOfUid(uid: Uid): PlayerIdx {
  return uid.startsWith('o') ? 1 : 0
}

export function normPlace(place: Place, defaultP: PlayerIdx = 0): NPlace {
  return { ...place, p: place.p ?? defaultP }
}

function boardInto(places: Record<Uid, NPlace>, board: Board | undefined, defaultP: PlayerIdx) {
  for (const bp of board?.places ?? []) places[bp.uid] = normPlace(bp.place, defaultP)
}

export function initialState(doc: ComboDoc): GameState {
  const places: Record<Uid, NPlace> = {}
  const counters: Record<Uid, Record<string, number>> = {}
  const own = doc.setup.own
  const opp = doc.setup.opponent?.board
  boardInto(places, own, 0)
  boardInto(places, opp, 1)
  for (const b of [own, opp]) {
    for (const [uid, c] of Object.entries(b?.counters ?? {})) {
      const clean = Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0))
      if (Object.keys(clean).length) counters[uid] = clean
    }
  }
  // Carte "necessarie" in mano (se non già collocate altrove da setup.own)
  let seq = Object.values(places).filter((pl) => pl.p === 0 && pl.loc === 'hand').length
  for (const uid of doc.setup.hand.required) {
    if (!places[uid]) places[uid] = { p: 0, loc: 'hand', seq: seq++ }
  }
  return { places, lp: [own?.lp ?? DEFAULT_LP, opp?.lp ?? DEFAULT_LP], counters }
}

/** Risolve il Place di destinazione di una mossa (giocatore di default: quello attuale della carta, poi il proprietario dall'uid). */
function resolveTo(state: GameState, move: Move): NPlace {
  const cur = state.places[move.uid]
  return normPlace(move.to, move.to.p ?? cur?.p ?? ownerOfUid(move.uid))
}

/** Applica un passo: ritorna un NUOVO stato, l'input non viene mai modificato. */
export function applyStep(state: GameState, step: Step): GameState {
  const places: Record<Uid, NPlace> = { ...state.places }
  for (const m of step.moves) places[m.uid] = resolveTo(state, m)
  let lp = state.lp
  if (step.lp?.length) {
    const next: [number, number] = [state.lp[0], state.lp[1]]
    for (const d of step.lp) next[d.p] += d.delta
    lp = next
  }
  let counters = state.counters
  if (step.counters?.length) {
    const c: Record<Uid, Record<string, number>> = {}
    for (const [k, v] of Object.entries(state.counters)) c[k] = { ...v }
    for (const d of step.counters) {
      const cur = c[d.uid] ?? (c[d.uid] = {})
      const n = (cur[d.type] ?? 0) + d.delta
      if (n > 0) cur[d.type] = n
      else delete cur[d.type]
      if (Object.keys(cur).length === 0) delete c[d.uid]
    }
    counters = c
  }
  return { places, lp, counters }
}

export interface AllStates {
  /** main[k] = stato dopo k passi della linea principale (main[0] = iniziale) */
  main: GameState[]
  /** branches[id][k] = stato dopo k passi del ramo (k = 0: subito dopo `afterStep`) */
  branches: Record<string, GameState[]>
}

function fold(start: GameState, steps: Step[]): GameState[] {
  const out = [start]
  let s = start
  for (const st of steps) out.push((s = applyStep(s, st)))
  return out
}

/** Precalcola tutti gli stati per replay istantaneo. I rami con `afterStep` inesistente partono dallo stato iniziale. */
export function allStates(doc: ComboDoc): AllStates {
  const main = fold(initialState(doc), doc.steps)
  const branches: Record<string, GameState[]> = {}
  for (const b of doc.branches) {
    const idx = doc.steps.findIndex((s) => s.id === b.condition.afterStep)
    branches[b.id] = fold(main[idx + 1] ?? main[0]!, b.steps)
  }
  return { main, branches }
}

/**
 * Stato dopo il passo `stepIndex` (0-based; -1 = stato iniziale / punto di diramazione).
 * Con `branchId`, `stepIndex` indica il passo del ramo. Indici fuori range vengono limitati.
 */
export function stateAt(doc: ComboDoc, stepIndex: number, branchId?: string): GameState {
  const all = allStates(doc)
  const arr = branchId ? all.branches[branchId] : all.main
  if (!arr) throw new Error(`branch not found: ${branchId}`)
  const k = Math.min(Math.max(stepIndex + 1, 0), arr.length - 1)
  return arr[k]!
}

/** Carte di una zona, ordinate per `seq` (poi per uid). */
export function zoneCards(state: GameState, p: PlayerIdx, loc: Loc, host?: Uid): Uid[] {
  return Object.entries(state.places)
    .filter(([, pl]) => pl.p === p && pl.loc === loc && (host === undefined || pl.host === host))
    .sort(([ua, a], [ub, b]) => (a.seq ?? 0) - (b.seq ?? 0) || ua.localeCompare(ub, 'en', { numeric: true }))
    .map(([uid]) => uid)
}

export function overlaysOf(state: GameState, host: Uid): Uid[] {
  return Object.entries(state.places)
    .filter(([, pl]) => pl.loc === 'overlay' && pl.host === host)
    .sort(([, a], [, b]) => (a.seq ?? 0) - (b.seq ?? 0))
    .map(([uid]) => uid)
}

function cleanPlace(pl: NPlace): Place {
  const out: Place = { loc: pl.loc }
  if (pl.p === 1) out.p = 1 // p = 0 omesso (default)
  if (pl.seq !== undefined) out.seq = pl.seq
  if (pl.pos !== undefined) out.pos = pl.pos
  if (pl.host !== undefined) out.host = pl.host
  return out
}

/** Board di un giocatore dallo stato. `locs` di default: solo il campo (mzone, emz, szone, fzone, overlay). */
export function boardOf(state: GameState, p: PlayerIdx, locs: readonly Loc[] = FIELD_LOCS): Board {
  const places: BoardPlacement[] = Object.entries(state.places)
    .filter(([, pl]) => pl.p === p && locs.includes(pl.loc))
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([uid, pl]) => ({ uid, place: cleanPlace(pl) }))
  const board: Board = { lp: state.lp[p], places }
  const counters: Record<Uid, Record<string, number>> = {}
  for (const bp of places) if (state.counters[bp.uid]) counters[bp.uid] = { ...state.counters[bp.uid]! }
  if (Object.keys(counters).length) board.counters = counters
  return board
}

/** Endboard (solo campo) ricalcolato; `opponent` omesso se banale (vuoto, LP 8000). */
export function deriveEndboard(state: GameState): Endboard {
  const own = boardOf(state, 0)
  const opp = boardOf(state, 1)
  const trivial = opp.places.length === 0 && opp.lp === DEFAULT_LP && !opp.counters
  return trivial ? { own } : { own, opponent: opp }
}

type Sig = string
function sigBoard(b: Board | undefined, defaultP: PlayerIdx, locs: readonly Loc[]): Sig {
  const lp = b?.lp ?? DEFAULT_LP
  const items = (b?.places ?? [])
    .filter((bp) => locs.includes(bp.place.loc))
    .map((bp) => {
      const pl = normPlace(bp.place, defaultP)
      return `${bp.uid}|${pl.p}|${pl.loc}|${pl.seq ?? ''}|${pl.pos ?? ''}|${pl.host ?? ''}`
    })
    .sort()
  const cs = Object.entries(b?.counters ?? {})
    .flatMap(([uid, c]) => Object.entries(c).filter(([, n]) => n > 0).map(([t, n]) => `${uid}:${t}=${n}`))
    .sort()
  return JSON.stringify([lp, items, cs])
}

/** Confronta due endboard sul solo campo (+LP e segnalini). `opponent` assente = vuoto con LP 8000. */
export function endboardsEqual(a: Endboard, b: Endboard, locs: readonly Loc[] = FIELD_LOCS): boolean {
  return sigBoard(a.own, 0, locs) === sigBoard(b.own, 0, locs) && sigBoard(a.opponent, 1, locs) === sigBoard(b.opponent, 1, locs)
}

/** Coerenza di una mossa con lo stato: "mismatch" se `from` contraddice la posizione reale, "unknown" se la carta non è ancora nello stato. */
export function moveMismatch(state: GameState, m: Move): 'mismatch' | 'unknown' | null {
  if (!m.from) return null
  const cur = state.places[m.uid]
  if (!cur) return 'unknown'
  const f = normPlace(m.from, m.from.p ?? cur.p)
  const bad = f.p !== cur.p || f.loc !== cur.loc || (f.seq !== undefined && cur.seq !== undefined && f.seq !== cur.seq) || (f.host !== undefined && f.host !== cur.host)
  return bad ? 'mismatch' : null
}
