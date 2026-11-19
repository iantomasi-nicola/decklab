// Spike helper: card data (from cards.cdb), script store (jsDelivr pinned commit), duel runner (sync core).
import { DatabaseSync } from 'node:sqlite'

export const CDB = new URL('../../.cache/cards.cdb', import.meta.url).pathname
export * from './engine.mjs'
export * from './scripts.mjs'

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

