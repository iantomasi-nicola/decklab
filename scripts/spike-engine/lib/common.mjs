// Spike helper: card data (from cards.cdb), script store (jsDelivr pinned commit), duel runner (sync core).
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import {
  OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult, OcgMessageType,
  OcgResponseType, SelectIdleCMDAction, SelectBattleCMDAction,
} from '@n1xx1/ocgcore-wasm'
// NB: mod.js of the JSR/npm build does `export *` which drops the default export (createCore).
// Workaround: import dist/index.js by file URL (the package "exports" map only exposes ".").
const _m = await import(new URL('../node_modules/@n1xx1/ocgcore-wasm/dist/index.js', import.meta.url).href)
const createCore = _m.default

export const COMMIT = '5b613bfc3c122f48238e32f85015b32892577a42'
export const BASE = `https://cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@${COMMIT}/`
export const CDB = new URL('../../.cache/cards.cdb', import.meta.url).pathname
export { createCore, OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult, OcgMessageType, OcgResponseType, SelectIdleCMDAction, SelectBattleCMDAction }

// --- cards ---------------------------------------------------------------
export function openCdb(path = CDB) {
  const db = new DatabaseSync(path, { readOnly: true })
  const q = db.prepare('select id,alias,setcode,type,atk,def,level,race,attribute from datas where id=?')
  const names = db.prepare('select name from texts where id=?')
  const cache = new Map()
  const toCard = (r) => {
    const sc = BigInt(r.setcode)
    const setcodes = []
    for (let i = 0n; i < 4n; i++) { const v = Number((sc >> (16n * i)) & 0xffffn); if (v) setcodes.push(v) }
    const lvl = r.level >>> 0
    const isPend = (r.type & 0x1000000) !== 0
    return {
      code: r.id, alias: r.alias, setcodes, type: r.type,
      level: lvl & 0xff, attribute: r.attribute, race: BigInt(r.race),
      attack: r.atk, defense: (r.type & 0x4000000) ? 0 : r.def,
      lscale: isPend ? (lvl >>> 24) & 0xff : 0, rscale: isPend ? (lvl >>> 16) & 0xff : 0,
      link_marker: (r.type & 0x4000000) ? r.def : 0,
    }
  }
  return {
    get(code) { if (cache.has(code)) return cache.get(code); const r = q.get(code); const c = r ? toCard(r) : null; cache.set(code, c); return c },
    name(code) { return names.get(code)?.name ?? String(code) },
    byName(n) { return db.prepare('select id from datas join texts using(id) where name=? and alias=0 order by id limit 1').get(n)?.id },
  }
}

// --- scripts ---------------------------------------------------------------
// Sync cache in memory. Misses are recorded; caller fetches async and replays.
export class ScriptStore {
  constructor() { this.map = new Map(); this.missing = new Set(); this.notFound = new Set(); this.requested = [] ; this.bytes = 0; this.fetchMs = 0; this.requests = 0 }
  urlFor(name) {
    const n = name.replace(/^\.\/script\//, '').replace(/^script\//, '')
    return n.match(/^c\d+\.lua$/) ? `official/${n}` : n
  }
  read(name) {
    this.requested.push(name)
    const k = this.urlFor(name)
    if (this.map.has(k)) return this.map.get(k)
    if (this.notFound.has(k)) return null
    this.missing.add(k)
    return null
  }
  async fetchMissing(concurrency = 8) {
    const todo = [...this.missing]; this.missing.clear()
    let i = 0
    const t0 = performance.now()
    const worker = async () => {
      while (i < todo.length) {
        const k = todo[i++]
        this.requests++
        const r = await fetch(BASE + k)
        if (r.status === 200) { const t = await r.text(); this.map.set(k, t); this.bytes += Buffer.byteLength(t) }
        else if (r.status === 404) this.notFound.add(k)
        else throw new Error(`${k}: HTTP ${r.status}`)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    this.fetchMs += performance.now() - t0
    return todo
  }
}

// --- duel ------------------------------------------------------------------
export function makeDecks({ main, extra, opp }) {
  return { main, extra, opp }
}

// Deterministic responder: picks response from message (first legal / scripted policy)
export function pickResponse(m, rnd) {
  const T = OcgMessageType
  switch (m.type) {
    case T.SELECT_IDLECMD: {
      // prefer: activate > special summon > summon > set > bp/ep
      const order = [['activates', SelectIdleCMDAction.SELECT_ACTIVATE], ['special_summons', SelectIdleCMDAction.SELECT_SPECIAL_SUMMON], ['summons', SelectIdleCMDAction.SELECT_SUMMON], ['monster_sets', SelectIdleCMDAction.SELECT_MONSTER_SET], ['spell_sets', SelectIdleCMDAction.SELECT_SPELL_SET]]
      for (const [k, a] of order) if (m[k].length) return { type: OcgResponseType.SELECT_IDLECMD, action: a, index: rnd(m[k].length) }
      return { type: OcgResponseType.SELECT_IDLECMD, action: m.to_ep ? SelectIdleCMDAction.TO_EP : SelectIdleCMDAction.TO_BP, index: null }
    }
    case T.SELECT_BATTLECMD:
      return { type: OcgResponseType.SELECT_BATTLECMD, action: m.to_ep ? SelectBattleCMDAction.TO_EP : SelectBattleCMDAction.TO_M2, index: null }
    case T.SELECT_EFFECTYN: return { type: OcgResponseType.SELECT_EFFECTYN, yes: true }
    case T.SELECT_YESNO: return { type: OcgResponseType.SELECT_YESNO, yes: true }
    case T.SELECT_OPTION: return { type: OcgResponseType.SELECT_OPTION, index: 0 }
    case T.SELECT_CARD: return { type: OcgResponseType.SELECT_CARD, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_TRIBUTE: return { type: OcgResponseType.SELECT_TRIBUTE, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_UNSELECT_CARD: return m.can_finish ? { type: OcgResponseType.SELECT_UNSELECT_CARD, index: null } : { type: OcgResponseType.SELECT_UNSELECT_CARD, index: 0 }
    case T.SELECT_CHAIN: return { type: OcgResponseType.SELECT_CHAIN, index: m.forced && m.selects.length ? 0 : (m.selects.length ? 0 : null) }
    case T.SELECT_PLACE: case T.SELECT_DISFIELD: {
      // first free zone from mask (bit set = unavailable)
      const places = []
      for (let loc of [OcgLocation.MZONE, OcgLocation.SZONE]) {
        for (let p = 0; p < 2 && places.length < m.count; p++) for (let s = 0; s < 8 && places.length < m.count; s++) {
          const bit = (loc === OcgLocation.MZONE ? 0 : 8) + s + (p ? 16 : 0)
          if (!(m.field_mask & (1 << bit))) places.push({ player: p === 0 ? m.player : 1 - m.player, location: loc, sequence: s })
        }
        if (places.length >= m.count) break
      }
      return { type: m.type === T.SELECT_PLACE ? OcgResponseType.SELECT_PLACE : OcgResponseType.SELECT_DISFIELD, places }
    }
    case T.SELECT_POSITION: return { type: OcgResponseType.SELECT_POSITION, position: m.positions & 1 ? 1 : m.positions & 4 ? 4 : m.positions & 8 ? 8 : 2 }
    case T.SELECT_COUNTER: { const c = new Array(m.cards.length).fill(0); let left = m.count; for (let i = 0; left > 0 && i < m.cards.length; i++) { const t = Math.min(left, m.cards[i].count); c[i] = t; left -= t } return { type: OcgResponseType.SELECT_COUNTER, counters: c } }
    case T.SELECT_SUM: return { type: OcgResponseType.SELECT_SUM, indicies: m.selects.slice(0, Math.max(1, m.min)).map((_, i) => i) }
    case T.SORT_CARD: case T.SORT_CHAIN: return { type: OcgResponseType.SORT_CARD, order: null }
    case T.ANNOUNCE_RACE: return { type: OcgResponseType.ANNOUNCE_RACE, races: [1n] }
    case T.ANNOUNCE_ATTRIB: return { type: OcgResponseType.ANNOUNCE_ATTRIB, attributes: [m.attributes?.[0] ?? 1] }
    case T.ANNOUNCE_NUMBER: return { type: OcgResponseType.ANNOUNCE_NUMBER, value: 0 }
    case T.ROCK_PAPER_SCISSORS: return { type: OcgResponseType.ROCK_PAPER_SCISSORS, value: 1 }
    default: throw new Error('unhandled request type ' + OcgMessageType[m.type] + ' ' + JSON.stringify(m, (k, v) => typeof v === 'bigint' ? v.toString() : v).slice(0, 200))
  }
}
