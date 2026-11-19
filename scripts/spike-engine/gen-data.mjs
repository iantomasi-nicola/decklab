// Extract the cards needed by the test decks to JSON for the browser worker.
import { writeFileSync, mkdirSync } from 'node:fs'
import { openCdb } from './lib/common.mjs'
import { SKY, MINI, OPP, resolveDecks } from './lib/scenario.mjs'
const cdb = openCdb(); mkdirSync('data', { recursive: true })
const out = { decks: { sky: resolveDecks(cdb, SKY), mini: resolveDecks(cdb, MINI) }, cards: {} }
for (const d of Object.values(out.decks)) for (const c of [...d.main, ...d.extra, ...d.opp]) { const x = cdb.get(c); out.cards[c] = { ...x, race: x.race.toString() } }
// cards that scripts may reference at runtime (tokens, etc.): add a bunch of Sky Striker family
for (const [id] of Object.entries({ 52340445: 1 })) { const x = cdb.get(+id); if (x) out.cards[id] = { ...x, race: x.race.toString() } }
writeFileSync('data/spike.json', JSON.stringify(out)); console.log('cards', Object.keys(out.cards).length)
