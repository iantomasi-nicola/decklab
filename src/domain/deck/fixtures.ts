import type { Card } from '../types'
import { createCardIndex } from './cardIndex'

const base = { type: 0, race: 0, attribute: 0, level: 4, atk: 0, def: 0, setcodes: [] as number[], isExtra: false, tcg: true, ocg: true }
const mk = (id: number, en: string, it?: string, o: Partial<Card> = {}): Card => ({ ...base, id, alias: 0, name: { en, it }, ...o })

export const ASH = 14558127
export const cards: Card[] = [
  mk(ASH, 'Ash Blossom & Joyous Spring', 'Fioritura di Cenere & Gioiosa Primavera'),
  mk(14558128, 'Ash Blossom & Joyous Spring', 'Fioritura di Cenere & Gioiosa Primavera', { alias: ASH }),
  mk(24224830, "Called by the Grave", 'Chiamato dalla Tomba'),
  mk(1001, 'Pot of Greed', 'Pentola dell\'Avidità'),
  mk(1002, 'Pot of Desires', 'Pentola dei Desideri', { ocg: false }),
  mk(1003, 'Raigeki', 'Raigeki'),
  mk(1004, 'Dark Hole', 'Buco Nero'),
  mk(1005, 'Dark Magician', 'Mago Nero'),
  mk(1006, 'Dark Magician Girl', 'Maga Nera'),
  mk(1007, 'Accesscode Talker', undefined, { isExtra: true }),
  mk(1008, 'Apollousa, Bow of the Goddess', undefined, { isExtra: true }),
  ...Array.from({ length: 80 }, (_, i) => mk(2000 + i, `Filler ${i}`, `Riempitivo ${i}`)),
  mk(1009, 'Filler Side', 'Riempitivo Side'),
]
export const index = createCardIndex(cards)

export const filler = (n: number): number[] => Array.from({ length: n }, (_, i) => 2000 + i)
