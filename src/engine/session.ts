/**
 * Sessione di duello: `duello = seed + setup + risposte`.
 * - risposte = quelle del giocatore + quelle AUTOMATICHE (registrate con flag `auto`: scelte uniche, finestre vuote…), così i
 *   replay non dipendono dalle impostazioni; quelle dell'avversario sono funzione pura dei messaggi e si rigiocano da sole;
 * - undo/redo spostano un indice saltando le risposte automatiche; non serve il core: lo stato viene dal log dei messaggi;
 * - ogni `respond` ricrea il duello e rigioca (25-40 ms); se uno script manca lo scarica e rigioca da capo, in modo trasparente.
 */
import type { OcgCardData } from '@n1xx1/ocgcore-wasm'
import type { OcgCoreSync } from './core'
import { sameAnswer } from './codec'
import { buildPlan, isRequest, runDuel, type DuelPlan, type RunResult } from './duel'
import { normalizeDuel } from './normalize'
import { autoAnswer, passOpponent } from './policy'
import { shuffleDeck } from './prng'
import { describeRequest } from './requests'
import {
  DEFAULT_AUTO, type Answer, type AutoSettings, type DuelSnapshot, type DuelState, type EngineErrorCode, type EngineEvent, type EngineMessage,
  type StartDuelRequest,
} from './protocol'
import type { ScriptStore } from './scripts'

const MAX_PASSES = 40

export class EngineError extends Error {
  constructor(message: string, readonly code: EngineErrorCode) { super(message) }
}

export interface SessionDeps {
  core: OcgCoreSync
  cardReader: (code: number) => OcgCardData | null
  /** bitmask tipo (cdb) per metodo di evocazione/tipo effetto nel normalizzatore */
  cardType: (code: number) => number
  scripts: ScriptStore
  onEvent?: (e: EngineEvent) => void
  opponentPolicy?: (req: EngineMessage) => Answer | null
  /** passcode che soddisfano gli opcode di ANNOUNCE_CARD */
  matchCodes?: (opcodes: unknown[]) => { codes: number[]; truncated: boolean }
}

interface Entry { answer: Answer; auto: boolean }

export class DuelSession {
  private req: StartDuelRequest | null = null
  private plan: DuelPlan | null = null
  private auto: AutoSettings = DEFAULT_AUTO
  /** cronologia completa (anche la parte annullata) */
  private entries: Entry[] = []
  /** logAll.length === entries.length + 1 */
  private logAll: EngineMessage[][] = [[]]
  /** risposte applicate; sta sempre su un confine: la prossima risposta (se c'è) è dell'utente */
  private pos = 0
  private endedFull = false
  private errors: string[] = []
  private readonly policy: (req: EngineMessage) => Answer | null

  constructor(private readonly d: SessionDeps) {
    this.policy = d.opponentPolicy ?? passOpponent
  }

  get started(): boolean { return this.req !== null }
  get startRequest(): StartDuelRequest | null { return this.req }
  get duelPlan(): DuelPlan | null { return this.plan }
  get applied(): { answer: Answer; auto: boolean }[] { return this.entries.slice(0, this.pos) }
  /** Ordine effettivo del mazzo (indici di `deck.main`, 0 = cima) usato dal duello. */
  deckOrder(): number[] {
    const { req } = this.need()
    return req.deckOrder ?? shuffleDeck(req.seed, req.deck.main.length)
  }

  /** Passcode di cui servono gli script: mazzo, extra, carte del setup (board avversario, mano). */
  static codesOf(req: StartDuelRequest): number[] {
    const s = new Set<number>([...req.deck.main, ...req.deck.extra])
    for (const c of Object.values(req.cards ?? {})) s.add(c)
    return [...s]
  }

  async start(req: StartDuelRequest): Promise<DuelState> {
    const plan = buildPlan(req) // lancia su setup incoerente, prima di toccare lo stato
    this.auto = { ...DEFAULT_AUTO, ...(req.auto ?? {}) }
    await this.d.scripts.preload(DuelSession.codesOf(req))
    const run = await this.play(plan, [])
    this.req = req
    this.plan = plan
    this.setEntries(run.result, [])
    this.pos = this.entries.length
    return this.state(run.replays, run.result.log[0] ?? [], this.entries.length)
  }

  /** Ricrea il duello (stesso seed/setup) e rigioca `answers`; sostituisce la cronologia. */
  async replay(answers: readonly Answer[], auto: readonly boolean[] = []): Promise<DuelState> {
    const { plan } = this.need()
    const run = await this.play(plan, answers)
    if (run.result.diverged || run.result.consumed < answers.length) throw new EngineError('Le risposte non sono più valide per questo duello (script o motore cambiati)', 'invalid-answer')
    this.setEntries(run.result, answers.map((_, i) => auto[i] === true))
    this.pos = this.entries.length
    return this.state(run.replays, [], this.entries.length - answers.length)
  }

  async respond(answer: Answer): Promise<DuelState> {
    const { plan } = this.need()
    // risposta uguale alla prossima annullata = ripeti, senza toccare il core
    if (this.pos < this.entries.length && !this.entries[this.pos]!.auto && sameAnswer(this.entries[this.pos]!.answer, answer)) return this.redo()
    const keep = this.entries.slice(0, this.pos)
    const next = [...keep.map((e) => e.answer), answer]
    const run = await this.play(plan, next)
    if (run.result.diverged || run.result.consumed < next.length) throw new EngineError('Risposta non valida per la richiesta corrente', 'invalid-answer')
    this.setEntries(run.result, [...keep.map((e) => e.auto), false])
    this.pos = this.entries.length
    return this.state(run.replays, run.result.log[next.length] ?? [], this.entries.length - next.length)
  }

  undo(): DuelState {
    this.need()
    for (let j = this.pos - 1; j >= 0; j--) if (!this.entries[j]!.auto) { this.pos = j; break }
    return this.state(0, [], 0)
  }

  redo(): DuelState {
    this.need()
    if (this.pos < this.entries.length) {
      const from = this.pos
      let p = from + 1
      while (p < this.entries.length && this.entries[p]!.auto) p++
      this.pos = p
      return this.state(0, this.logAll.slice(from + 1, p + 1).flat(), 0)
    }
    return this.state(0, [], 0)
  }

  snapshot(): DuelSnapshot {
    const { req } = this.need()
    return {
      piles: this.state(0, [], 0).piles,
      seed: req.seed,
      answers: this.entries.slice(0, this.pos).map((e) => e.answer),
      auto: this.entries.slice(0, this.pos).map((e) => e.auto),
      log: this.logAll.slice(0, this.pos + 1),
      redo: this.entries.slice(this.pos).map((e) => ({ answer: e.answer, auto: e.auto })),
    }
  }

  // ---------------------------------------------------------------- interni

  private need(): { req: StartDuelRequest; plan: DuelPlan } {
    if (!this.req || !this.plan) throw new EngineError('Nessun duello avviato', 'no-duel')
    return { req: this.req, plan: this.plan }
  }

  /** Registra il risultato di un passaggio: `flags` = flag auto delle risposte date, le prodotte in più sono automatiche. */
  private setEntries(r: RunResult, flags: boolean[]): void {
    this.entries = r.entries.map((answer, i) => ({ answer, auto: i < flags.length ? flags[i]! : true }))
    this.logAll = r.log
    this.endedFull = r.ended
    this.errors = r.errors
  }

  /** Un passaggio con "rigioca da capo" automatico finché gli script mancanti non sono stati scaricati. */
  private async play(plan: DuelPlan, answers: readonly Answer[]): Promise<{ result: RunResult; replays: number }> {
    const { scripts } = this.d
    let replays = 0
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      scripts.clearMissing()
      const result = runDuel({
        lib: this.d.core, plan, cardReader: this.d.cardReader, scripts, answers,
        opponentPolicy: this.policy, autoPolicy: (m) => autoAnswer(m, this.auto),
      })
      const missing = scripts.missing
      if (missing.length === 0) return { result, replays }
      this.d.onEvent?.({ event: 'replaying', reason: 'missing-scripts', missing: missing.length })
      try {
        await scripts.fetchMissing()
      } catch (e) {
        throw new EngineError(e instanceof Error ? e.message : String(e), 'script-fetch')
      }
      replays++
    }
    throw new EngineError('Troppe passate per caricare gli script', 'script-fetch')
  }

  private state(replays: number, delta: EngineMessage[], autoApplied: number): DuelState {
    const { req, plan } = this.need()
    const log = this.logAll.slice(0, this.pos + 1)
    const answers = this.entries.slice(0, this.pos).map((e) => e.answer)
    const atEnd = this.pos === this.entries.length
    const last = log[log.length - 1] ?? []
    const ended = atEnd && this.endedFull
    const raw = ended ? null : [...last].reverse().find(isRequest) ?? null
    const norm = normalizeDuel({ plan, log, answers, cards: req.cards ?? {}, cardType: this.d.cardType })
    const pending = raw ? describeRequest(raw, { outP: norm.outP, ref: norm.ref, matchCodes: this.d.matchCodes ?? (() => ({ codes: [], truncated: false })) }) : null
    return {
      delta,
      pending,
      position: this.pos,
      total: this.entries.length,
      autoApplied,
      canUndo: this.entries.slice(0, this.pos).some((e) => !e.auto),
      canRedo: this.pos < this.entries.length,
      ended,
      steps: norm.steps,
      cards: norm.cards,
      requiredHand: norm.requiredHand,
      endboard: norm.endboard,
      lp: norm.lp,
      piles: norm.piles,
      replays,
      errors: this.errors,
    }
  }
}
