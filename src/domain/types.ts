/** Tipi condivisi di dominio (puri, nessuna dipendenza da React/DOM). Contratto tra moduli: non cambiare senza coordinarsi. */

export type Lang = 'it' | 'en'
export type Localized = { it?: string; en?: string }
export type Rules = 'TCG' | 'OCG'

/** Carta nel dataset compatto (public/data/cards.<ver>.json). Testi degli effetti sono altrove (texts.<lang>). */
export interface Card {
  id: number // passcode
  alias: number // 0 = carta base; altrimenti passcode della carta base
  name: { en: string; it?: string }
  type: number // bitmask tipi EDOPro (cards.cdb datas.type)
  race: number
  attribute: number
  level: number // livello/rango/link rating
  atk: number // -2 = '?'
  def: number
  scale?: number
  setcodes: number[] // archetipi (cards.cdb setcode, già espansi)
  isExtra: boolean // Fusion/Synchro/Xyz/Link
  genesys?: number // punti Genesys, se disponibili
  tcg?: boolean // esiste nel TCG
  ocg?: boolean // esiste nell'OCG
}

export type BanStatus = 0 | 1 | 2 | 3 // 0 Proibita, 1 Limitata, 2 Semi-Limitata, 3 Illimitata

/** Snapshot di una banlist (formato, id es. "2026.10") */
export interface Banlist {
  format: 'TCG' | 'OCG' | 'GENESYS' | 'SPEED' | 'WORLD' | 'TRADITIONAL' | 'GOAT'
  id: string // es. "2026.10"
  /** passcode della carta base → numero massimo di copie (0,1,2); assente = 3 */
  limits: Record<number, 0 | 1 | 2>
  /** solo GENESYS: punti per carta e tetto */
  points?: Record<number, number>
  pointsCap?: number
}

export interface DeckLists {
  main: number[]
  extra: number[]
  side: number[]
}

export interface Meta {
  id: string // UUID
  updatedAt: string // ISO UTC
  deletedAt: string | null
}

export interface Archetype extends Meta {
  name: Localized
  notes?: Localized // piano di gioco ecc.
  keyCards: number[]
  starters: number[]
  extenders: number[]
}

export interface Variant extends Meta {
  archetypeId: string
  name: Localized
  deck: DeckLists
  notes?: Localized
  rules: Rules
  banlist: { format: Banlist['format']; id: string }
}

export type LegalityCode =
  | 'forbidden' | 'limited' | 'semi-limited' | 'too-many-copies'
  | 'main-size' | 'extra-size' | 'side-size' | 'genesys-points' | 'not-in-format' | 'unknown-card'

export interface LegalityIssue {
  code: LegalityCode
  severity: 'error' | 'warning'
  /** carta base interessata (assente per i problemi di dimensione) */
  cardId?: number
  params: Record<string, number | string>
}
