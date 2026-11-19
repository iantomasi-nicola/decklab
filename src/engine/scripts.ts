/**
 * Caricatore di script Lua. Il `scriptReader` del core è SINCRONO: gli script devono essere già in memoria.
 * Quello che manca viene annotato in `missing` (e il duello va rigiocato da capo dopo `fetchMissing`).
 * - sorgente: raw.githubusercontent.com a commit fissato (jsDelivr incompleto, vedi SPIKE-ENGINE.md);
 * - cache negativa per i 404 (carte vanilla/token senza script) in memoria e in Cache Storage;
 * - Cache Storage con il commit nel nome; concorrenza 8.
 */
import {
  BASE_SCRIPT_FILES, KNOWN_ABSENT_SCRIPTS, SCRIPTS_BASE_URL, SCRIPTS_CACHE_NAME, SCRIPTS_CACHE_PREFIX, SCRIPTS_COMMIT, SCRIPT_CONCURRENCY,
} from './constants'

/** Percorso relativo alla radice del repository per un nome richiesto dal core (`./script/c123.lua`, `utility.lua`, …). */
export function scriptPath(name: string): string {
  const n = name.replace(/^\.\//, '').replace(/^script\//, '')
  return /^c\d+\.lua$/.test(n) ? `official/${n}` : n
}
export const cardScriptPath = (code: number) => `official/c${code}.lua`

export type FetchLike = (url: string) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>

export type PersistedScript = { status: 200; text: string } | { status: 404 }

/** Persistenza degli script scaricati (Cache Storage nel browser, cartella su disco nei test Node). */
export interface ScriptPersist {
  get(path: string): Promise<PersistedScript | null>
  put(path: string, v: PersistedScript): Promise<void>
}

/** Cache Storage: la risposta 404 salvata è un marcatore (cache negativa persistente). */
export function cacheStoragePersist(cacheName = SCRIPTS_CACHE_NAME, base = SCRIPTS_BASE_URL): ScriptPersist | null {
  if (typeof caches === 'undefined') return null
  let cachePromise: Promise<Cache> | null = null
  const open = () => (cachePromise ??= caches.open(cacheName))
  const key = (p: string) => new Request(base + p)
  return {
    async get(path) {
      try {
        const hit = await (await open()).match(key(path))
        if (!hit) return null
        return hit.status === 404 ? { status: 404 } : { status: 200, text: await hit.text() }
      } catch {
        return null
      }
    },
    async put(path, v) {
      try {
        const body = v.status === 200 ? v.text : ''
        await (await open()).put(key(path), new Response(body, { status: v.status, headers: { 'content-type': 'text/plain; charset=utf-8' } }))
      } catch {
        /* quota/modalità privata: si prosegue senza persistenza */
      }
    },
  }
}

/** Elimina le cache degli script di commit precedenti. */
export async function pruneOldScriptCaches(current = SCRIPTS_CACHE_NAME): Promise<void> {
  if (typeof caches === 'undefined') return
  for (const k of await caches.keys()) if (k.startsWith(SCRIPTS_CACHE_PREFIX) && k !== current) await caches.delete(k)
}

export interface ScriptStoreOptions {
  fetch?: FetchLike
  baseUrl?: string
  persist?: ScriptPersist | null
  concurrency?: number
  onProgress?: (done: number, total: number) => void
}

export class ScriptStore {
  private readonly map = new Map<string, string>()
  private readonly absent = new Set<string>(KNOWN_ABSENT_SCRIPTS)
  private readonly missingSet = new Set<string>()
  private readonly fetchFn: FetchLike
  private readonly baseUrl: string
  private readonly persist: ScriptPersist | null
  private readonly concurrency: number
  private readonly onProgress?: (done: number, total: number) => void
  /** statistiche (test e diagnostica) */
  stats = { network: 0, fromCache: 0, notFound: 0 }

  constructor(o: ScriptStoreOptions = {}) {
    this.fetchFn = o.fetch ?? ((u) => fetch(u))
    this.baseUrl = o.baseUrl ?? SCRIPTS_BASE_URL
    this.persist = o.persist === undefined ? cacheStoragePersist() : o.persist
    this.concurrency = o.concurrency ?? SCRIPT_CONCURRENCY
    this.onProgress = o.onProgress
  }

  get commit(): string { return SCRIPTS_COMMIT }
  get size(): number { return this.map.size }
  get missing(): string[] { return [...this.missingSet] }
  has(path: string): boolean { return this.map.has(path) || this.absent.has(path) }
  get(path: string): string | undefined { return this.map.get(path) }

  /** `scriptReader` sincrono del core: testo, oppure `null` (e se non lo conosciamo lo annota come mancante). */
  read = (name: string): string | null => {
    const p = scriptPath(name)
    const hit = this.map.get(p)
    if (hit !== undefined) return hit
    if (!this.absent.has(p)) this.missingSet.add(p)
    return null
  }

  clearMissing(): void { this.missingSet.clear() }

  /** Precarico unico: file di base + script di tutte le carte indicate (deck, extra, avversario), in un'unica ondata. */
  async preload(codes: Iterable<number>): Promise<void> {
    const paths = new Set<string>(BASE_SCRIPT_FILES)
    for (const c of codes) paths.add(cardScriptPath(c))
    await this.fetchPaths([...paths])
  }

  /** Scarica quanto annotato come mancante. Restituisce i percorsi richiesti (anche quelli risultati 404). */
  async fetchMissing(): Promise<string[]> {
    const todo = [...this.missingSet]
    this.missingSet.clear()
    await this.fetchPaths(todo)
    return todo
  }

  private async fetchPaths(paths: string[]): Promise<void> {
    const todo = paths.filter((p) => !this.map.has(p) && !this.absent.has(p))
    let i = 0
    let done = 0
    const worker = async () => {
      while (i < todo.length) {
        const p = todo[i++]!
        await this.fetchOne(p)
        this.onProgress?.(++done, todo.length)
      }
    }
    await Promise.all(Array.from({ length: Math.min(this.concurrency, todo.length) }, worker))
  }

  private async fetchOne(path: string): Promise<void> {
    const cached = await this.persist?.get(path)
    if (cached) {
      this.stats.fromCache++
      if (cached.status === 200) this.map.set(path, cached.text)
      else this.absent.add(path)
      return
    }
    this.stats.network++
    const res = await this.fetchFn(this.baseUrl + path)
    if (res.status === 200) {
      const text = await res.text()
      this.map.set(path, text)
      await this.persist?.put(path, { status: 200, text })
    } else if (res.status === 404) {
      this.stats.notFound++
      this.absent.add(path)
      await this.persist?.put(path, { status: 404 })
    } else {
      // 403/429/5xx: errore transitorio, NON si fa cache negativa (si vedrebbe come carta "senza script")
      throw new Error(`Script ${path}: HTTP ${res.status}`)
    }
  }
}
