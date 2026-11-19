import { openCdb, ScriptStore, createCore, runDuel } from './lib/common.mjs'
import { SKY, resolveDecks } from './lib/scenario.mjs'
import { runWithPreload } from './lib/session.mjs'
const cdb = openCdb(); const store = new ScriptStore(); const decks = resolveDecks(cdb, SKY)
const ser = (x) => JSON.stringify(x, (k, v) => typeof v === 'bigint' ? v.toString() + 'n' : v)
const lib = await createCore({ sync: true }); const lib2 = await createCore({ sync: true })
const seed = [11n, 22n, 33n, 44n]
const N = 200
const base = await runWithPreload(lib, { cards: cdb, scripts: store, decks, seed, maxNew: N }, store)
console.log('base: responses', base.responses.length, 'messages', base.messages.length, 'ended', base.ended, 'pending', base.pending?.type)
const A = ser(base.messages)
// 1) same instance x5, 2) other core instance, 3) different seed
let same = 0
for (let i = 0; i < 5; i++) { const r = runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: base.responses, maxNew: 0 }); if (ser(r.messages) === A) same++ }
const r2 = runDuel(lib2, { cards: cdb, scripts: store, decks, seed, responses: base.responses, maxNew: 0 })
const otherSeed = runDuel(lib, { cards: cdb, scripts: store, decks, seed: [5n, 6n, 7n, 8n], responses: base.responses, maxNew: 0 })
const otherOrder = runDuel(lib, { cards: cdb, scripts: store, decks: resolveDecks(cdb, SKY, undefined, 999), seed, responses: [], maxNew: 0 })
const first = (r) => r.messages.filter((m) => m.type === 'x' || true).slice(0, 12).map((m) => m.type + (m.count ?? '')).join(',')
console.log('determinism: same-instance replays identical', same + '/5', '| second core instance identical', ser(r2.messages) === A, '| different core seed (same deck order+responses) differs', ser(otherSeed.messages) !== A, '(diverged/RETRY: ' + otherSeed.diverged + ')', '| different deck order differs', ser(otherOrder.messages) !== ser(runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: [], maxNew: 0 }).messages))
// undo cost vs N (warm, scripts in memory): median of 7
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1]
const rows = []
for (const n of [0, 10, 20, 40, 80, 120, 200].filter((n) => n <= base.responses.length)) {
  const ts = []; for (let i = 0; i < 7; i++) { const t = performance.now(); runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: base.responses.slice(0, n), maxNew: 0 }); ts.push(performance.now() - t) }
  rows.push([n, +med(ts).toFixed(1), +Math.min(...ts).toFixed(1)])
}
console.log('undo cost [N responses replayed, median ms, min ms]', JSON.stringify(rows))
// 20 consecutive undos (the roadmap criterion): undo = replay (len-1), 20 times, and redo = replay len
let cur = base.responses.slice(0, 60), ok = true; const t = performance.now()
const want = ser(runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: cur, maxNew: 0 }).messages)
for (let i = 0; i < 20; i++) { cur = cur.slice(0, -1); runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: cur, maxNew: 0 }) }
for (let i = 0; i < 20; i++) { cur = base.responses.slice(0, 40 + i + 1); runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: cur, maxNew: 0 }) }
const got = ser(runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: base.responses.slice(0, 60), maxNew: 0 }).messages)
console.log('20 undo + 20 redo total ms', (performance.now() - t).toFixed(0), 'final state identical', got === want)
// snapshot size (message log JSON)
console.log('message log JSON bytes for 60 responses', ser(runDuel(lib, { cards: cdb, scripts: store, decks, seed, responses: base.responses.slice(0, 60), maxNew: 0 }).messages).length, '; responses JSON bytes', ser(base.responses.slice(0, 60)).length)
