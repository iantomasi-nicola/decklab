// Script store: sync in-memory cache for scriptReader; misses recorded, fetched async, duel replayed.
export const COMMIT = '5b613bfc3c122f48238e32f85015b32892577a42'
// jsDelivr@sha answers 403 on ~16% of files (package >50MB) -> use raw.githubusercontent.com with the pinned sha.
export const BASE = `https://raw.githubusercontent.com/ProjectIgnis/CardScripts/${COMMIT}/`
export const BASE_JSDELIVR = `https://cdn.jsdelivr.net/gh/ProjectIgnis/CardScripts@${COMMIT}/`
// Sync cache in memory. Misses are recorded; caller fetches async and replays.
export class ScriptStore {
  constructor(base = BASE) { this.base = base; this.map = new Map(); this.missing = new Set(); this.notFound = new Set(); this.requested = [] ; this.bytes = 0; this.fetchMs = 0; this.statuses = {}; this.nf = {}; this.requests = 0 }
  urlFor(name) {
    const n = name.replace(/^\.\/script\//, '').replace(/^script\//, '')
    return n.match(/^c\d+\.lua$/) ? `official/${n}` : n
  }
  read(name) {
    this.requested.push(name)
    const k = this.urlFor(name)
    if (this.map.has(k)) return this.map.get(k)
    if (this.notFound.has(k)) return null
    this.missing.add(k)
    return null
  }
  async fetchMissing(concurrency = 8) {
    const todo = [...this.missing]; this.missing.clear()
    let i = 0
    const t0 = performance.now()
    const worker = async () => {
      while (i < todo.length) {
        const k = todo[i++]
        this.requests++
        const r = await fetch(this.base + k)
        if (r.status === 200) { const t = await r.text(); this.map.set(k, t); this.bytes += new TextEncoder().encode(t).length }
        else if (r.status === 404 || r.status === 403) { this.notFound.add(k); this.statuses[r.status] = (this.statuses[r.status] ?? 0) + 1; this.nf[k] = r.status }
        else throw new Error(`${k}: HTTP ${r.status}`)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    this.fetchMs += performance.now() - t0
    return todo
  }
}

