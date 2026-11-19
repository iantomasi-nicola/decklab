import { openCdb, ScriptStore, createCore, runDuel, BASE_SCRIPTS } from './lib/common.mjs'
import { SKY, resolveDecks } from './lib/scenario.mjs'
import { runWithPreload } from './lib/session.mjs'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
const CS = process.argv[2]
const cdb = openCdb(); const store = new ScriptStore(); const decks = resolveDecks(cdb, SKY)
const lib = await createCore({ sync: true })
const r = await runWithPreload(lib, { cards: cdb, scripts: store, decks, seed: [1n, 2n, 3n, 4n], maxNew: 200 }, store)
const keys = [...store.map.keys()]; const base = keys.filter((k) => !k.startsWith('official/')); const cards = keys.filter((k) => k.startsWith('official/'))
const sz = (ks) => ks.reduce((s, k) => s + Buffer.byteLength(store.map.get(k)), 0)
const gz = (ks) => gzipSync(Buffer.concat(ks.map((k) => Buffer.from(store.map.get(k))))).length
console.log('SKY 20-distinct-card decklist + opp vanilla, 200 responses played:')
console.log(' base files', base.length, sz(base), 'B raw', gz(base), 'B gzip (concatenated)')
console.log(' card scripts', cards.length, sz(cards), 'B raw', gz(cards), 'B gzip; avg', Math.round(sz(cards) / cards.length), 'B/script')
const deckCodes = new Set([...decks.main, ...decks.extra]); const fromDeck = cards.filter((k) => deckCodes.has(+k.match(/c(\d+)/)[1]))
console.log(' of which deck cards', fromDeck.length, '; pulled by runtime references (tokens/other cards)', cards.length - fromDeck.length, cards.filter((k) => !fromDeck.includes(k)).join(','))
console.log(' passes', r.passes, 'http requests', store.requests, 'notFound', Object.keys(store.nf).join(','))
// whole archetype (setcode 0x115 = Sky Striker): all card scripts
import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync(new URL('../.cache/cards.cdb', import.meta.url).pathname, { readOnly: true })
const arch = db.prepare('select id from datas where alias=0 and ((setcode & 0xffff)=0x115 or ((setcode>>16)&0xffff)=0x115 or ((setcode>>32)&0xffff)=0x115 or ((setcode>>48)&0xffff)=0x115)').all().map((x) => x.id)
const ex = arch.filter((c) => { try { statSync(`${CS}/official/c${c}.lua`); return true } catch { return false } })
const tot = ex.reduce((s, c) => s + readFileSync(`${CS}/official/c${c}.lua`).length, 0)
console.log('Sky Striker archetype (setcode 0x115): cards', arch.length, 'with script', ex.length, tot, 'B raw')
// global distribution of official scripts
const all = readdirSync(`${CS}/official`).filter((f) => f.endsWith('.lua')).map((f) => readFileSync(`${CS}/official/${f}`).length).sort((a, b) => a - b)
const sum = all.reduce((a, b) => a + b, 0)
console.log('ALL official scripts:', all.length, 'files', (sum / 1048576).toFixed(1), 'MB raw; median', all[all.length >> 1], 'p90', all[Math.floor(all.length * .9)], 'p99', all[Math.floor(all.length * .99)], 'max', all.at(-1))
// time breakdown of one warm duel
const t0 = performance.now(); const w = runDuel(lib, { cards: cdb, scripts: store, decks, seed: [1n, 2n, 3n, 4n], responses: [], maxNew: 0 })
console.log('warm duel: create+load+add+start', w.tCreate.toFixed(1), 'ms; first process', w.tRun.toFixed(1), 'ms')
