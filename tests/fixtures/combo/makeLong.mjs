#!/usr/bin/env node
/**
 * Generatore deterministico di combo lunghe (formato combolab.combo v1) per i test di guida e replay.
 *   node tests/fixtures/combo/makeLong.mjs 60            -> scrive tests/fixtures/combo/long-60.json
 *   node tests/fixtures/combo/makeLong.mjs 120 out.json  -> scrive dove indicato
 * Stesso N = stesso documento (PRNG con seme fisso). Passcode reali: verificati sul dataset in public/data.
 * Contenuto: evocazioni, attivazioni con ricerca, catene a 2-3 anelli, gruppi "ordine libero", Xyz/Synchro/Link con materiali,
 * contatori, variazioni di LP, fasi (main1 / battle / main2 / end), 2 rami, note IT/EN brevi e lunghe con @carta, nomi lunghi.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '../../../public/data')

/* ------------------------------------------------------------------ carte */
const POOL = {
  // mostri da mano (alcuni con nomi molto lunghi)
  mon: [10028593, 16719802, 23899727, 31571902, 46104361, 53309998, 60999392, 68809475, 76830505, 84592800, 91870448, 65268179, 29913783, 92652813, 46809548, 28423537, 3428069],
  spell: [8843569, 17956906, 25123082, 33907039, 58577036, 66380357, 73680966, 10065487],
  trap: [6763530, 15693423, 23270035, 31044787, 38960450, 10045474],
  field: 10080320,
  xyz: [29208536, 63767246, 49032236, 66547759, 74689476, 68396121, 56840427, 698785],
  synchro: [23338098, 47710198],
  link: [47158777, 65711558, 11738489],
  oppMon: [10060427, 84592800, 91870448, 60999392],
  ash: 14558127,
  maxx: 23434538,
  filler: [1003028, 1003840, 1005587, 1006081, 1033312, 1036974, 1045143, 1050186, 1050355, 1050684, 1061200, 1073952, 1082946, 1102515, 1118137, 1127737, 1142880, 1149109],
}

function loadNames() {
  const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8'))
  const cols = JSON.parse(readFileSync(join(DATA, manifest.files.cards), 'utf8')).cols
  const byId = new Map()
  cols.id.forEach((id, i) => byId.set(id, { en: cols.en[i], it: cols.it[i] || cols.en[i] }))
  return byId
}

/* ------------------------------------------------------------------ PRNG */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/* ------------------------------------------------------------------ testi */
const SHORT = [
  ['Cerca {a}.', 'Search {a}.'],
  ['Evoca {a}.', 'Summon {a}.'],
  ['Subito dopo, {a}.', 'Right after, {a}.'],
  ['Costo: scarta {a}.', 'Cost: discard {a}.'],
  ['Solo se {a} è sul campo.', 'Only if {a} is on the field.'],
  ['Ok.', 'Ok.'],
  ['Qui si ferma la catena.', 'The chain ends here.'],
]
const MEDIUM = [
  ['Attiva {a} e scegli {b} come bersaglio: se l’avversario non risponde, prosegui con il passo successivo.', 'Activate {a} and target {b}: if the opponent does not respond, move on to the next step.'],
  ['Usa {a} per cercare {b}; tienila in mano per dopo, serve alla seconda parte della linea.', 'Use {a} to search {b}; keep it in hand for later, it is needed for the second half of the line.'],
  ['Questo è il punto in cui @Ash Blossom è più pericolosa: valuta se attivare prima {a}.', 'This is where @Ash Blossom is most dangerous: consider activating {a} first.'],
  ['Mandi {a} al Cimitero come costo, poi {b} resta sul campo come materiale per il passo dopo.', 'Send {a} to the GY as cost, then {b} stays on the field as material for the next step.'],
]
const LONG = [
  [
    'Attenzione: questo passo è il più delicato della combo. Prima di attivare {a} controlla che {b} sia ancora sul campo, che la zona Mostro Extra sia libera e che l’avversario abbia già usato la sua interruzione sulla ricerca. Se così non fosse, torna al passo precedente e gioca la linea alternativa, altrimenti rischi di restare senza materiali per l’Xyz finale e di perdere due carte in un colpo solo.',
    'Careful: this is the most delicate step of the combo. Before activating {a}, make sure {b} is still on the field, that the Extra Monster Zone is free and that the opponent has already used their interruption on the search. If not, go back to the previous step and play the alternate line, otherwise you may run out of materials for the final Xyz and lose two cards at once.',
  ],
  [
    'Nota lunga di prova: {a} e {b} sono entrambe necessarie, ma l’ordine conta. Si risolve prima l’ultimo anello della catena, poi quello centrale, infine il primo; ricorda di dichiarare ogni bersaglio nel momento in cui attivi, non alla risoluzione. Su Master Duel il timer è più stretto: prepara questa sequenza in anticipo.',
    'Long test note: {a} and {b} are both required, but the order matters. The last chain link resolves first, then the middle one, and finally the first; remember to declare every target when you activate, not on resolution. On Master Duel the timer is tighter: rehearse this sequence ahead of time.',
  ],
  [
    'Riferimento: https://example.com/guide/combo/lunga/passo-molto-lungo-senza-spazi-per-provare-il-ritorno-a-capo?utm_source=prova&utm_medium=test&utm_campaign=layout con {a}.',
    'Reference: https://example.com/guide/combo/long/very-long-step-without-any-spaces-to-test-wrapping?utm_source=test&utm_medium=test&utm_campaign=layout with {a}.',
  ],
]

/* ------------------------------------------------------------------ generatore */
export function makeLong(N = 60, opts = {}) {
  if (!Number.isInteger(N) || N < 24) throw new Error('N deve essere un intero >= 24')
  const names = loadNames()
  const rand = rng(1000 + N)
  const pick = (a) => a[Math.floor(rand() * a.length)]

  // stato mutabile (clonabile con structuredClone per provare i blocchi e annullarli)
  const G = {
    steps: [],
    places: {}, // uid -> {p, loc, seq?, pos?, host?}
    counters: {}, // uid -> {tipo: n}
    lp: [8000, 8000],
    reg: {}, // uid -> passcode
    uidN: 100,
    chainN: 0,
    groupN: 0,
    phase: 'main1',
    cnt: { mon: 0, spell: 0, trap: 0, xyz: 0, synchro: 0, link: 0 },
    hand: [], // uid in mano con tipo
    anchors: {}, // punti di aggancio dei rami
    fieldUsed: false,
  }

  const nameOf = (code, lang) => {
    const n = names.get(code)
    if (!n) throw new Error(`passcode ${code} non presente nel dataset`)
    return n[lang]
  }

  /* --- carte */
  const fresh = (kind, code) => {
    const uid = `u${++G.uidN}`
    const arr = POOL[kind]
    G.reg[uid] = code ?? arr[G.cnt[kind]++ % arr.length]
    return uid
  }
  const own = (uid) => G.places[uid]
  const ofLoc = (p, loc) => Object.entries(G.places).filter(([, pl]) => pl.p === p && pl.loc === loc).map(([u]) => u)
  const isKind = (uid, kind) => (Array.isArray(POOL[kind]) ? POOL[kind].includes(G.reg[uid]) : POOL[kind] === G.reg[uid])
  const overlaysOf = (host) => Object.entries(G.places).filter(([, pl]) => pl.loc === 'overlay' && pl.host === host).map(([u]) => u)
  const freeSeq = (p, loc, order) => order.find((s) => !Object.values(G.places).some((pl) => pl.p === p && pl.loc === loc && pl.seq === s))
  const freeM = () => freeSeq(0, 'mzone', [2, 1, 3, 0, 4])
  const freeS = () => freeSeq(0, 'szone', [1, 3, 0, 2, 4])
  const plainMonsters = () => ofLoc(0, 'mzone').filter((u) => !isKind(u, 'xyz') && !isKind(u, 'link') && overlaysOf(u).length === 0)

  /* --- passi */
  const M = (seq, pos = 'FACEUP_ATK') => ({ loc: 'mzone', seq, pos })
  const S = (seq, pos = 'FACEUP') => ({ loc: 'szone', seq, pos })
  const mv = (uid, to, why) => ({ uid, to, ...(why ? { why } : {}) })

  function push(step) {
    const id = `s${G.steps.length + 1}`
    const full = { id, ...step, moves: step.moves ?? [], phase: G.phase }
    for (const m of full.moves) {
      const prev = G.places[m.uid]
      const p = m.to.p ?? prev?.p ?? (m.uid.startsWith('o') ? 1 : 0)
      G.places[m.uid] = { ...m.to, p }
      if (m.to.loc !== 'hand') G.hand = G.hand.filter((h) => h !== m.uid)
      if (m.to.loc === 'hand' && p === 0 && !G.hand.includes(m.uid)) G.hand.push(m.uid)
    }
    for (const d of full.lp ?? []) G.lp[d.p] += d.delta
    for (const c of full.counters ?? []) {
      const cur = (G.counters[c.uid] ??= {})
      cur[c.type] = (cur[c.type] ?? 0) + c.delta
      if (cur[c.type] <= 0) delete cur[c.type]
      if (!Object.keys(cur).length) delete G.counters[c.uid]
    }
    G.steps.push(full)
    return full
  }

  /* --- note */
  const fill = (tpl, a, b) => tpl.replace(/\{a\}/g, a ? `@${a}` : '@u1').replace(/\{b\}/g, b ? `@${b}` : '@u1')
  function note(a, b) {
    const r = rand()
    if (r < 0.28) return undefined
    const set = r < 0.58 ? SHORT : r < 0.88 ? MEDIUM : LONG
    const [it, en] = pick(set)
    // le note sono un campo unico: una sola lingua (la guida mostra quella corrente, altrimenti la prima disponibile)
    return rand() < 0.65 ? { it: fill(it, a, b) } : { en: fill(en, a, b) }
  }
  // una nota con il nome completo tra parentesi quadre (lingua per lingua)
  const bracketNote = (code) => ({
    it: `Questa è la carta chiave della linea: @[${nameOf(code, 'it')}] va protetta a ogni costo.`,
  })

  /* --- zone libere */
  function roomM(n, keepPlain = false) {
    while (!(5 - ofLoc(0, 'mzone').length >= n)) {
      const mons = ofLoc(0, 'mzone')
      const plain = plainMonsters()
      // di norma si libera un mostro semplice; se servono mostri semplici come materiali, si sacrifica un Xyz/Link
      const victim = keepPlain
        ? mons.find((u) => !plain.includes(u)) ?? mons[0]
        : mons.find((u) => plain.includes(u)) ?? mons[0]
      const moves = [...overlaysOf(victim).map((o) => mv(o, { loc: 'gy' }, 'send')), mv(victim, { loc: 'gy' }, 'send')]
      push({ action: 'sendToGY', card: victim, moves, note: { it: 'Libera una zona Mostro.', en: 'Free up a Monster Zone.' } })
    }
  }
  function roomS(n) {
    while (!(5 - ofLoc(0, 'szone').length >= n)) {
      const v = ofLoc(0, 'szone')[0]
      push({ action: 'sendToGY', card: v, moves: [mv(v, { loc: 'gy' }, 'send')] })
    }
  }
  const handOf = (kind) => G.hand.find((u) => isKind(u, kind))
  const takeOrNew = (kind) => handOf(kind) ?? fresh(kind)

  /* --- blocchi (ognuno aggiunge uno o più passi) */
  const blocks = {
    open() {
      roomM(1)
      const m = takeOrNew('mon')
      const seq = freeM()
      push({ action: 'normalSummon', card: m, to: M(seq), moves: [mv(m, M(seq), 'summon')], ...opt(note(m)) })
      const s = fresh(rand() < 0.5 ? 'spell' : 'mon')
      const act = push({
        action: 'activate', card: m, effect: { kind: 'trigger', index: 1 }, searched: [s], moves: [mv(s, { loc: 'hand' }, 'search')],
        note: note(m, s) ?? { it: 'Cerca il pezzo chiave.', en: 'Search the key piece.' },
      })
      G.anchors.open ??= { step: act.id, places: structuredClone(G.places), at: G.steps.length }
    },
    chain(links) {
      roomS(links)
      const cid = `c${++G.chainN}`
      const ids = []
      const cards = []
      const oppTarget = ofLoc(1, 'mzone')[0]
      for (let k = 1; k <= links; k++) {
        // l'anello 2 usa, la prima volta, la trappola già settata sul campo
        const set = k === 2 ? ofLoc(0, 'szone').find((u) => G.places[u].pos === 'FACEDOWN') : undefined
        const kind = k === 2 ? 'trap' : 'spell'
        const c = set ?? takeOrNew(kind)
        const seq = set ? G.places[set].seq : freeS()
        const step = push({
          action: k === 1 ? 'activate' : 'chainActivate',
          card: c,
          ...(k === 1 ? { effect: { kind: 'activation', index: 1 } } : {}),
          chain: { id: cid, link: k },
          ...(k === 2 && oppTarget ? { targets: [oppTarget] } : {}),
          moves: [mv(c, S(seq), 'other')],
          ...opt(note(c, k === 2 ? oppTarget : undefined)),
        })
        ids.push(step.id)
        cards.push(c)
      }
      G.anchors.chain ??= { step: ids[0], places: structuredClone(G.places) }
      for (let k = links; k >= 1; k--) {
        const c = cards[k - 1]
        // la trappola continua dell'anello 2 resta sul campo nelle catene dispari (board finale più ricco)
        const stays = k === 2 && G.chainN % 2 === 1
        const moves = stays ? [] : [mv(c, { loc: 'gy' }, 'send')]
        if (k === 2 && oppTarget && G.places[oppTarget]?.loc === 'mzone') moves.push(mv(oppTarget, { loc: 'gy' }, 'destroy'))
        if (k === 1) {
          roomM(1)
          const m = fresh('mon')
          const seq = freeM()
          moves.push(mv(m, M(seq), 'summon'))
        }
        push({ action: 'resolve', ref: ids[k - 1], moves, ...(k === 1 ? { note: { it: 'La catena si chiude: ricevi un mostro.', en: 'The chain closes: you get a monster.' } } : {}) })
      }
    },
    free(n, keepPlain = false) {
      roomM(n, keepPlain)
      const gid = `g${++G.groupN}`
      for (let i = 0; i < n; i++) {
        const m = fresh('mon')
        const seq = freeM()
        push({
          action: 'specialSummon', method: i === 0 ? 'procedure' : 'effect', card: m, group: gid, ...(i === n - 1 ? { optional: true } : {}),
          to: M(seq), moves: [mv(m, M(seq), 'summon')], ...opt(i === 0 ? { it: 'Questi tre passi si possono fare in qualsiasi ordine.', en: 'These three steps can be done in any order.' } : note(m)),
        })
      }
    },
    xyz() {
      const have = plainMonsters()
      const need = Math.max(0, 2 - have.length)
      if (need) blocks.free(need, true)
      const [a, b] = plainMonsters()
      const x = fresh('xyz')
      const seq = G.places[a].seq
      push({
        action: 'specialSummon', method: 'xyz', card: x, to: M(seq),
        moves: [mv(a, { loc: 'overlay', seq: 0, host: x }, 'material'), mv(b, { loc: 'overlay', seq: 1, host: x }, 'material'), mv(x, M(seq), 'summon')],
        note: note(x, a) ?? bracketNote(G.reg[x]),
      })
    },
    synchro() {
      const have = plainMonsters()
      if (have.length < 2) blocks.free(2 - have.length, true)
      const [a, b] = plainMonsters()
      const x = fresh('synchro')
      const seq = G.places[a].seq
      push({ action: 'specialSummon', method: 'synchro', card: x, to: M(seq), moves: [mv(a, { loc: 'gy' }, 'material'), mv(b, { loc: 'gy' }, 'material'), mv(x, M(seq), 'summon')], ...opt(note(x)) })
    },
    link() {
      const have = plainMonsters()
      if (have.length < 2) blocks.free(2 - have.length, true)
      const [a, b] = plainMonsters()
      const x = fresh('link')
      const emz = freeSeq(0, 'emz', [0, 1])
      const to = emz === undefined ? M(G.places[a].seq) : { loc: 'emz', seq: emz, pos: 'FACEUP_ATK' }
      push({ action: 'specialSummon', method: 'link', card: x, to, moves: [mv(a, { loc: 'gy' }, 'material'), mv(b, { loc: 'gy' }, 'material'), mv(x, to, 'summon')], ...opt(note(x)) })
    },
    field() {
      if (G.fieldUsed) return blocks.filler()
      G.fieldUsed = true
      const f = fresh('field', POOL.field)
      push({ action: 'activate', card: f, effect: { kind: 'activation', index: 1 }, moves: [mv(f, { loc: 'fzone', seq: 0, pos: 'FACEUP' }, 'other')], note: { it: 'Terreno attivato: resta per tutto il turno.', en: 'Field Spell activated: it stays for the whole turn.' } })
    },
    filler() {
      const k = Math.floor(rand() * 7)
      const mons = ofLoc(0, 'mzone')
      if (k === 0 && G.hand.length) {
        const c = G.hand[0]
        return push({ action: 'discard', card: c, moves: [mv(c, { loc: 'gy' }, 'discard')], ...opt(note(c)) })
      }
      if (k === 1) {
        const c = fresh('mon')
        return push({ action: 'sendToGY', card: c, moves: [mv(c, { loc: 'gy' }, 'send')], ...opt(note(c)) })
      }
      if (k === 2) {
        const c = fresh(rand() < 0.5 ? 'spell' : 'mon')
        return push({ action: 'draw', card: c, moves: [mv(c, { loc: 'hand' }, 'draw')], note: { it: 'Pesca una carta.', en: 'Draw a card.' } })
      }
      if (k === 3 && mons.length) {
        const c = mons[0]
        return push({ action: 'placeCounter', card: c, counters: [{ uid: c, type: 'Spell Counter', delta: 1 }], moves: [], ...opt(note(c)) })
      }
      if (k === 4) {
        return push({ action: 'changeLP', lp: [{ p: 0, delta: -1000 }], moves: [], note: { it: 'Paghi 1000 LP.', en: 'Pay 1000 LP.' } })
      }
      if (k === 5 && mons.length) {
        const c = mons.find((u) => !isKind(u, 'xyz')) ?? mons[0]
        const to = { ...M(G.places[c].seq, 'FACEUP_DEF') }
        return push({ action: 'changePosition', card: c, moves: [mv(c, to, 'position')], ...opt(note(c)) })
      }
      const c = fresh('spell')
      return push({ action: 'declare', card: c, moves: [], note: note(c) ?? { it: 'Dichiara il nome e continua.', en: 'Declare the name and continue.' } })
    },
  }
  const opt = (n) => (n ? { note: n } : {})

  /* --- setup */
  G.reg.u1 = POOL.mon[0] // Reborn Tengu: apertura
  G.reg.u2 = POOL.spell[0]
  G.reg.u3 = POOL.mon[1]
  G.reg.u4 = POOL.trap[5] // trappola già settata
  G.reg.o1 = POOL.ash
  G.reg.o2 = POOL.oppMon[0]
  G.reg.o3 = POOL.oppMon[1]
  G.reg.o4 = POOL.oppMon[2]
  G.reg.o5 = POOL.trap[5]
  const setupOwn = [{ uid: 'u4', place: { loc: 'szone', seq: 4, pos: 'FACEDOWN' } }]
  const setupOpp = [
    { uid: 'o1', place: { p: 1, loc: 'hand' } },
    { uid: 'o2', place: { p: 1, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } },
    { uid: 'o3', place: { p: 1, loc: 'mzone', seq: 1, pos: 'FACEUP_DEF' } },
    { uid: 'o4', place: { p: 1, loc: 'mzone', seq: 3, pos: 'FACEUP_ATK' } },
    { uid: 'o5', place: { p: 1, loc: 'szone', seq: 2, pos: 'FACEDOWN' } },
  ]
  for (const b of setupOwn) G.places[b.uid] = { p: 0, ...b.place }
  for (const b of setupOpp) G.places[b.uid] = { p: 1, ...b.place }
  for (const u of ['u1', 'u2', 'u3']) {
    G.places[u] = { p: 0, loc: 'hand', seq: G.hand.length }
    G.hand.push(u)
  }
  G.uidN = 100

  /* --- linea principale */
  const tail = 1 + 2 + 1 + 1 // enterPhase battle, 2 attacchi, enterPhase main2, endTurn
  const main1 = Math.round((N - tail) * 0.7)
  const cycle = ['open', 'chain2', 'free3', 'xyz', 'chain3', 'filler', 'field', 'link', 'chain2', 'synchro', 'open', 'free2', 'xyz', 'chain3', 'filler']
  let ci = 0
  const runBlock = (kind, limit) => {
    const snap = structuredClone(G)
    if (kind.startsWith('chain')) blocks.chain(Number(kind.slice(5)))
    else if (kind.startsWith('free')) blocks.free(Number(kind.slice(4)))
    else blocks[kind]()
    if (G.steps.length > limit) {
      Object.keys(G).forEach((k) => delete G[k])
      Object.assign(G, snap)
      return false
    }
    return true
  }
  const fillTo = (limit, bias) => {
    let guard = 0
    while (G.steps.length < limit && guard++ < 1000) {
      const kind = bias && limit - G.steps.length <= 3 && G.steps.length >= limit - 3 && rand() < 0.5 ? 'xyz' : cycle[ci++ % cycle.length]
      if (!runBlock(kind, limit)) runBlock('filler', limit)
    }
  }
  fillTo(main1)

  // ramo 1: Ash sulla prima ricerca. Rientra qualche passo dopo il punto di diramazione.
  const openAt = G.anchors.open ? G.steps.findIndex((s) => s.id === G.anchors.open.step) : 0

  // battle phase
  G.phase = 'battle'
  push({ action: 'enterPhase', moves: [], note: { it: 'Passi alla Battle Phase.', en: 'Go to the Battle Phase.' } })
  for (let i = 0; i < 2; i++) {
    const atk = ofLoc(0, 'mzone')[0]
    const tgt = ofLoc(1, 'mzone')[0]
    if (atk && tgt) push({ action: 'attack', card: atk, targets: [tgt], moves: [mv(tgt, { loc: 'gy' }, 'destroy')], ...opt(note(atk, tgt)) })
    else push({ action: 'attack', card: atk ?? 'u1', lp: [{ p: 1, delta: -2400 }], moves: [], note: { it: 'Attacco diretto.', en: 'Direct attack.' } })
  }
  G.phase = 'main2'
  push({ action: 'enterPhase', moves: [], note: { it: 'Torni alla Main Phase 2.', en: 'Back to Main Phase 2.' } })
  fillTo(N - 1, true)
  G.phase = 'end'
  push({ action: 'endTurn', moves: [], note: { it: 'Fine del turno: board pronto.', en: 'End of turn: board is ready.' } })

  const steps = G.steps
  if (steps.length !== N) throw new Error(`generati ${steps.length} passi invece di ${N}`)

  /* --- rami */
  const branches = []
  const stepIdx = (id) => steps.findIndex((s) => s.id === id)
  let bu = 900
  const bcard = (kind, code) => {
    const uid = `u${++bu}`
    G.reg[uid] = code ?? POOL[kind][bu % POOL[kind].length]
    return uid
  }
  if (G.anchors.open) {
    const a = G.anchors.open
    const used = new Set(Object.values(a.places).filter((p) => p.p === 0 && p.loc === 'mzone').map((p) => p.seq))
    const seq = [0, 4, 1, 3, 2].find((s) => !used.has(s)) ?? 0
    const sp = bcard('spell'), m = bcard('mon'), s2 = bcard('spell')
    branches.push({
      id: 'b1',
      title: { it: 'Ash sulla ricerca', en: 'Ash on the search' },
      condition: { afterStep: a.step, window: 'activation', opponent: { code: POOL.ash, effect: 1 } },
      steps: [
        { id: 'b1s1', action: 'chainActivate', card: sp, targets: ['o1'], chain: { id: 'cb1', link: 2 }, moves: [mv(sp, S(0), 'other')], note: { it: 'Rispondi con @' + sp + ' su @Ash Blossom.', en: 'Respond with @' + sp + ' on @Ash Blossom.' } },
        { id: 'b1s2', action: 'resolve', ref: 'b1s1', moves: [mv(sp, { loc: 'gy' }, 'send'), mv('o1', { p: 1, loc: 'gy' }, 'destroy')] },
        { id: 'b1s3', action: 'normalSummon', card: m, to: M(seq), moves: [mv(m, M(seq), 'summon')], note: { it: 'Ora la linea riprende normalmente.', en: 'Now the line resumes as usual.' } },
        { id: 'b1s4', action: 'activate', card: m, effect: { kind: 'trigger', index: 1 }, searched: [s2], moves: [mv(s2, { loc: 'hand' }, 'search')], note: { it: 'Cerca la carta che avresti cercato prima.', en: 'Search the card you would have searched before.' } },
      ],
      rejoin: steps[Math.min(steps.length - 2, openAt + 4)].id,
      note: { it: 'Se Ash nega la ricerca, la linea B recupera il pezzo con una risposta.', en: 'If Ash negates the search, line B gets the piece back with a response.' },
    })
  }
  if (G.anchors.chain) {
    const a = G.anchors.chain
    const x = bcard('xyz'), m1 = bcard('mon'), m2 = bcard('mon')
    const taken = new Set(Object.values(a.places).filter((p) => p.p === 0 && p.loc === 'mzone').map((p) => p.seq))
    const [q1, q2] = [2, 1, 3, 0, 4].filter((q) => !taken.has(q))
    branches.push({
      id: 'b2',
      title: { it: 'Maxx "C" alla risoluzione' },
      condition: { afterStep: a.step, window: 'resolution', opponent: { code: POOL.maxx, effect: 1 } },
      steps: [
        { id: 'b2s1', action: 'declare', card: 'u1', moves: [], note: { it: 'Dichiari di giocare attorno a @Maxx "C": poche Evocazioni, nessuna in più.' } },
        { id: 'b2s2', action: 'specialSummon', method: 'procedure', card: m1, group: 'gb2', to: M(q1 ?? 0), moves: [mv(m1, M(q1 ?? 0), 'summon')] },
        { id: 'b2s3', action: 'specialSummon', method: 'effect', card: m2, group: 'gb2', to: M(q2 ?? 4), moves: [mv(m2, M(q2 ?? 4), 'summon')] },
        { id: 'b2s4', action: 'specialSummon', method: 'xyz', card: x, to: M(q1 ?? 0), moves: [mv(m1, { loc: 'overlay', seq: 0, host: x }, 'material'), mv(m2, { loc: 'overlay', seq: 1, host: x }, 'material'), mv(x, M(q1 ?? 0), 'summon')], note: { it: 'Un solo Xyz, poi passi il turno.' } },
        { id: 'b2s5', action: 'endTurn', moves: [], note: { it: 'Fine della linea: ti fermi qui.' } },
      ],
      rejoin: null,
      note: { en: 'Short and safe line against @Maxx "C".' },
    })
  }

  /* --- mazzo, endboard, documento */
  const reqCodes = ['u1', 'u2', 'u3'].map((u) => G.reg[u])
  const main = [...reqCodes, G.reg.u1, ...POOL.mon.slice(2, 12), ...POOL.spell.slice(1, 6), ...POOL.trap.slice(0, 5), ...POOL.filler].slice(0, 40)
  const extra = [...POOL.xyz, ...POOL.synchro, ...POOL.link].slice(0, 15)
  const inField = (pl) => ['mzone', 'emz', 'szone', 'fzone', 'overlay'].includes(pl.loc)
  const clean = (pl) => ({ ...(pl.p === 1 ? { p: 1 } : {}), loc: pl.loc, ...(pl.seq !== undefined ? { seq: pl.seq } : {}), ...(pl.pos !== undefined ? { pos: pl.pos } : {}), ...(pl.host !== undefined ? { host: pl.host } : {}) })
  const boardOf = (p) => {
    const places = Object.entries(G.places).filter(([, pl]) => pl.p === p && inField(pl)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([uid, pl]) => ({ uid, place: clean(pl) }))
    const counters = Object.fromEntries(places.filter((bp) => G.counters[bp.uid]).map((bp) => [bp.uid, { ...G.counters[bp.uid] }]))
    return { lp: G.lp[p], places, ...(Object.keys(counters).length ? { counters } : {}) }
  }
  const oppBoard = boardOf(1)
  const trivialOpp = oppBoard.places.length === 0 && oppBoard.lp === 8000 && !oppBoard.counters
  const xyzOnBoard = Object.entries(G.places).filter(([u, pl]) => pl.p === 0 && pl.loc === 'mzone' && isKind(u, 'xyz')).length
  const endboard = {
    own: boardOf(0),
    ...(trivialOpp ? {} : { opponent: oppBoard }),
    summary: {
      it: `Board finale: ${xyzOnBoard} mostri Xyz con i loro materiali, ${ofLoc(0, 'szone').length} carte nella zona Magie e Trappole.`,
      en: `End board: ${xyzOnBoard} Xyz monsters with their materials, ${ofLoc(0, 'szone').length} cards in the Spell & Trap Zone.`,
    },
  }

  const stamp = '2026-11-19T10:00:00Z'
  const cards = Object.fromEntries(Object.entries(G.reg).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
  const doc = {
    format: 'combolab.combo',
    v: 1,
    meta: {
      id: opts.id ?? `00000000-0000-4000-8000-${String(N).padStart(12, '0')}`,
      title: { it: `Apertura lunga di prova (${N} passi)` }, // campo unico
      scope: 'archetype',
      archetype: { name: { it: 'Prova combo lunghe', en: 'Long combo test' } },
      variant: null,
      rules: 'TCG',
      banlist: { format: 'TCG', id: '2026.10' },
      tags: ['demo', 'long'],
      noteLang: ['it', 'en'],
      favorite: false,
      createdAt: stamp,
      updatedAt: stamp,
      source: 'manual',
    },
    deck: { main, extra, side: [] },
    cards,
    setup: {
      first: true,
      hand: { required: ['u1', 'u2', 'u3'], size: 5, fill: 'random' },
      own: { lp: 8000, places: setupOwn },
      opponent: { board: { lp: 8000, places: setupOpp }, interrupts: [{ uid: 'o1', mode: 'ask', target: 'manual' }] },
    },
    steps,
    branches,
    endboard,
  }
  // controllo: ogni passcode esiste nel dataset
  for (const code of [...Object.values(cards), ...main, ...extra]) nameOf(code, 'en')
  return doc
}

function opt(n) {
  return n ? { note: n } : {}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = Number(process.argv[2] ?? 60)
  const out = process.argv[3] ?? join(HERE, `long-${n}.json`)
  writeFileSync(out, JSON.stringify(makeLong(n), null, 2) + '\n')
  console.log(`${out}: ${n} passi`)
}
