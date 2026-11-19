import { openCdb, ScriptStore, createCore, OcgDuelMode, OcgLocation, OcgPosition, OcgProcessResult, OcgMessageType } from './lib/common.mjs'
const cdb = openCdb(); const store = new ScriptStore()
const t0 = performance.now(); const lib = await createCore({ sync: true }); console.log('createCore ms', (performance.now() - t0).toFixed(0), 'version', lib.getVersion())
const errs = []
const h = lib.createDuel({ flags: OcgDuelMode.MODE_MR5, seed: [1n, 2n, 3n, 4n],
  team1: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 }, team2: { drawCountPerTurn: 1, startingDrawCount: 5, startingLP: 8000 },
  cardReader: (c) => cdb.get(c), scriptReader: (n) => store.read(n), errorHandler: (t, x) => errs.push([t, x]) })
console.log('handle', !!h, 'requested', store.requested, 'missing', [...store.missing], errs)
for (const n of ['constant.lua','utility.lua']) { store.missing.add(n) }
await store.fetchMissing()
for (const n of ['constant.lua','utility.lua']) console.log(n, lib.loadScript(h, n, store.map.get(n)))
console.log('requested', store.requested, 'missing', [...store.missing], errs)
