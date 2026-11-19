/**
 * Sessione di duello: `duello = seed + setup + risposte`.
 * - risposte = solo quelle del giocatore (quelle automatiche dell'avversario sono funzione pura dei messaggi e si rigiocano);
 * - undo/redo spostano un indice (nessun core necessario: lo stato viene dal log dei messaggi);
 * - ogni `respond` ricrea il duello e rigioca (25-40 ms); se uno script manca lo scarica e rigioca da capo, in modo trasparente.
 */
import type { OcgCardData } from '@n1xx1/ocgcore-wasm'
import type { OcgCoreSync } from './core'
import { sameAnswer } from './codec'
import { buildPlan, isRequest, runDuel, type DuelPlan, type RunResult } from './duel'
import { normalizeDuel } from './normalize'
import { passOpponent } from './policy'
import { shuffleDeck } from './prng'
import type { Answer, DuelSnapshot, DuelState, EngineErrorCode, EngineEvent, EngineMessage, StartDuelRequest } from './protocol'
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
}

export class DuelSession {
  private req: StartDuelRequest | null = null
  private plan: DuelPlan | null = null
  private answers: Answer[] = []
  /** log completo (anche della parte annullata): logAll.length === answers.length + 1 */
  private logAll: EngineMessage[][] = [[]]
  private pos = 0
  private endedFull = false
  private errors: string[] = []
  private readonly policy: (req: EngineMessage) => Answer | null

  constructor(private readonly d: SessionDeps) {
    this.policy = d.opponentPolicy ?? passOpponent
  }

  get started(): boolean { return this.req !== null }
  get startRequest(): StartDuelRequest | null { return this.req }
  get appliedAnswers(): Answer[] { return this.answers.slice(0, this.pos) }
  get duelPlan(): DuelPlan | null { return this.plan }
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
    await this.d.scripts.preload(DuelSession.codesOf(req))
    const run = await this.play(plan, [])
    this.req = req
    this.plan = plan
    this.answers = []
    this.logAll = run.result.log
    this.pos = 0
    this.endedFull = run.result.ended
    this.errors = run.result.errors
    return this.state(run.replays, run.result.log[0] ?? [])
  }

  /** Ricrea il duello (stesso seed/setup) e rigioca `answers`; sostituisce la cronologia. */
  async replay(answers: readonly Answer[]): Promise<DuelState> {
    const { plan } = this.need()
    const run = await this.play(plan, answers)
    if (run.result.diverged || run.result.consumed < answers.length) throw new EngineError('Le risposte non sono più valide per questo duello (script o motore cambiati)', 'invalid-answer')
    this.answers = [...answers]
    this.logAll = run.result.log
    this.pos = answers.length
    this.endedFull = run.result.ended
    this.errors = run.result.errors
    return this.state(run.replays, run.result.log[this.pos] ?? [])
  }

  async respond(answer: Answer): Promise<DuelState> {
    const { plan } = this.need()
    // risposta uguale alla prossima annullata = ripeti, senza toccare il core
    if (this.pos < this.answers.length && sameAnswer(this.answers[this.pos]!, answer)) return this.redo()
    const next = [...this.answers.slice(0, this.pos), answer]
    const run = await this.play(plan, next)
    if (run.result.diverged || run.result.consumed < next.length) throw new EngineError('Risposta non valida per la richiesta corrente', 'invalid-answer')
    this.answers = next
    this.logAll = run.result.log
    this.pos = next.length
    this.endedFull = run.result.ended
    this.errors = run.result.errors
    return this.state(run.replays, run.result.log[this.pos] ?? [])
  }

  undo(): DuelState {
    this.need()
    if (this.pos > 0) this.pos--
    return this.state(0, [])
  }

  redo(): DuelState {
    this.need()
    if (this.pos < this.answers.length) this.pos++
    return this.state(0, this.logAll[this.pos] ?? [])
  }

  snapshot(): DuelSnapshot {
    const { req } = this.need()
    return {
      seed: req.seed,
      answers: this.answers.slice(0, this.pos),
      log: this.logAll.slice(0, this.pos + 1),
      redo: this.answers.slice(this.pos).reverse(),
    }
  }

  // ---------------------------------------------------------------- interni

  private need(): { req: StartDuelRequest; plan: DuelPlan } {
    if (!this.req || !this.plan) throw new EngineError('Nessun duello avviato', 'no-duel')
    return { req: this.req, plan: this.plan }
  }

  /** Un passaggio con "rigioca da capo" automatico finché gli script mancanti non sono stati scaricati. */
  private async play(plan: DuelPlan, answers: readonly Answer[]): Promise<{ result: RunResult; replays: number }> {
    const { scripts } = this.d
    let replays = 0
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      scripts.clearMissing()
      const result = runDuel({
        lib: this.d.core, plan, cardReader: this.d.cardReader, scripts, answers, opponentPolicy: this.policy,
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

  private state(replays: number, delta: EngineMessage[]): DuelState {
    const { req, plan } = this.need()
    const log = this.logAll.slice(0, this.pos + 1)
    const answers = this.answers.slice(0, this.pos)
    const atEnd = this.pos === this.answers.length
    const last = log[log.length - 1] ?? []
    const ended = atEnd && this.endedFull
    const pending = ended ? null : [...last].reverse().find(isRequest) ?? null
    const norm = normalizeDuel({ plan, log, answers, cards: req.cards ?? {}, cardType: this.d.cardType })
    return {
      delta,
      pending,
      position: this.pos,
      total: this.answers.length,
      canUndo: this.pos > 0,
      canRedo: this.pos < this.answers.length,
      ended,
      steps: norm.steps,
      cards: norm.cards,
      requiredHand: norm.requiredHand,
      endboard: norm.endboard,
      lp: norm.lp,
      replays,
      errors: this.errors,
    }
  }
}
