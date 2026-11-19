// Download con cache locale e rate limit (YGOPRODeck: max 20 req/s, superato = ban di 1 ora).
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

const UA = 'combo-lab-data-build/1.0'
let lastApiCall = 0
const API_MIN_GAP_MS = 1000 // ben sotto 20 req/s: ne facciamo ~4 in tutto

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

/** Scarica `url` in `dest` (se non esiste già o se `refresh`). Restituisce il Buffer. */
export async function download(url, dest, { refresh = false, api = false } = {}) {
  if (!refresh && (await exists(dest))) return readFile(dest)
  if (api) {
    const wait = lastApiCall + API_MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastApiCall = Date.now()
  }
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buf)
  return buf
}

export async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`)
  return res.json()
}
