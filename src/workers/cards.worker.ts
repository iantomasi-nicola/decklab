/// <reference lib="webworker" />
/** Web Worker della ricerca carte: l'indice MiniSearch vive qui, mai sul main thread. */
import { createSearchRuntime, type WorkerRequest, type WorkerResponse } from '@/domain/cards/searchRuntime'

const ctx = self as unknown as DedicatedWorkerGlobalScope
const runtime = createSearchRuntime()

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    const result = req.type === 'init' ? await runtime.init(req.url) : runtime.search(req.query, req.opts)
    ctx.postMessage({ id: req.id, ok: true, result } satisfies WorkerResponse)
  } catch (err) {
    ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
}
