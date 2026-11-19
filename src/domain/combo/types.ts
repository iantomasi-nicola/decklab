/** Tipi del formato `combolab.combo` v1 — fonte di verità (spec: docs/COMBO_FORMAT.md). Contratto condiviso: non cambiare senza coordinarsi. */
import type { Localized, Rules } from '../types'

export type Uid = string // "u1".. giocatore, "o1".. avversario
export type PlayerIdx = 0 | 1

export type Loc = 'deck' | 'hand' | 'extra' | 'gy' | 'banished' | 'mzone' | 'emz' | 'szone' | 'fzone' | 'overlay'
export type Position = 'FACEUP_ATK' | 'FACEUP_DEF' | 'FACEDOWN_DEF' | 'FACEUP' | 'FACEDOWN'

export interface Place {
  p?: PlayerIdx // omesso = 0 (giocatore)
  loc: Loc
  seq?: number // mzone/szone 0-4, emz 0-1, overlay: indice, deck: 0 = cima
  pos?: Position
  host?: Uid // solo overlay: mostro Xyz ospitante
}

export interface BoardPlacement { uid: Uid; place: Place }
export interface Board {
  lp: number
  places: BoardPlacement[]
  counters?: Record<Uid, Record<string, number>>
}

export type ActionKind =
  | 'normalSummon' | 'tributeSummon' | 'setMonster' | 'flipSummon' | 'specialSummon'
  | 'activate' | 'setSpellTrap' | 'chainActivate'
  | 'search' | 'draw' | 'discard' | 'sendToGY' | 'banish' | 'returnToHand' | 'returnToDeck' | 'destroy' | 'detach' | 'shuffle'
  | 'changePosition' | 'equip' | 'attach' | 'placeCounter' | 'changeLP'
  | 'attack' | 'enterPhase' | 'endTurn'
  | 'resolve' | 'declare' | 'choice' | 'custom'

export type SummonMethod = 'fusion' | 'synchro' | 'xyz' | 'link' | 'ritual' | 'pendulum' | 'effect' | 'procedure' | 'other'
export type MoveWhy =
  | 'summon' | 'tribute' | 'material' | 'cost' | 'search' | 'draw' | 'discard' | 'destroy' | 'send'
  | 'banish' | 'return' | 'set' | 'flip' | 'position' | 'equip' | 'shuffle' | 'other'
export type EffectKind = 'activation' | 'ignition' | 'trigger' | 'quick' | 'continuous' | 'summon-proc' | 'other'

export interface Move { uid: Uid; from?: Place; to: Place; why?: MoveWhy }

export interface Step {
  id: string
  action: ActionKind
  method?: SummonMethod
  label?: string // solo action 'custom'
  card?: Uid
  effect?: { kind: EffectKind; index?: number }
  from?: Place
  to?: Place
  targets?: Uid[]
  costs?: { kind: string; cards: Uid[] }[]
  searched?: Uid[]
  moves: Move[] // effetto sullo stato (obbligatorio, può essere [])
  lp?: { p: PlayerIdx; delta: number }[]
  counters?: { uid: Uid; type: string; delta: number }[]
  chain?: { id: string; link: number }
  ref?: string // solo 'resolve': id del passo risolto
  group?: string
  phase?: 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end'
  note?: Localized
  optional?: boolean
  x?: Record<string, unknown>
}

export type InterruptMode = 'ask' | 'auto-first' | 'auto-selected' | 'never'
export interface Interrupt {
  uid: Uid
  mode: InterruptMode
  when?: { card: number }[]
  target: 'manual' | 'priority'
  priority?: number[]
}

export interface Branch {
  id: string
  title?: Localized
  condition: { afterStep: string; window: 'activation' | 'resolution'; opponent: { code: number; effect?: number } }
  steps: Step[]
  rejoin: string | null
  endboard?: Endboard | null
  note?: Localized
}

export interface Endboard { own: Board; opponent?: Board; summary?: Localized; hash?: string }

export interface ComboDoc {
  format: 'combolab.combo'
  v: 1
  meta: {
    id: string
    title: Localized
    scope: 'variant' | 'archetype'
    archetype: { id?: string; name: Localized }
    variant: { id?: string; name: Localized } | null
    rules: Rules
    banlist: { format: string; id: string }
    tags: string[]
    noteLang: string[]
    favorite: boolean
    createdAt: string
    updatedAt: string
    author?: string
    source: 'manual' | 'engine' | 'import'
    /** Se la combo è una variante creata da un'altra "da questo passo": id della combo madre e ultimo passo copiato (null = dallo stato iniziale). */
    derivedFrom?: { comboId: string; afterStep: string | null; title?: Localized }
  }
  deck: { main: number[]; extra: number[]; side: number[]; ydke?: string }
  cards: Record<Uid, number> // uid → passcode
  setup: {
    first: boolean
    hand: { required: Uid[]; size: number; fill: 'random' | 'none' }
    own?: Board
    opponent?: { board?: Board; interrupts?: Interrupt[] }
  }
  steps: Step[]
  branches: Branch[]
  endboard?: Endboard
  engine?: { core: string; scriptsCommit: string; cdbVersion: string; mode: string; seed: number[]; responses: string[] }
  x?: Record<string, unknown>
}
