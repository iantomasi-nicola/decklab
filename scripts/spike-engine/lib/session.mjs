import { runDuel } from './engine.mjs'
// "Rigioca da capo": run, if scripts are missing fetch them and replay from scratch.
export async function runWithPreload(lib, opts, store) {
  let passes = 0, r
  const log = []
  for (;;) {
    store.missing.clear()
    const t0 = performance.now()
    r = runDuel(lib, opts); passes++
    const pass = { n: passes, ms: +(performance.now() - t0).toFixed(1), missing: store.missing.size, msgs: r.messages.length }
    if (!store.missing.size) { log.push(pass); break }
    const fetched = await store.fetchMissing(); pass.fetched = fetched.length; log.push(pass)
    if (passes > 40) throw new Error('too many passes')
  }
  return { ...r, passes, log }
}
