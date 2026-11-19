/** Client della ricerca: parla con cards.worker.ts (o, dove i Worker non esistono, esegue lo stesso motore in-thread). */
import type { Card } from '@/domain/types'
import type { SearchRuntime, WorkerRequest, WorkerResponse } from '@/domain/cards/searchRuntime'
import type { SearchOptions } from '@/domain/cards/searchEngine'

type Call = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never

interface Backend {
  call<T>(req: Call): Promise<T>
}

let backend: Backend | undefined

function workerBackend(): Backend {
  const worker = new Worker(new URL('../../workers/cards.worker.ts', import.meta.url), { type: 'module' })
  let seq = 0
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const w = waiting.get(e.data.id)
    if (!w) return
    waiting.delete(e.data.id)
    if (e.data.ok) w.resolve(e.data.result)
    else w.reject(new Error(e.data.error))
  }
  worker.onerror = (e) => {
    for (const w of waiting.values()) w.reject(new Error(e.message || 'Worker di ricerca non disponibile'))
    waiting.clear()
  }
  return {
    call: (req) =>
      new Promise((resolve, reject) => {
        const id = ++seq
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
        worker.postMessage({ ...req, id } as WorkerRequest)
      }),
  }
}

/** Senza Worker (test, ambienti vecchi): stesso motore sul thread corrente, caricato solo se serve (non entra nel bundle principale). */
function inThreadBackend(runtime?: SearchRuntime): Backend {
  let rt = runtime
  return {
    call: async <T>(req: Call) => {
      rt ??= (await import('@/domain/cards/searchRuntime')).createSearchRuntime()
      return (req.type === 'init' ? await rt.init(req.url) : rt.search(req.query, req.opts)) as T
    },
  }
}

const getBackend = (): Backend => (backend ??= typeof Worker === 'undefined' ? inThreadBackend() : workerBackend())

/** Solo test: sostituisce il backend (es. runtime in-thread con fetch finto). */
export function __setSearchBackendForTests(runtime: SearchRuntime | undefined) {
  backend = runtime ? inThreadBackend(runtime) : undefined
  initKey = undefined
  initPromise = undefined
}

let initKey: string | undefined
let initPromise: Promise<{ size: number; ms: number }> | undefined

/** Avvia (una sola volta per URL) il download + indicizzazione nel worker. */
export function initSearchIndex(cardsUrl: string): Promise<{ size: number; ms: number }> {
  if (initPromise && initKey === cardsUrl) return initPromise
  initKey = cardsUrl
  const p = getBackend().call<{ size: number; ms: number }>({ type: 'init', url: cardsUrl })
  initPromise = p
  p.catch(() => {
    if (initPromise === p) initPromise = initKey = undefined
  })
  return p
}

export async function runSearch(query: string, opts?: SearchOptions): Promise<Card[]> {
  if (initPromise) await initPromise
  return getBackend().call<Card[]>({ type: 'search', query, ...(opts ? { opts } : {}) })
}
