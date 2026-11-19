/** Sorgenti del motore per il browser (solo Worker): wasm da asset di build (cache-first), dataset da /data/, script da GitHub. */
import wasmAssetUrl from '../../node_modules/@n1xx1/ocgcore-wasm/lib/ocgcore.sync.wasm?url'
import { loadCards, loadManifest } from '@/domain/cards/loadCards'
import { fetchWasm } from './core'
import { pruneOldScriptCaches, ScriptStore } from './scripts'
import type { EngineEvent } from './protocol'
import type { HostSources } from './host'

export function browserSources(onEvent: (e: EngineEvent) => void): HostSources {
  return {
    loadWasm: (o) => fetchWasm(o.wasmUrl ?? wasmAssetUrl),
    async loadCards(o) {
      const base = o.dataBaseUrl ?? '/data/'
      const m = await loadManifest(base)
      return { cards: await loadCards(m, base), version: m.version }
    },
    makeScripts(o, onProgress) {
      void pruneOldScriptCaches()
      return new ScriptStore({ ...(o.scriptsBaseUrl ? { baseUrl: o.scriptsBaseUrl } : {}), onProgress })
    },
    onEvent,
  }
}
