/** Client tipizzato del motore (main thread): promesse sopra il protocollo del Worker. Nessun lavoro pesante qui. */
import type { ComboDoc } from '@/domain/combo/types'
import type {
  Answer, DuelSnapshot, DuelState, EngineErrorCode, EngineEvent, EngineOut, EngineRequest, InitOptions, InitResult, StartDuelRequest,
} from './protocol'

export class EngineClientError extends Error {
  constructor(message: string, readonly code: EngineErrorCode | 'worker') { super(message) }
}

export interface EngineClient {
  init(options?: InitOptions): Promise<InitResult>
  startDuel(req: StartDuelRequest): Promise<DuelState>
  respond(answer: Answer): Promise<DuelState>
  undo(): Promise<DuelState>
  redo(): Promise<DuelState>
  replay(answers: Answer[], auto?: boolean[]): Promise<DuelState>
  /** Blocco `engine` del combo (core, scriptsCommit, seed+ordine mazzo, risposte) per il duello corrente. */
  engineBlock(): Promise<NonNullable<ComboDoc['engine']>>
  snapshot(): Promise<DuelSnapshot>
  preload(codes: number[]): Promise<void>
  dispose(): Promise<void>
  /** Eventi non richiesti: avanzamento script, "rigioca da capo". Restituisce la funzione per smettere di ascoltare. */
  onEvent(fn: (e: EngineEvent) => void): () => void
  /** Termina il Worker (le richieste in volo falliscono con code 'worker'). */
  terminate(): void
}

/** Crea il client su un Worker nuovo (o su uno dato, per i test). */
export function createEngineClient(worker: Worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' })): EngineClient {
  let seq = 0
  const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>()
  const listeners = new Set<(e: EngineEvent) => void>()

  const failAll = (msg: string) => {
    for (const w of waiting.values()) w.reject(new EngineClientError(msg, 'worker'))
    waiting.clear()
  }
  worker.onmessage = (ev: MessageEvent<EngineOut>) => {
    const m = ev.data
    if ('type' in m && m.type === 'event') {
      const { type: _t, ...e } = m
      for (const l of listeners) l(e as EngineEvent)
      return
    }
    if (!('id' in m)) return
    const w = waiting.get(m.id)
    if (!w) return
    waiting.delete(m.id)
    if (m.ok) w.resolve(m.result)
    else w.reject(new EngineClientError(m.error, m.code ?? 'core'))
  }
  worker.onerror = (e) => failAll(e.message || 'Errore nel worker del motore')
  worker.onmessageerror = () => failAll('Messaggio del worker non leggibile')

  const call = <T>(req: EngineRequest): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = ++seq
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
      worker.postMessage({ id, ...req })
    })

  return {
    init: (options) => call<InitResult>({ op: 'init', ...(options ? { options } : {}) }),
    startDuel: (req) => call<DuelState>({ op: 'startDuel', req }),
    respond: (answer) => call<DuelState>({ op: 'respond', answer }),
    undo: () => call<DuelState>({ op: 'undo' }),
    redo: () => call<DuelState>({ op: 'redo' }),
    replay: (answers, auto) => call<DuelState>({ op: 'replay', answers, ...(auto ? { auto } : {}) }),
    engineBlock: () => call<NonNullable<ComboDoc['engine']>>({ op: 'engineBlock' }),
    snapshot: () => call<DuelSnapshot>({ op: 'snapshot' }),
    preload: (codes) => call<null>({ op: 'preload', codes }).then(() => undefined),
    dispose: () => call<null>({ op: 'dispose' }).then(() => undefined),
    onEvent(fn) { listeners.add(fn); return () => void listeners.delete(fn) },
    terminate() { worker.terminate(); failAll('Worker terminato') },
  }
}
