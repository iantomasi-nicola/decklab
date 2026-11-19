/** Ciclo di vita del motore di ricerca: scarica le carte, costruisce l'indice, risponde. Condiviso da worker e fallback in-thread. */
import type { Card } from '../types'
import { decodeCards, type CardsFile } from './cardsFormat'
import { createSearchEngine, type SearchEngine, type SearchOptions } from './searchEngine'

export interface SearchRuntime {
  /** Scarica `url` (cards.<ver>.json) e costruisce l'indice; riusa quello esistente se l'URL non cambia. */
  init(url: string): Promise<{ size: number; ms: number }>
  search(query: string, opts?: SearchOptions): Card[]
}

export function createSearchRuntime(fetchFn: (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> = fetch): SearchRuntime {
  let engine: SearchEngine | undefined
  let loadedUrl: string | undefined
  let pending: Promise<{ size: number; ms: number }> | undefined
  return {
    init(url) {
      if (pending && loadedUrl === url) return pending
      loadedUrl = url
      pending = (async () => {
        const t0 = performance.now()
        const res = await fetchFn(url)
        if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`)
        engine = createSearchEngine(decodeCards((await res.json()) as CardsFile))
        return { size: engine.size, ms: Math.round(performance.now() - t0) }
      })()
      pending.catch(() => {
        if (loadedUrl === url) pending = loadedUrl = undefined
      })
      return pending
    },
    search(query, opts) {
      if (!engine) throw new Error('Indice di ricerca non pronto')
      return engine.search(query, opts)
    },
  }
}

/** Messaggi main ↔ worker. */
export type WorkerRequest =
  | { id: number; type: 'init'; url: string }
  | { id: number; type: 'search'; query: string; opts?: SearchOptions }
export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
