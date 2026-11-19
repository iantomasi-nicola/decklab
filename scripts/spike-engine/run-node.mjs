import { openCdb, ScriptStore, createCore, msgName, REQUEST_TYPES } from './lib/common.mjs'
import { MINI, SKY, resolveDecks } from './lib/scenario.mjs'
import { runWithPreload } from './lib/session.mjs'
const which = process.argv[2] === 'sky' ? SKY : MINI
const cdb = openCdb(); const store = new ScriptStore()
let t = performance.now(); const lib = await createCore({ sync: true }); console.log('createCore(sync) ms', (performance.now() - t).toFixed(1), 'core', lib.getVersion())
const decks = resolveDecks(cdb, which)
const seed = [11n, 22n, 33n, 44n]
const r = await runWithPreload(lib, { cards: cdb, scripts: store, decks, seed, maxNew: +(process.argv[3] ?? 10) }, store)
console.log('passes', r.passes, JSON.stringify(r.log))
console.log('scripts in store', store.map.size, 'bytes', store.bytes, 'notFound', JSON.stringify(store.nf), 'http requests', store.requests, 'fetch ms', store.fetchMs.toFixed(0))
console.log('responses', r.responses.length, 'ended', r.ended, 'pending', r.pending && msgName(r.pending), 'lua errors', r.errors.length, r.errors.slice(0,5))
const counts = {}
for (const m of r.messages) counts[msgName(m)] = (counts[msgName(m)] ?? 0) + 1
console.log('message types', JSON.stringify(counts))
let i = 0
for (const m of r.messages) if (REQUEST_TYPES.has(m.type)) console.log(' request', ++i, msgName(m), 'p' + m.player)
