/**
 * Caricamento del core `@n1xx1/ocgcore-wasm` 0.1.6 in build SYNC (senza JSPI), con `wasmBinary` scaricato da noi:
 * evita il chunk JS da 1,28 MB (wasm in base64) e permette la cache-first del binario (~259 KB in brotli).
 * L'import usa dist/index.js tramite resolve.alias di vite.config.ts (mod.js non riesporta `default`).
 */
import createCore, { type OcgCoreSync } from '@n1xx1/ocgcore-wasm'
import { WASM_CACHE_NAME } from './constants'

export type { OcgCoreSync }

/** Binario wasm, cache-first (Cache Storage). L'URL degli asset di build contiene l'hash di contenuto: la cache non invecchia. */
export async function fetchWasm(url: string, f: (u: string) => Promise<Response> = (u) => fetch(u)): Promise<ArrayBuffer> {
  let cache: Cache | null = null
  try {
    if (typeof caches !== 'undefined') cache = await caches.open(WASM_CACHE_NAME)
    const hit = await cache?.match(url)
    if (hit) return await hit.arrayBuffer()
  } catch {
    cache = null
  }
  const res = await f(url)
  if (!res.ok) throw new Error(`wasm: HTTP ${res.status}`)
  const buf = await res.clone().arrayBuffer()
  try {
    await cache?.put(url, res)
  } catch {
    /* quota: nessuna cache */
  }
  return buf
}

export async function loadCore(wasmBinary: ArrayBuffer): Promise<OcgCoreSync> {
  return createCore({ sync: true, wasmBinary })
}

export { OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult, OcgMessageType, OcgResponseType, OcgPhase } from '@n1xx1/ocgcore-wasm'
