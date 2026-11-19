import { createCore, runDuel } from './lib/engine.mjs'
import { ScriptStore } from './lib/scripts.mjs'
import { runWithPreload } from './lib/session.mjs'

const mem = () => ({ jsHeapMB: self.performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null })
const wasmMB = (lib) => { const M = Object.getOwnPropertySymbols(lib).map((s) => lib[s]).find((x) => x?.module); return M ? +(M.module.HEAP8.byteLength / 1048576).toFixed(1) : null }

self.onmessage = async (ev) => {
  const { scriptsBase, maxNew = 60, deck = 'sky', variant = 'inline' } = ev.data
  if (ev.data.noJspi) { try { delete WebAssembly.Suspending; delete WebAssembly.promising } catch {} }
  const res = { env: { jspi: typeof WebAssembly.Suspending, promising: typeof WebAssembly.promising, ua: navigator.userAgent } }
  try {
    const data = await (await fetch('./data/spike.json')).json()
    const cards = { get: (c) => { const x = data.cards[c]; return x ? { ...x, race: BigInt(x.race) } : null } }
    const decks = data.decks[deck]
    const seed = [11n, 22n, 33n, 44n]
    const t0 = performance.now()
    let lib
    if (variant === 'binary') { // fetch the .wasm ourselves (cacheable, compressible with br) instead of the 1.28MB base64 JS chunk
      const f0 = performance.now(); const buf = await (await fetch('./node_modules/@n1xx1/ocgcore-wasm/lib/ocgcore.sync.wasm')).arrayBuffer(); res.wasmFetchMs = +(performance.now() - f0).toFixed(1)
      const c0 = performance.now(); await WebAssembly.compile(buf); res.wasmCompileOnlyMs = +(performance.now() - c0).toFixed(1)
      lib = await createCore({ sync: true, wasmBinary: buf })
    } else lib = await createCore({ sync: true })
    res.createCoreMs = +(performance.now() - t0).toFixed(1)
    res.wasmMemAfterInitMB = wasmMB(lib); res.mem0 = mem()
    const store = new ScriptStore(scriptsBase)
    let longest = 0
    const t1 = performance.now()
    const r = await runWithPreload(lib, { cards, scripts: store, decks, seed, maxNew }, store)
    res.firstDuel = { totalMs: +(performance.now() - t1).toFixed(0), passes: r.passes, log: r.log, scripts: store.map.size, scriptBytes: store.bytes, httpRequests: store.requests, fetchMs: +store.fetchMs.toFixed(0), responses: r.responses.length, messages: r.messages.length, luaErrors: r.errors.length }
    res.wasmMemAfterDuelMB = wasmMB(lib); res.mem1 = mem()
    // warm replay (all scripts in memory): cost of "undo" = recreate + replay N-1 responses
    const warm = []
    for (const n of [0, 5, 10, 20, 40, 60].filter((n) => n <= r.responses.length)) {
      const s = performance.now(); runDuel(lib, { cards, scripts: store, decks, seed, responses: r.responses.slice(0, n), maxNew: 0 }); warm.push([n, +(performance.now() - s).toFixed(1)])
    }
    res.undoReplayMs = warm
    // 30 duel creations in a row: memory growth / leak check
    const m0 = wasmMB(lib); const s2 = performance.now()
    for (let i = 0; i < 30; i++) runDuel(lib, { cards, scripts: store, decks, seed, responses: r.responses.slice(0, 20), maxNew: 0 })
    res.repeat30 = { ms: +(performance.now() - s2).toFixed(0), wasmMBBefore: m0, wasmMBAfter: wasmMB(lib), mem: mem() }
    res.ok = true
  } catch (e) { res.error = String(e?.stack ?? e) }
  postMessage(res)
}
