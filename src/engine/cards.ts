/** cardReader del core: record carta (OcgCardData) costruito dal dataset di public/data (src/domain/cards). */
import type { OcgCardData } from '@n1xx1/ocgcore-wasm'
import type { Card } from '@/domain/types'

/** Passcode sintetico del riempitivo dell'avversario (Normale vanilla, senza script): il core non mescola e non pesca "a vuoto". */
export const FILLER_CODE = 99999999

const TYPE_LINK = 0x4000000
const TYPE_PENDULUM = 0x1000000

export function cardToOcg(c: Card): OcgCardData {
  const link = (c.type & TYPE_LINK) !== 0
  const scale = (c.type & TYPE_PENDULUM) !== 0 ? (c.scale ?? 0) : 0
  return {
    code: c.id,
    alias: c.alias,
    setcodes: c.setcodes,
    type: c.type,
    level: c.level & 0xff,
    attribute: c.attribute,
    race: BigInt(c.race),
    attack: c.atk,
    defense: link ? 0 : c.def,
    lscale: scale,
    rscale: scale,
    link_marker: link ? c.def : 0,
  }
}

const FILLER: OcgCardData = {
  code: FILLER_CODE, alias: 0, setcodes: [], type: 0x11, level: 4, attribute: 1, race: 1n, attack: 1000, defense: 1000, lscale: 0, rscale: 0, link_marker: 0,
}

/** Lettore sincrono (il core lo chiama durante duelProcess). Le carte non nel dataset (token non in cdb) restano `null`. */
export function makeCardReader(cards: ReadonlyMap<number, Card>): (code: number) => OcgCardData | null {
  const cache = new Map<number, OcgCardData | null>()
  return (code) => {
    if (code === FILLER_CODE) return FILLER
    let r = cache.get(code)
    if (r === undefined) {
      const c = cards.get(code)
      r = c ? cardToOcg(c) : null
      cache.set(code, r)
    }
    return r
  }
}
