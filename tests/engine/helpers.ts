/** Helper dei test del motore (Node): dataset carte da public/data, script con cache su disco, core sync da lib/*.wasm. */
import fs from 'node:fs'
import path from 'node:path'
import { decodeCards } from '../../src/domain/cards/cardsFormat'
import type { Card } from '../../src/domain/types'
import { ScriptStore, type FetchLike, type ScriptPersist } from '../../src/engine/scripts'
import { loadCore } from '../../src/engine/core'

const root = path.resolve(__dirname, '../..')
export const SCRIPT_CACHE_DIR = path.join(root, '.cache/engine-scripts')

export function loadDataset(): Map<number, Card> {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/data/manifest.json'), 'utf8')) as { files: { cards: string } }
  const file = JSON.parse(fs.readFileSync(path.join(root, 'public/data', manifest.files.cards), 'utf8'))
  return new Map(decodeCards(file).map((c) => [c.id, c]))
}

export async function loadNodeCore() {
  const buf = fs.readFileSync(path.join(root, 'node_modules/@n1xx1/ocgcore-wasm/lib/ocgcore.sync.wasm'))
  return loadCore(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
}

/** Persistenza su disco (.cache/engine-scripts/<commit>/…): i test funzionano offline dopo la prima esecuzione. */
export function diskPersist(commit: string): ScriptPersist {
  const dir = path.join(SCRIPT_CACHE_DIR, commit.slice(0, 12))
  const file = (p: string) => path.join(dir, p.replace(/\//g, '__'))
  return {
    async get(p) {
      try {
        if (fs.existsSync(file(p) + '.404')) return { status: 404 }
        return { status: 200, text: fs.readFileSync(file(p), 'utf8') }
      } catch { return null }
    },
    async put(p, v) {
      fs.mkdirSync(dir, { recursive: true })
      if (v.status === 404) fs.writeFileSync(file(p) + '.404', '')
      else fs.writeFileSync(file(p), v.text)
    },
  }
}

export function nodeScriptStore(commit: string, fetchFn?: FetchLike) {
  return new ScriptStore({ persist: diskPersist(commit), ...(fetchFn ? { fetch: fetchFn } : {}) })
}

/** true se gli script base sono raggiungibili (cache su disco o rete); altrimenti i test del motore vengono saltati. */
export async function scriptsAvailable(commit: string): Promise<boolean> {
  const s = nodeScriptStore(commit)
  try {
    await s.preload([])
    return s.get('utility.lua') !== undefined
  } catch { return false }
}
