/**
 * Host del motore: possiede core, dataset carte, script e sessione, e implementa il protocollo (`handle`).
 * Neutro rispetto all'ambiente: il Worker (src/workers/engine.worker.ts) e i test in Node lo istanziano con sorgenti diverse.
 */
import type { Card } from '@/domain/types'
import { makeCardReader } from './cards'
import { CORE_API, CORE_ID, ENGINE_MODE, SCRIPTS_COMMIT } from './constants'
import { loadCore, type OcgCoreSync } from './core'
import { DuelSession, EngineError } from './session'
import { ScriptStore } from './scripts'
import type { EngineEvent, EngineRequest, InitOptions, InitResult } from './protocol'
import type { ComboDoc } from '@/domain/combo/types'
import { encodeAnswers } from './codec'

export interface HostSources {
  /** binario wasm (nel Worker: fetch cache-first dell'asset di build) */
  loadWasm(options: InitOptions): Promise<ArrayBuffer>
  /** dataset carte (nel Worker: loadManifest + loadCards da /data/) */
  loadCards(options: InitOptions): Promise<{ cards: Card[]; version: string }>
  /** archivio script (nel Worker: ScriptStore con Cache Storage) */
  makeScripts(options: InitOptions, onProgress: (done: number, total: number) => void): ScriptStore
  onEvent?: (e: EngineEvent) => void
}

export class EngineHost {
  private core: OcgCoreSync | null = null
  private cards = new Map<number, Card>()
  private scripts: ScriptStore | null = null
  private session: DuelSession | null = null
  private cdbVersion = ''

  constructor(private readonly src: HostSources) {}

  async init(options: InitOptions = {}): Promise<InitResult> {
    if (!this.core) {
      const [wasm, data] = await Promise.all([this.src.loadWasm(options), this.src.loadCards(options)])
      this.core = await loadCore(wasm)
      this.cards = new Map(data.cards.map((c) => [c.id, c]))
      this.cdbVersion = data.version
      this.scripts = this.src.makeScripts(options, (done, total) => this.src.onEvent?.({ event: 'scripts', done, total }))
    }
    return { core: CORE_ID, api: this.core.getVersion() ?? CORE_API, scriptsCommit: SCRIPTS_COMMIT, cdbVersion: this.cdbVersion, cards: this.cards.size }
  }

  private ensure(): { core: OcgCoreSync; scripts: ScriptStore } {
    if (!this.core || !this.scripts) throw new EngineError('Motore non inizializzato (init)', 'bad-request')
    return { core: this.core, scripts: this.scripts }
  }

  private newSession(): DuelSession {
    const { core, scripts } = this.ensure()
    return new DuelSession({
      core, scripts,
      cardReader: makeCardReader(this.cards),
      cardType: (code) => this.cards.get(code)?.type ?? 0,
      ...(this.src.onEvent ? { onEvent: this.src.onEvent } : {}),
    })
  }

  /** Blocco `engine` del combo per il duello corrente (seed, ordine del mazzo, risposte applicate). */
  engineBlock(): NonNullable<ComboDoc['engine']> {
    const s = this.session
    if (!s || !s.startRequest || !s.duelPlan) throw new EngineError('Nessun duello avviato', 'no-duel')
    return {
      core: CORE_ID, scriptsCommit: SCRIPTS_COMMIT, cdbVersion: this.cdbVersion, mode: ENGINE_MODE,
      seed: [s.startRequest.seed, ...s.deckOrder()],
      responses: encodeAnswers(s.appliedAnswers),
    }
  }

  async handle(req: EngineRequest): Promise<unknown> {
    switch (req.op) {
      case 'init': return this.init(req.options)
      case 'startDuel': {
        this.ensure()
        const next = this.newSession()
        const state = await next.start(req.req)
        this.session = next
        return state
      }
      case 'respond': return this.sess().respond(req.answer)
      case 'undo': return this.sess().undo()
      case 'redo': return this.sess().redo()
      case 'replay': return this.sess().replay(req.answers)
      case 'snapshot': return this.sess().snapshot()
      case 'preload': await this.ensure().scripts.preload(req.codes); return null
      case 'dispose': this.session = null; return null
    }
  }

  private sess(): DuelSession {
    if (!this.session) throw new EngineError('Nessun duello avviato', 'no-duel')
    return this.session
  }
}
