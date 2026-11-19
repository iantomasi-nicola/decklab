/**
 * Protocollo tipizzato UI ⇄ Web Worker del motore (src/workers/engine.worker.ts) e tipi condivisi.
 * Importa solo tipi: nessun runtime del core qui, così la UI può usarlo senza trascinare il wasm.
 *
 * Modello: `duello = seed + setup + [risposte]`. Annulla/ripeti spostano un indice sulle risposte; il core viene
 * ricostruito (ricreare + rigiocare, ~25-40 ms) solo alla prossima `respond`. Il log dei messaggi per risposta
 * (`log[i]` = messaggi prodotti dopo la risposta i, `log[0]` = avvio) permette di mostrare lo stato senza il core.
 */
import type { OcgMessage, OcgResponse } from '@n1xx1/ocgcore-wasm'
import type { ComboDoc, Endboard, Step, Uid } from '@/domain/combo/types'

/** Risposta del giocatore a una richiesta del core (tipo del pacchetto; può contenere bigint → vedi `codec.ts`). */
export type Answer = OcgResponse
/** Messaggio del core (richieste `SELECT_*`/`ANNOUNCE_*` comprese). */
export type EngineMessage = OcgMessage

/** Politica automatica del giocatore (le risposte automatiche vengono REGISTRATE: i replay non dipendono dalle impostazioni). */
export interface AutoSettings {
  /**
   * Finestre di risposta in catena/fasi (`SELECT_CHAIN` facoltativo):
   * 'always' = chiedi sempre (anche senza effetti attivabili, per "passa priorità"); 'ifCanRespond' = chiedi solo se hai effetti
   * attivabili; 'never' = passa sempre (restano le scelte obbligatorie). Default 'ifCanRespond'.
   */
  pause: 'always' | 'ifCanRespond' | 'never'
  /** Risolve da solo le scelte uniche (una sola carta/zona/posizione/opzione/dichiarazione valida). Default true. */
  single: boolean
  /** Accetta l'ordine proposto per `SORT_CARD`/`SORT_CHAIN`. Default true. */
  sort: boolean
}
export const DEFAULT_AUTO: AutoSettings = { pause: 'ifCanRespond', single: true, sort: true }

export interface StartDuelRequest {
  /** Mazzo del giocatore (passcode; l'indice nella lista identifica la copia fisica per `deckOrder`). */
  deck: { main: number[]; extra: number[] }
  /** `combo.cards`: uid → passcode (serve a `setup.hand.required` e alle carte di `setup.own/opponent`). */
  cards?: Record<Uid, number>
  /** `combo.setup`: mano richiesta, board iniziale, board avversario. `first=false` non ancora supportato (vedi docs). */
  setup: ComboDoc['setup']
  /** Seed numerico: governa la mescolata (`shuffleDeck`) e, derivato, il seed del core (casualità durante il duello). */
  seed: number
  /**
   * Ordine del mazzo: permutazione degli indici di `deck.main` (posizione 0 = cima). Assente = `shuffleDeck(seed)`.
   * Le carte di `setup.hand.required` vengono comunque portate in cima.
   */
  deckOrder?: number[]
  /** Politica automatica (default `DEFAULT_AUTO`). */
  auto?: Partial<AutoSettings>
}

export type { PendingRequest } from './requests'
import type { PendingRequest } from './requests'

export interface DuelState {
  /** Messaggi prodotti dall'ultima operazione (per animazioni/log incrementali). */
  delta: EngineMessage[]
  /** Richiesta a cui il giocatore deve rispondere (null se il duello è finito). */
  pending: PendingRequest | null
  /** Risposte applicate (utente + automatiche) = posizione nella cronologia. */
  position: number
  /** Risposte totali nella cronologia (applicate + ripristinabili con `redo`). */
  total: number
  /** Risposte automatiche appena prodotte dall'ultima operazione (per un avviso/toast "saltato: …"). */
  autoApplied: number
  canUndo: boolean
  canRedo: boolean
  ended: boolean
  /** Passi normalizzati (formato combo) fino alla posizione corrente. */
  steps: Step[]
  /** uid → passcode usati dai passi (`combo.cards`, comprensivo di quelli assegnati dal normalizzatore). */
  cards: Record<Uid, number>
  /** `setup.hand.required` da salvare: mano richiesta + carte della mano iniziale usate dai passi. */
  requiredHand: Uid[]
  /** Campo (formato combo) alla posizione corrente, dallo stato del core. */
  endboard: Endboard
  lp: [number, number]
  /** Script mancanti scaricati con "rigioca da capo" durante questa operazione (0 = nessuna passata aggiuntiva). */
  replays: number
  /** Errori Lua/core ricevuti dall'`errorHandler` (diagnostica). */
  errors: string[]
}

export interface DuelSnapshot {
  seed: number
  /** Risposte applicate (utente + automatiche), in ordine: sono tutto ciò che serve a rigiocare. */
  answers: Answer[]
  /** `auto[i]` = la risposta i è stata data dalla politica automatica (undo/redo la saltano). */
  auto: boolean[]
  /** log[0] = messaggi di avvio, log[i] = messaggi dopo la risposta i (i ≥ 1). */
  log: EngineMessage[][]
  /** Risposte annullate, ripristinabili con `redo` (la prossima per prima). */
  redo: { answer: Answer; auto: boolean }[]
}

export interface InitOptions {
  /** URL del binario `ocgcore.sync.wasm` (default: asset di build). */
  wasmUrl?: string
  /** Base URL del dataset carte (default `/data/`). */
  dataBaseUrl?: string
  /** Base URL degli script (default: raw.githubusercontent.com al commit fissato). */
  scriptsBaseUrl?: string
}

export interface InitResult {
  core: string
  api: readonly [number, number]
  scriptsCommit: string
  cdbVersion: string
  cards: number
}

export type EngineRequest =
  | { op: 'init'; options?: InitOptions }
  | { op: 'startDuel'; req: StartDuelRequest }
  | { op: 'respond'; answer: Answer }
  | { op: 'undo' }
  | { op: 'redo' }
  /** Ricrea il duello (stesso seed/setup dell'ultimo `startDuel`) e rigioca le risposte date. */
  | { op: 'replay'; answers: Answer[]; auto?: boolean[] }
  /** Blocco `engine` del combo per il duello corrente. */
  | { op: 'engineBlock' }
  | { op: 'snapshot' }
  /** Scarica in anticipo gli script (file di base + carte indicate) senza avviare un duello. */
  | { op: 'preload'; codes: number[] }
  | { op: 'dispose' }

export type EngineRequestEnvelope = EngineRequest & { id: number }

export type EngineResultOf<R extends EngineRequest> =
  R extends { op: 'init' } ? InitResult
  : R extends { op: 'snapshot' } ? DuelSnapshot
  : R extends { op: 'engineBlock' } ? NonNullable<ComboDoc['engine']>
  : R extends { op: 'preload' | 'dispose' } ? null
  : DuelState

export type EngineResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; code?: EngineErrorCode }

export type EngineErrorCode = 'invalid-answer' | 'no-duel' | 'script-fetch' | 'core' | 'bad-request'

/** Eventi non richiesti dal worker (avanzamento scaricamento script). */
export type EngineEvent =
  | { event: 'scripts'; done: number; total: number }
  | { event: 'replaying'; reason: 'missing-scripts'; missing: number }

/** Cosa il worker invia alla UI: risposte (`id`) oppure eventi (`type: 'event'`). */
export type EngineOut = EngineResponse | ({ type: 'event' } & EngineEvent)
