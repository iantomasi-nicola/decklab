/**
 * Formato compatto di `public/data/cards.<ver>.json` (colonnare).
 *
 * ```
 * { format: "combo-lab/cards", v: 1, n: <numero carte>, cols: {
 *     id:       number[]          passcode (ordinato crescente)
 *     alias:    number[]          0 = carta base, altrimenti passcode della base
 *     en:       string[]          nome EN; "" = identico a quello della carta base (solo se alias != 0)
 *     it:       string[]          nome IT; "" = assente (o ereditato dalla base se `en` è "")
 *                                 (un nome IT identico all'EN non viene salvato)
 *     type, race, attribute, level, atk, def: number[]   valori di cards.cdb (atk -2 = '?')
 *     flags:    number[]          bit0 = isExtra, bit1 = tcg, bit2 = ocg
 *     scale:    { [indice]: number }       solo Pendulum
 *     setcodes: { [indice]: number[] }     solo carte con archetipi (4x16 bit già espansi)
 *     genesys:  { [indice]: number }       solo carte con punti Genesys > 0
 * } }
 * ```
 * Gli indici delle mappe sparse sono posizioni nelle colonne. Il formato è la fonte unica
 * per lo script di build (encodeCards) e per il client (decodeCards).
 */
import type { Card } from '../types'

export interface CardsFile {
  format: 'combo-lab/cards'
  v: 1
  n: number
  cols: {
    id: number[]
    alias: number[]
    en: string[]
    it: string[]
    type: number[]
    race: number[]
    attribute: number[]
    level: number[]
    atk: number[]
    def: number[]
    flags: number[]
    scale: Record<string, number>
    setcodes: Record<string, number[]>
    genesys: Record<string, number>
  }
}

const F_EXTRA = 1
const F_TCG = 2
const F_OCG = 4

/** Nome IT "significativo": assente se uguale all'EN. */
const itOf = (c: Card): string | undefined => (c.name.it && c.name.it !== c.name.en ? c.name.it : undefined)

export function encodeCards(cards: readonly Card[]): CardsFile {
  const sorted = [...cards].sort((a, b) => a.id - b.id)
  const byId = new Map(sorted.map((c) => [c.id, c]))
  const cols: CardsFile['cols'] = {
    id: [], alias: [], en: [], it: [], type: [], race: [], attribute: [], level: [], atk: [], def: [],
    flags: [], scale: {}, setcodes: {}, genesys: {},
  }
  sorted.forEach((c, i) => {
    const base = c.alias ? byId.get(c.alias) : undefined
    const inherit = !!base && base.alias === 0 && base.name.en === c.name.en && itOf(base) === itOf(c)
    cols.id.push(c.id)
    cols.alias.push(c.alias)
    cols.en.push(inherit ? '' : c.name.en)
    cols.it.push(inherit ? '' : (itOf(c) ?? ''))
    cols.type.push(c.type)
    cols.race.push(c.race)
    cols.attribute.push(c.attribute)
    cols.level.push(c.level)
    cols.atk.push(c.atk)
    cols.def.push(c.def)
    cols.flags.push((c.isExtra ? F_EXTRA : 0) | (c.tcg ? F_TCG : 0) | (c.ocg ? F_OCG : 0))
    if (c.scale !== undefined) cols.scale[i] = c.scale
    if (c.setcodes.length) cols.setcodes[i] = c.setcodes
    if (c.genesys) cols.genesys[i] = c.genesys
  })
  return { format: 'combo-lab/cards', v: 1, n: sorted.length, cols }
}

export function decodeCards(file: CardsFile): Card[] {
  if (file.format !== 'combo-lab/cards' || file.v !== 1) throw new Error('Formato carte non supportato')
  const { cols, n } = file
  const index = new Map<number, number>()
  for (let i = 0; i < n; i++) index.set(cols.id[i]!, i)
  const out: Card[] = new Array(n)
  // ereditarietà a un solo salto: la carta base ha sempre il nome esplicito (l'encoder non eredita da alias)
  const nameOf = (i: number): { en: string; it?: string } => {
    let j = i
    if (cols.en[i] === '' && cols.alias[i]) j = index.get(cols.alias[i]!) ?? i
    const en = cols.en[j]!
    const it = cols.it[j]!
    return it ? { en, it } : { en }
  }
  for (let i = 0; i < n; i++) {
    const flags = cols.flags[i]!
    const card: Card = {
      id: cols.id[i]!,
      alias: cols.alias[i]!,
      name: nameOf(i),
      type: cols.type[i]!,
      race: cols.race[i]!,
      attribute: cols.attribute[i]!,
      level: cols.level[i]!,
      atk: cols.atk[i]!,
      def: cols.def[i]!,
      setcodes: cols.setcodes[i] ?? [],
      isExtra: (flags & F_EXTRA) !== 0,
      tcg: (flags & F_TCG) !== 0,
      ocg: (flags & F_OCG) !== 0,
    }
    const sc = cols.scale[i]
    if (sc !== undefined) card.scale = sc
    const g = cols.genesys[i]
    if (g !== undefined) card.genesys = g
    out[i] = card
  }
  return out
}
