// Compat smoke: load ~400 random real cards (scripts from the pinned-commit clone) and see if the core 11.0 accepts them (Lua load errors).
import { openCdb, createCore, runDuel } from './lib/common.mjs'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
const CS = process.argv[2]; const cdb = openCdb(); const lib = await createCore({ sync: true })
const files = readdirSync(CS + '/official').filter((f) => /^c\d+\.lua$/.test(f)).map((f) => +f.slice(1, -4))
let s = 42; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
const pick = []; while (pick.length < 400) { const c = files[Math.floor(rnd() * files.length)]; if (cdb.get(c) && !pick.includes(c)) pick.push(c) }
const errs = []; let nread = 0
const scripts = { read: (n) => { const k = n.replace(/^\.\/script\//, ''); const p = /^c\d+\.lua$/.test(k) ? `${CS}/official/${k}` : `${CS}/${k}`; nread++; return existsSync(p) ? readFileSync(p, 'utf8') : null } }
const cards = { get: (c) => cdb.get(c) }
const mainDeck = pick.filter((c) => !(cdb.get(c).type & (0x40 | 0x2000 | 0x800000 | 0x4000000)))
const extra = pick.filter((c) => (cdb.get(c).type & (0x40 | 0x2000 | 0x800000 | 0x4000000)))
const t = performance.now()
const lib2 = lib
const wrapped = { ...cards }
const r = runDuel(lib2, { cards: wrapped, scripts, decks: { main: mainDeck, extra: extra.slice(0, 15), opp: mainDeck.slice(0, 40) }, seed: [1n, 2n, 3n, 4n], responses: [], maxNew: 0 })
console.log('cards', pick.length, 'main', mainDeck.length, 'extra', extra.length, 'scripts read', nread, 'ms', (performance.now() - t).toFixed(0), 'lua/core errors:', r.errors.length, 'diverged', r.diverged)
console.log(r.errors.slice(0, 12).map((e) => String(e).slice(0, 160)).join('\n'))
