// Environment-neutral engine driver (runs in Node and in a browser Worker).
// NB: the package's mod.js does `export *`, which drops the default export (createCore).
// Workaround: import dist/index.js by relative path (the "exports" map only exposes ".").
import * as P from '../node_modules/@n1xx1/ocgcore-wasm/dist/index.js'
export const createCore = P.default
export const { OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult, OcgMessageType, OcgResponseType, SelectIdleCMDAction, SelectBattleCMDAction } = P
const T = P.OcgMessageType

// Deterministic "policy" used only to drive the spike (NOT a product AI).
export function pickResponse(m, step = 0) {
  const R = P.OcgResponseType
  const pass = m.player === 1
  switch (m.type) {
    case T.SELECT_IDLECMD: {
      if (!pass) {
        const order = [['activates', P.SelectIdleCMDAction.SELECT_ACTIVATE], ['special_summons', P.SelectIdleCMDAction.SELECT_SPECIAL_SUMMON], ['summons', P.SelectIdleCMDAction.SELECT_SUMMON], ['monster_sets', P.SelectIdleCMDAction.SELECT_MONSTER_SET], ['spell_sets', P.SelectIdleCMDAction.SELECT_SPELL_SET]]
        for (const [k, a] of order) if (m[k].length) return { type: R.SELECT_IDLECMD, action: a, index: step % m[k].length }
      }
      return { type: R.SELECT_IDLECMD, action: m.to_ep ? P.SelectIdleCMDAction.TO_EP : P.SelectIdleCMDAction.TO_BP, index: null }
    }
    case T.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: m.to_ep ? P.SelectBattleCMDAction.TO_EP : P.SelectBattleCMDAction.TO_M2, index: null }
    case T.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: !pass }
    case T.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: !pass }
    case T.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 }
    case T.SELECT_CARD: return { type: R.SELECT_CARD, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_UNSELECT_CARD: return m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : { type: R.SELECT_UNSELECT_CARD, index: 0 }
    case T.SELECT_CHAIN: return { type: R.SELECT_CHAIN, index: (m.forced || (!pass && m.selects.length)) && m.selects.length ? 0 : null }
    case T.SELECT_PLACE: case T.SELECT_DISFIELD: {
      const places = []
      for (const loc of [P.OcgLocation.MZONE, P.OcgLocation.SZONE]) {
        for (let s = 0; s < 7 && places.length < m.count; s++) {
          const bit = (loc === P.OcgLocation.MZONE ? 0 : 8) + s
          if (!(m.field_mask & (1 << bit))) places.push({ player: m.player, location: loc, sequence: s })
        }
        if (places.length >= m.count) break
      }
      return { type: m.type === T.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD, places }
    }
    case T.SELECT_POSITION: return { type: R.SELECT_POSITION, position: m.positions & 1 ? 1 : m.positions & 4 ? 4 : m.positions & 8 ? 8 : 2 }
    case T.SELECT_COUNTER: { const c = new Array(m.cards.length).fill(0); let left = m.count; for (let i = 0; left > 0 && i < m.cards.length; i++) { const t = Math.min(left, m.cards[i].count); c[i] = t; left -= t } return { type: R.SELECT_COUNTER, counters: c } }
    case T.SELECT_SUM: return { type: R.SELECT_SUM, indicies: m.selects.slice(0, Math.max(1, m.min)).map((_, i) => i) }
    case T.SORT_CARD: case T.SORT_CHAIN: return { type: R.SORT_CARD, order: null }
    case T.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: [1n] }
    case T.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: [1] }
    case T.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 }
    case T.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 }
    default: throw new Error('unhandled request ' + P.OcgMessageType[m.type])
  }
}

export const REQUEST_TYPES = new Set([T.SELECT_BATTLECMD, T.SELECT_IDLECMD, T.SELECT_EFFECTYN, T.SELECT_YESNO, T.SELECT_OPTION, T.SELECT_CARD, T.SELECT_CHAIN, T.SELECT_PLACE, T.SELECT_POSITION, T.SELECT_TRIBUTE, T.SORT_CHAIN, T.SELECT_COUNTER, T.SELECT_SUM, T.SELECT_DISFIELD, T.SORT_CARD, T.SELECT_UNSELECT_CARD, T.ANNOUNCE_RACE, T.ANNOUNCE_ATTRIB, T.ANNOUNCE_CARD, T.ANNOUNCE_NUMBER, T.ROCK_PAPER_SCISSORS])

export const msgName = (m) => P.OcgMessageType[m.type]
export const BASE_SCRIPTS = ['constant.lua', 'utility.lua']

/**
 * Run one duel pass, synchronously.
 *  lib        : core from createCore({sync:true})
 *  cards      : {get(code)->OcgCardData|null}
 *  scripts    : {read(name)->string|null}  (records misses; caller replays after fetching)
 *  decks      : {main:[codes], extra:[codes], opp:[codes], oppExtra?:[]}
 *  responses  : array of recorded OcgResponse to replay first (determinism / undo)
 *  maxNew     : after the recorded responses, generate up to maxNew new ones with pickResponse
 *  onMessages : optional hook(messages)
 * Returns {messages (flat), responses, ended, pending (last request msg), timings}
 */
export function runDuel(lib, { cards, scripts, decks, seed, responses = [], maxNew = 0, flags, onMessages }) {
  const t0 = performance.now()
  const errors = []
  const h = lib.createDuel({
    flags: flags ?? P.OcgDuelMode.MODE_MR5, seed,
    team1: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 },
    team2: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 },
    cardReader: (c) => cards.get(c), scriptReader: (n) => scripts.read(n),
    errorHandler: (t, x) => errors.push(x),
  })
  if (!h) throw new Error('createDuel failed')
  try {
    for (const n of BASE_SCRIPTS) { const src = scripts.read(n); if (src != null) lib.loadScript(h, n, src) } // loadScript(null) throws a TypeError
    const seq = decks.seq ?? 0
    const add = (team, list, location) => list.forEach((code) => lib.duelNewCard(h, { team, duelist: 0, code, controller: team, location, sequence: seq, position: P.OcgPosition.FACEDOWN_DEFENSE }))
    add(0, decks.main, P.OcgLocation.DECK); add(0, decks.extra ?? [], P.OcgLocation.EXTRA)
    add(1, decks.opp, P.OcgLocation.DECK); add(1, decks.oppExtra ?? [], P.OcgLocation.EXTRA)
    lib.startDuel(h)
    const t1 = performance.now()
    const all = []; const out = []; let given = 0, ended = false, diverged = false, pending = null, nprocess = 0
    for (;;) {
      const st = lib.duelProcess(h); nprocess++
      const msgs = lib.duelGetMessage(h)
      all.push(...msgs); onMessages?.(msgs)
      if (st === P.OcgProcessResult.END) { ended = true; break }
      if (st === P.OcgProcessResult.CONTINUE) continue
      const req = [...msgs].reverse().find((m) => REQUEST_TYPES.has(m.type))
      if (!req) { if (msgs.some((m) => m.type === T.RETRY)) { diverged = true; break } throw new Error('WAITING without request: ' + msgs.map(msgName).join(',')) } // RETRY = recorded response no longer legal (state diverged)
      let resp
      if (given < responses.length) resp = responses[given]
      else if (out.length - responses.length < maxNew) resp = pickResponse(req, given)
      else { pending = req; break }
      lib.duelSetResponse(h, resp); out.push(resp); given++
    }
    return { messages: all, responses: out, ended, diverged, pending, nprocess, errors, tCreate: t1 - t0, tRun: performance.now() - t1, missing: scripts.missingSize?.() }
  } finally { lib.destroyDuel(h) }
}
