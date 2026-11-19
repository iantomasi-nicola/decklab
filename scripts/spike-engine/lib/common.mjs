// Spike helper: card data (from cards.cdb), script store (jsDelivr pinned commit), duel runner (sync core).
import { DatabaseSync } from 'node:sqlite'

export const COMMIT = '5b613bfc3c122f48238e32f85015b32892577a42'
export const BASE = `https://raw.githubusercontent.com/ProjectIgnis/CardScripts/${COMMIT}/` // jsDelivr@sha answers 403 on ~16% of files (package >50MB)
export const BASE_JSDELIVR = `https://cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@${COMMIT}/`
export const CDB = new URL('../../.cache/cards.cdb', import.meta.url).pathname
export * from './engine.mjs'

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
  constructor() { this.map = new Map(); this.missing = new Set(); this.notFound = new Set(); this.requested = [] ; this.bytes = 0; this.fetchMs = 0; this.statuses = {}; this.nf = {}; this.requests = 0 }
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
        else if (r.status === 404 || r.status === 403) { this.notFound.add(k); this.statuses[r.status] = (this.statuses[r.status] ?? 0) + 1; this.nf[k] = r.status }
        else throw new Error(`${k}: HTTP ${r.status}`)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    this.fetchMs += performance.now() - t0
    return todo
  }
}

