/** Tipi puri dello Stats Lab (modello Deckspace: ARCHITECTURE.md §11.1). Nessuna dipendenza da React/DOM. */

export type Label = 'PLAYABLE' | 'BRICK'

/** Ruoli con significato per il calcolo; qualunque altra stringa è un tag libero (solo informativo). */
export const ROLE = { S1: 'S1', C2: 'C2', C3: 'C3', NS: 'NS', NE: 'NE', GARNET: 'GARNET' } as const
export const ROLE_PRESETS = ['S1', 'C2', 'C3', 'NS', 'NE', 'GARNET'] as const
/** Un ruolo di questo elenco rende la carta "engine" (partecipa a insiemi PLAYABLE/BRICK); le altre fanno da riempimento. */
export const ENGINE_ROLES: readonly string[] = ['S1', 'C2', 'C3', 'GARNET']

export interface StatsCard {
  /** Passcode della carta base (già canonicalizzato dal chiamante). */
  id: number
  /** Copie nel Main. */
  count: number
  tags: string[]
  /** Partner con cui la carta fa combo (da combo salvate o importati). */
  comboWith?: number[]
  /** Partner con cui la carta è brick (anche sé stessa, se compare id id). */
  brickWith?: number[]
}

export type TournamentMode = 'average' | 'atLeast1' | 'atLeastK' | 'distribution'

export interface StatsSettings {
  useAssumedDeckSize: boolean
  assumedDeckSize: number
  useSixCardHand: boolean
  tournamentRounds: number
  /** Stringa libera: il formato Deckspace può contenere valori che non conosciamo. */
  tournamentMode: string
  drawPowerMode: string
}

export const DEFAULT_SETTINGS: StatsSettings = {
  useAssumedDeckSize: false,
  assumedDeckSize: 40,
  useSixCardHand: false,
  tournamentRounds: 15,
  tournamentMode: 'average',
  drawPowerMode: 'fast',
}

/** Ingresso del calcolo: mazzo con ruoli + etichette manuali + regole extra (es. dalle combo salvate). */
export interface HandInput {
  cards: StatsCard[]
  /** Etichette esplicite su insiemi di 1-3 (o più) carte: chiave = passcode ordinati, separati da virgola. */
  labels: Record<string, Label>
  /** Mani "giocabili" per costruzione: ogni elemento è un multiinsieme di passcode (es. `setup.hand.required` di una combo). */
  extraRules?: number[][]
  /** Dimensione del mazzo ipotetico (riempimento con carte vuote); ignorata se ≤ al totale. */
  assumedDeckSize?: number | null
}

export interface HandCardRef {
  id: number
  n: number
}

export interface HandExample {
  cards: HandCardRef[]
  /** Carte di riempimento (vuote o non-engine) nella mano. */
  fill: number
  p: number
}

export interface HandResult {
  handSize: number
  deckSize: number
  /** Carte vuote aggiunte dal mazzo ipotetico. */
  blanks: number
  playable: number
  brick: number
  /** Probabilità di avere j carte engine in mano, j = 0..handSize. */
  engineHist: number[]
  /** Mani brick più probabili (raggruppate per tipo di carta). */
  topBricks: HandExample[]
  /** P(almeno una copia) per ogni carta del mazzo. */
  cardOdds: { id: number; count: number; p: number }[]
  /** P(almeno una carta con il ruolo) per ruolo. */
  roleOdds: { role: string; copies: number; p: number }[]
  /** Quante regole PLAYABLE (minimali) sono state usate. */
  ruleCount: number
}

export interface SensitivityItem {
  /** 0 = una carta vuota/non-engine generica ("riempimento"). */
  id: number
  count: number
  /** Variazione di playable (punti percentuali, 0-100) con una copia in meno; null se non applicabile. */
  minus: number | null
  /** Idem con una copia in più; null se non applicabile (già 3 copie). */
  plus: number | null
}

export interface TournamentResult {
  rounds: number
  /** Probabilità di brick in ogni round. */
  roundBrick: number[]
  expectedBricks: number
  expectedPlayable: number
  pNone: number
  pAtLeast1: number
  k: number
  pAtLeastK: number
  /** pmf[j] = P(esattamente j brick), j = 0..rounds. */
  pmf: number[]
}

export type TournamentPlan = 'first' | 'second' | 'mixed'
