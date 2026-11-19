/**
 * Duello automatico lato UI: possiede il client del motore (Worker), lo stato corrente e le preferenze.
 * Le operazioni sono SERIALIZZATE (una alla volta, nell'ordine di arrivo) e non bloccano mai il thread principale:
 * `busy` serve solo a mostrare l'avanzamento. Risposte automatiche, undo/redo che le saltano e "rigioca da capo"
 * sono del motore (src/engine); qui si traducono solo errori e avanzamento in stato per l'interfaccia.
 */
import { create } from 'zustand'
import type { EngineClient } from '@/engine/client'
import type { Answer, AutoSettings, DuelState, InitResult, StartDuelRequest } from '@/engine/protocol'
import { DEFAULT_AUTO } from '@/engine/protocol'
import { viewFromDuel, type AutoView } from './view'
import type { Uid } from '@/domain/combo/types'

export type DuelStatus = 'off' | 'loading' | 'running' | 'error'
export type DuelError =
  | { kind: 'script'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'worker'; message: string }
  | { kind: 'core'; message: string }

/** Indizio lasciato da un rilascio: la prossima richiesta di zona/bersaglio lo usa al posto di chiedere di nuovo. */
export interface DropHint { zone?: string; uid?: Uid }

interface DuelStore {
  status: DuelStatus
  busy: boolean
  /** scaricamento script (null = nessuno in corso) */
  load: { done: number; total: number } | null
  /** passate "rigioca da capo" in corso */
  replaying: number
  state: DuelState | null
  view: AutoView | null
  /** blocco `engine` del combo per lo stato corrente */
  engine: NonNullable<import('@/domain/combo/types').ComboDoc['engine']> | null
  init: InitResult | null
  error: DuelError | null
  /** passcode senza script / con errori Lua (carta non simulabile) */
  unsupported: number[]
  prefs: AutoSettings
  hint: DropHint | null
  /** contatore che cresce a ogni nuovo stato (chiave per animazioni/annunci) */
  tick: number

  setClientFactory: (f: (() => EngineClient) | null) => void
  setPrefs: (p: Partial<AutoSettings>) => void
  setHint: (h: DropHint | null) => void
  start: (req: Omit<StartDuelRequest, 'auto'>, replay?: { answers: Answer[]; auto?: boolean[] }) => Promise<boolean>
  respond: (a: Answer) => Promise<boolean>
  undo: () => Promise<void>
  redo: () => Promise<void>
  stop: () => Promise<void>
  clearError: () => void
}

const PREFS_KEY = 'combolab.duel.auto'
function readPrefs(): AutoSettings {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<AutoSettings> | null
    return {
      pause: v?.pause === 'always' || v?.pause === 'never' ? v.pause : DEFAULT_AUTO.pause,
      single: typeof v?.single === 'boolean' ? v.single : DEFAULT_AUTO.single,
      sort: typeof v?.sort === 'boolean' ? v.sort : DEFAULT_AUTO.sort,
    }
  } catch {
    return { ...DEFAULT_AUTO }
  }
}

let factory: (() => EngineClient) | null = null
let client: EngineClient | null = null
let unlisten: (() => void) | null = null
let chain: Promise<unknown> = Promise.resolve()

/** Codici delle carte con errori Lua nello script (c<passcode>.lua) dagli `errors` del core. */
export function unsupportedFromErrors(errors: readonly string[]): number[] {
  const out = new Set<number>()
  for (const e of errors) for (const m of e.matchAll(/c(\d{4,10})\.lua/g)) out.add(Number(m[1]))
  return [...out]
}

export const useDuel = create<DuelStore>((set, get) => {
  const getClient = async (): Promise<EngineClient> => {
    if (client) return client
    const mk = factory ?? (await import('@/engine/client')).createEngineClient
    client = mk()
    unlisten = client.onEvent((e) => {
      if (e.event === 'scripts') set({ load: e.done >= e.total ? null : { done: e.done, total: e.total } })
      else if (e.event === 'replaying') set({ replaying: e.missing })
    })
    return client
  }
  const fail = (e: unknown) => {
    const err = e as { message?: string; code?: string }
    const message = err?.message ?? String(e)
    const kind: DuelError['kind'] = err?.code === 'script-fetch' ? 'script' : err?.code === 'invalid-answer' ? 'invalid' : err?.code === 'worker' ? 'worker' : 'core'
    return { kind, message } as DuelError
  }
  /** Accoda un'operazione; `busy` resta acceso finché la coda non è vuota. */
  let pendingOps = 0
  const enqueue = <T,>(fn: () => Promise<T>): Promise<T> => {
    pendingOps++
    set({ busy: true })
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined).finally(() => {
      pendingOps--
      if (pendingOps === 0) set({ busy: false, load: null, replaying: 0 })
    })
    return run
  }
  const apply = async (c: EngineClient, d: DuelState) => {
    const engine = await c.engineBlock().catch(() => null)
    set((s) => ({
      state: d, view: viewFromDuel(d), engine: engine ?? s.engine, status: 'running', error: null, tick: s.tick + 1,
      unsupported: unsupportedFromErrors(d.errors), hint: d.pending && (d.pending.kind === 'idle' || d.pending.kind === 'battle') ? null : s.hint,
    }))
  }

  return {
    status: 'off', busy: false, load: null, replaying: 0, state: null, view: null, engine: null, init: null, error: null, unsupported: [],
    prefs: readPrefs(), hint: null, tick: 0,

    setClientFactory: (f) => {
      factory = f
      if (client) {
        unlisten?.()
        client.terminate()
        client = null
      }
    },
    setPrefs: (p) => {
      const prefs = { ...get().prefs, ...p }
      set({ prefs })
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
      } catch { /* storage non disponibile */ }
    },
    setHint: (hint) => set({ hint }),
    clearError: () => set({ error: null, status: get().state ? 'running' : 'off' }),

    start: (req, replay) =>
      enqueue(async () => {
        set({ status: 'loading', error: null, state: null, view: null, hint: null, unsupported: [] })
        try {
          const c = await getClient()
          const init = get().init ?? (await c.init())
          set({ init })
          let d = await c.startDuel({ ...req, auto: get().prefs })
          if (replay?.answers.length) d = await c.replay(replay.answers, replay.auto)
          await apply(c, d)
          return true
        } catch (e) {
          set({ status: 'error', error: fail(e) })
          return false
        }
      }),

    respond: (a) =>
      enqueue(async () => {
        try {
          const c = await getClient()
          await apply(c, await c.respond(a))
          return true
        } catch (e) {
          const err = fail(e)
          // risposta rifiutata: lo stato resta quello di prima, si avvisa e basta
          set(err.kind === 'invalid' ? { error: err } : { status: 'error', error: err })
          return false
        }
      }),

    undo: () => enqueue(async () => {
      try { const c = await getClient(); await apply(c, await c.undo()) } catch (e) { set({ status: 'error', error: fail(e) }) }
    }),
    redo: () => enqueue(async () => {
      try { const c = await getClient(); await apply(c, await c.redo()) } catch (e) { set({ status: 'error', error: fail(e) }) }
    }),

    stop: () =>
      enqueue(async () => {
        set({ status: 'off', state: null, view: null, engine: null, error: null, hint: null, unsupported: [] })
        try {
          await client?.dispose()
        } catch { /* nessun duello */ }
      }),
  }
})

/** Solo test/dev: azzera lo stato e il client. */
export function resetDuelForTests() {
  unlisten?.()
  client?.terminate()
  client = null
  factory = null
  chain = Promise.resolve()
  useDuel.setState({ status: 'off', busy: false, load: null, replaying: 0, state: null, view: null, engine: null, init: null, error: null, unsupported: [], hint: null, tick: 0 })
}
