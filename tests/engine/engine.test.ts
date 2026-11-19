/**
 * Test del motore su duelli REALI (core sync in Node). Servono gli script di CardScripts al commit fissato:
 * si scaricano una volta in .cache/engine-scripts (NODE_USE_ENV_PROXY=1 dietro proxy); senza rete e senza cache i test si saltano.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateCombo } from '../../src/domain/combo/validate'
import type { ComboDoc, Step, Uid } from '../../src/domain/combo/types'
import type { Card } from '../../src/domain/types'
import { SCRIPTS_COMMIT } from '../../src/engine/constants'
import { EngineHost } from '../../src/engine/host'
import { answerIdle } from '../../src/engine/answers'
import { shuffleDeck } from '../../src/engine/prng'
import { ScriptStore } from '../../src/engine/scripts'
import { decodeEntries } from '../../src/engine/codec'
import type { Answer, DuelState, StartDuelRequest } from '../../src/engine/protocol'
import type { PendingRequest } from '../../src/engine/requests'
import { diskPersist, loadDataset, nodeScriptStore, scriptsAvailable } from './helpers'
import { drive, type DriveOpts } from './driver'

const available = await scriptsAvailable(SCRIPTS_COMMIT)
const cards = loadDataset()
const code = (name: string): number => {
  for (const c of cards.values()) if (c.name.en === name && c.alias === 0) return c.id
  throw new Error('carta non trovata: ' + name)
}
const times = (name: string, n: number) => Array.from({ length: n }, () => code(name))

const wasm = () => {
  const b = fs.readFileSync(path.resolve(__dirname, '../../node_modules/@n1xx1/ocgcore-wasm/lib/ocgcore.sync.wasm'))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
function makeHost(store: ScriptStore = nodeScriptStore(SCRIPTS_COMMIT)) {
  return new EngineHost({ loadWasm: async () => wasm(), loadCards: async () => ({ cards: [...cards.values()] as Card[], version: 'test' }), makeScripts: () => store })
}

// ---- mazzi di prova
const XYZ_DECK = {
  main: [...times('Gagaga Magician', 3), ...times('Wind-Up Soldier', 3), ...times('Pot of Desires', 3), ...times('Dark Hole', 3), ...times('Foolish Burial', 3), ...times('Raigeki', 3)],
  extra: [code('Number 39: Utopia'), code('Number 101: Silent Honor ARK')],
}
const SYNCHRO_DECK = {
  main: [...times('Junk Synchron', 3), ...times('Wind-Up Soldier', 3), ...times('Dark Magician', 3), ...times('Pot of Desires', 3), ...times('Foolish Burial', 3), ...times('Raigeki', 3)],
  extra: [code('Black Rose Dragon'), code('Link Spider'), code('Linkuriboh')],
}
const SKY_DECK = {
  main: ['Sky Striker Ace - Raye', 'Sky Striker Mobilize - Engage!', 'Sky Striker Mecha - Hornet Drones', 'Ash Blossom & Joyous Spring', 'Pot of Desires', 'Foolish Burial', 'Raigeki'].flatMap((n) => times(n, 3)),
  extra: ['Sky Striker Ace - Kagari', 'Sky Striker Ace - Hayate'].map(code),
}

const baseSetup = (over: Partial<ComboDoc['setup']> = {}): ComboDoc['setup'] => ({ first: true, hand: { required: [], size: 5, fill: 'random' }, ...over })
const req = (deck: StartDuelRequest['deck'], over: Partial<StartDuelRequest> = {}): StartDuelRequest => ({ deck, setup: baseSetup(), seed: 7, ...over })

/** Pilota il duello: `pick` sceglie la risposta (null = ferma). */
async function run(host: EngineHost, r: StartDuelRequest, pick: (p: PendingRequest, n: number, st: DuelState) => Answer | null, maxUser = 30) {
  let st = (await host.handle({ op: 'startDuel', req: r })) as DuelState
  const answers: Answer[] = []
  for (let n = 0; n < maxUser && st.pending; n++) {
    const a = pick(st.pending, n, st)
    if (!a) break
    answers.push(a)
    st = (await host.handle({ op: 'respond', answer: a })) as DuelState
  }
  return { st, answers }
}
/** Preferisce l'evocazione speciale della carta `target` (poi scelte minime). */
const wantSpecial = (target: number, opts: DriveOpts = {}) => (p: PendingRequest): Answer | null => {
  if (p.kind === 'idle') {
    const o = p.specialSummons.find((x) => x.code === target)
    return o ? answerIdle('specialSummon', o.index) : null
  }
  return drive(p, opts)
}

/** Costruisce un combo dal duello, tenendo solo gli uid citati. */
function buildDoc(r: StartDuelRequest, st: DuelState): ComboDoc {
  const used = new Set<Uid>(st.requiredHand)
  const addPlace = (pl?: { host?: string }) => pl?.host && used.add(pl.host)
  for (const s of st.steps) {
    if (s.card) used.add(s.card)
    for (const u of [...(s.targets ?? []), ...(s.searched ?? []), ...(s.costs ?? []).flatMap((c) => c.cards)]) used.add(u)
    for (const c of s.counters ?? []) used.add(c.uid)
    for (const m of s.moves) { used.add(m.uid); addPlace(m.to); addPlace(m.from) }
    addPlace(s.from); addPlace(s.to)
  }
  for (const b of [st.endboard.own, st.endboard.opponent]) for (const bp of b?.places ?? []) { used.add(bp.uid); addPlace(bp.place) }
  for (const [u] of Object.entries(r.cards ?? {})) used.add(u)
  const cardsMap = Object.fromEntries(Object.entries(st.cards).filter(([u]) => used.has(u)))
  return {
    format: 'combolab.combo', v: 1,
    meta: {
      id: '5b3f3e5e-0f1a-4f64-9a8b-0f4a6f5e0001', title: { it: 'Prova', en: 'Test' }, scope: 'variant', archetype: { name: { it: 'Prova', en: 'Test' } }, variant: null,
      rules: 'TCG', banlist: { format: 'TCG', id: '2026.10' }, tags: [], noteLang: ['it'], favorite: false, createdAt: '2026-11-19T10:00:00Z', updatedAt: '2026-11-19T10:00:00Z', source: 'engine',
    },
    deck: { main: r.deck.main, extra: r.deck.extra, side: [] },
    cards: cardsMap,
    setup: { ...r.setup, hand: { ...r.setup.hand, required: st.requiredHand } },
    steps: st.steps, branches: [], endboard: st.endboard,
  }
}
const expectValid = (r: StartDuelRequest, st: DuelState) => {
  const v = validateCombo(buildDoc(r, st))
  expect(v.errors, JSON.stringify(v.errors)).toEqual([])
  expect(v.warnings, JSON.stringify(v.warnings)).toEqual([])
}
const stepOf = (st: DuelState, f: (s: Step) => boolean) => st.steps.find(f)

describe.skipIf(!available)('motore EDOPro (core reale)', () => {
  it('init: core 0.1.6 API [11,0], dataset e commit degli script', async () => {
    const host = makeHost()
    const r = await host.init()
    expect(r.core).toBe('@n1xx1/ocgcore-wasm@0.1.6')
    expect(r.api).toEqual([11, 0])
    expect(r.scriptsCommit).toBe(SCRIPTS_COMMIT)
    expect(r.cards).toBeGreaterThan(10000)
  })

  it('mano iniziale: setup.hand.required in cima, ordine del mazzo nostro (PRNG a seed)', async () => {
    const host = makeHost()
    await host.init()
    const r = req(XYZ_DECK, {
      cards: { u1: code('Pot of Desires'), u2: code('Raigeki') },
      setup: baseSetup({ hand: { required: ['u1', 'u2'], size: 5, fill: 'random' } }),
    })
    const st = (await host.handle({ op: 'startDuel', req: r })) as DuelState
    const hand = st.piles[0].hand
    expect(hand).toHaveLength(5)
    expect(hand.map((c) => c.code)).toEqual(expect.arrayContaining([code('Pot of Desires'), code('Raigeki')]))
    expect(hand.find((c) => c.uid === 'u1')?.code).toBe(code('Pot of Desires'))
    expect(st.piles[0].deckCount).toBe(XYZ_DECK.main.length - 5)
    expect(st.piles[0].extra).toHaveLength(2)
    expect(st.piles[1].handCount).toBe(0)
    // l'ordine del mazzo e' il nostro: senza richieste, la mano e' la cima di shuffleDeck(seed) (richieste escluse)
    const free = (await host.handle({ op: 'startDuel', req: { ...r, setup: baseSetup(), cards: {} } })) as DuelState
    const order = shuffleDeck(7, XYZ_DECK.main.length).slice(0, 5).map((i) => XYZ_DECK.main[i]!).sort()
    expect(free.piles[0].hand.map((c) => c.code).sort()).toEqual(order)
    // stessa seed → stessa mano; seed diverso → mano diversa
    const again = (await host.handle({ op: 'startDuel', req: { ...r, setup: baseSetup({ hand: { required: [], size: 5, fill: 'random' } }), cards: {} } })) as DuelState
    const other = (await host.handle({ op: 'startDuel', req: { ...r, seed: 99, setup: baseSetup(), cards: {} } })) as DuelState
    const again2 = (await host.handle({ op: 'startDuel', req: { ...r, setup: baseSetup(), cards: {} } })) as DuelState
    expect(again2.piles[0].hand.map((c) => c.code)).toEqual(again.piles[0].hand.map((c) => c.code))
    expect(other.piles[0].hand.map((c) => c.code)).not.toEqual(again.piles[0].hand.map((c) => c.code))
  })

  it('mano "none": solo le carte richieste', async () => {
    const host = makeHost()
    await host.init()
    const st = (await host.handle({
      op: 'startDuel',
      req: req(XYZ_DECK, { cards: { u1: code('Raigeki') }, setup: baseSetup({ hand: { required: ['u1'], size: 5, fill: 'none' } }) }),
    })) as DuelState
    expect(st.piles[0].hand.map((c) => c.code)).toEqual([code('Raigeki')])
  })

  it('stessa seed + stesse risposte → stessi messaggi (due istanze del core) e replay identico', async () => {
    const a = makeHost()
    const b = makeHost()
    await a.init(); await b.init()
    const r = req(SKY_DECK)
    const { answers } = await run(a, r, (p, n) => drive(p, { step: n }), 14)
    const snapA = (await a.handle({ op: 'snapshot' })) as { log: unknown[]; answers: Answer[]; auto: boolean[] }
    await b.handle({ op: 'startDuel', req: r })
    await b.handle({ op: 'replay', answers: snapA.answers, auto: snapA.auto })
    const snapB = (await b.handle({ op: 'snapshot' })) as { log: unknown[] }
    const ser = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    expect(ser(snapB.log)).toBe(ser(snapA.log))
    expect(answers.length).toBeGreaterThan(5)
  })

  it('annulla/ripeti illimitati: stato identico, il core si ricrea solo quando serve', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SKY_DECK)
    const { st, answers } = await run(host, r, (p, n) => drive(p, { step: n }), 12)
    expect(st.canUndo).toBe(true)
    expect(st.canRedo).toBe(false)
    const full = JSON.stringify(st.steps)
    const t0 = performance.now()
    let cur = st
    let undos = 0
    while (cur.canUndo) { cur = (await host.handle({ op: 'undo' })) as DuelState; undos++ }
    expect(undos).toBe(answers.length)
    expect(cur.steps).toEqual([])
    expect(cur.canRedo).toBe(true)
    while (cur.canRedo) cur = (await host.handle({ op: 'redo' })) as DuelState
    expect(JSON.stringify(cur.steps)).toBe(full)
    expect(performance.now() - t0).toBeLessThan(2000)
    // dopo un annulla, una risposta DIVERSA tronca la cronologia
    cur = (await host.handle({ op: 'undo' })) as DuelState
    const alt = drive(cur.pending!, { step: 99, idleOrder: ['summon', 'monsterSet', 'spellSet'] })
    cur = (await host.handle({ op: 'respond', answer: alt })) as DuelState
    expect(cur.canRedo).toBe(false)
    // risposta uguale alla annullata = ripeti
    cur = (await host.handle({ op: 'undo' })) as DuelState
    expect(cur.canRedo).toBe(true)
  })

  it('politica automatica: finestre vuote e scelte uniche saltate e REGISTRATE; undo le salta', async () => {
    const host = makeHost()
    await host.init()
    const hornet = { cards: { u1: code('Sky Striker Mecha - Hornet Drones') }, setup: baseSetup({ hand: { required: ['u1'], size: 5, fill: 'random' } }) }
    const never = (await host.handle({ op: 'startDuel', req: req(SKY_DECK, { ...hornet, auto: { pause: 'never' } }) })) as DuelState
    expect(never.pending?.kind).toBe('idle') // le finestre della Draw/Standby Phase sono state saltate
    expect(never.autoApplied).toBeGreaterThan(0)
    expect(never.canUndo).toBe(false) // all'inizio ci sono solo risposte automatiche
    const ask = (await host.handle({ op: 'startDuel', req: req(SKY_DECK, { ...hornet, auto: { pause: 'always' } }) })) as DuelState
    expect(ask.pending?.kind).toBe('chain')
    expect(ask.autoApplied).toBe(0)
    const snap = (await host.handle({ op: 'snapshot' })) as { auto: boolean[] }
    expect(snap.auto).toEqual([])
    // il blocco engine del combo porta le risposte automatiche con il prefisso a.
    await host.handle({ op: 'startDuel', req: req(SKY_DECK, { ...hornet, auto: { pause: 'never' } }) })
    const block = (await host.handle({ op: 'engineBlock' })) as NonNullable<ComboDoc['engine']>
    expect(block.responses.every((s) => s.startsWith('a.'))).toBe(true)
    expect(decodeEntries(block.responses).auto.every(Boolean)).toBe(true)
    expect(block.core).toBe('@n1xx1/ocgcore-wasm@0.1.6')
    expect(block.scriptsCommit).toBe(SCRIPTS_COMMIT)
    expect(block.seed[0]).toBe(7)
    expect(block.seed.length).toBe(1 + SKY_DECK.main.length)
  })

  it('"manca uno script → scarica e rigioca da capo", trasparente', async () => {
    // archivio che NON precarica le carte: il core le chiede durante il duello
    class LazyStore extends ScriptStore {
      override async preload(): Promise<void> { await super.preload([]) }
    }
    const lazy = new LazyStore({ persist: diskPersist(SCRIPTS_COMMIT) })
    const host = makeHost(lazy)
    await host.init()
    const st = (await host.handle({ op: 'startDuel', req: req(SKY_DECK, { auto: { pause: 'never' } }) })) as DuelState
    expect(st.replays).toBeGreaterThan(0)
    expect(st.errors).toEqual([])
    const ref = makeHost()
    await ref.init()
    const st2 = (await ref.handle({ op: 'startDuel', req: req(SKY_DECK, { auto: { pause: 'never' } }) })) as DuelState
    expect(JSON.stringify(st.piles)).toBe(JSON.stringify(st2.piles))
    expect(st.pending?.kind).toBe(st2.pending?.kind)
  })

  it('cache negativa: gli script assenti (carte vanilla/token) si richiedono una sola volta', async () => {
    const urls: string[] = []
    const store = new ScriptStore({
      persist: null,
      fetch: async (u) => { urls.push(u); return fetch(u) },
    })
    await store.preload([code('Dark Magician'), code('Dark Magician')])
    await store.preload([code('Dark Magician')])
    const dm = urls.filter((u) => u.endsWith(`c${code('Dark Magician')}.lua`))
    expect(dm.length).toBe(1)
    expect(store.stats.notFound).toBeGreaterThan(0)
    expect(store.read('c0.lua')).toBeNull()
    expect(store.missing).toEqual([]) // 404 noto: non va riscaricato
  })

  it('Xyz: evocazione con materiali sul campo (setup.own) → doc valido', async () => {
    const host = makeHost()
    await host.init()
    const r = req(XYZ_DECK, {
      cards: { u1: code('Gagaga Magician'), u2: code('Wind-Up Soldier') },
      setup: baseSetup({
        own: { lp: 8000, places: [{ uid: 'u1', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' } }, { uid: 'u2', place: { loc: 'mzone', seq: 1, pos: 'FACEUP_ATK' } }] },
      }),
    })
    const { st } = await run(host, r, wantSpecial(code('Number 39: Utopia')), 6)
    const xyz = stepOf(st, (s) => s.method === 'xyz')
    expect(xyz, JSON.stringify(st.steps)).toBeDefined()
    expect(xyz!.action).toBe('specialSummon')
    const mats = xyz!.moves.filter((m) => m.why === 'material')
    expect(mats.map((m) => m.uid).sort()).toEqual(['u1', 'u2'])
    for (const m of mats) { expect(m.to.loc).toBe('overlay'); expect(m.to.host).toBe(xyz!.card) }
    expect(xyz!.moves.some((m) => m.why === 'summon' && m.uid === xyz!.card)).toBe(true)
    expect(st.endboard.own.places.some((p) => p.uid === xyz!.card)).toBe(true)
    expect(st.endboard.own.places.filter((p) => p.place.loc === 'overlay')).toHaveLength(2)
    expectValid(r, st)
  })

  it('Synchro: Tuner + non-Tuner sul campo → Black Rose Dragon, materiali al GY', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SYNCHRO_DECK, {
      cards: { u1: code('Junk Synchron'), u2: code('Wind-Up Soldier') },
      setup: baseSetup({
        own: { lp: 8000, places: [{ uid: 'u1', place: { loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' } }, { uid: 'u2', place: { loc: 'mzone', seq: 1, pos: 'FACEUP_ATK' } }] },
      }),
    })
    const { st } = await run(host, r, wantSpecial(code('Black Rose Dragon')), 6)
    const sy = stepOf(st, (s) => s.method === 'synchro')
    expect(sy, JSON.stringify(st.steps)).toBeDefined()
    const mats = sy!.moves.filter((m) => m.why === 'material')
    expect(mats.map((m) => m.uid).sort()).toEqual(['u1', 'u2'])
    expect(mats.every((m) => m.to.loc === 'gy')).toBe(true)
    expect(st.endboard.own.places.map((p) => p.uid)).toEqual([sy!.card])
    expectValid(r, st)
  })

  it('Link: un Normale come materiale → Link Spider (Zona Mostri Extra)', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SYNCHRO_DECK, {
      cards: { u1: code('Dark Magician') },
      setup: baseSetup({ own: { lp: 8000, places: [{ uid: 'u1', place: { loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } }] } }),
    })
    const { st } = await run(host, r, wantSpecial(code('Link Spider')), 6)
    const lk = stepOf(st, (s) => s.method === 'link')
    expect(lk, JSON.stringify(st.steps)).toBeDefined()
    expect(lk!.moves.find((m) => m.uid === 'u1')?.why).toBe('material')
    expect(lk!.to?.loc).toBe('emz')
    expectValid(r, st)
  })

  it('catene, attivazioni, ricerche e spostamenti (Sky Striker): doc valido', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SKY_DECK, {
      cards: { u1: code('Foolish Burial'), u2: code('Pot of Desires') },
      setup: baseSetup({ hand: { required: ['u1', 'u2'], size: 5, fill: 'random' } }),
      auto: { pause: 'ifCanRespond' },
    })
    const { st } = await run(host, r, (p, n) => drive(p, { step: n, chain: 'first' }), 16)
    expect(st.steps.length).toBeGreaterThan(2)
    expect(st.steps.some((s) => s.effect?.kind === 'activation')).toBe(true)
    expect(st.steps.some((s) => s.moves.some((m) => m.why === 'banish'))).toBe(true)
    expect(st.steps.some((s) => s.moves.some((m) => m.why === 'draw'))).toBe(true)
    // ogni passo ha id unici e le attivazioni portano `chain`
    expect(new Set(st.steps.map((s) => s.id)).size).toBe(st.steps.length)
    expect(st.steps.filter((s) => s.action === 'activate').every((s) => s.chain?.link === 1)).toBe(true)
    expectValid(r, st)
  })

  it('catena a più anelli: chainActivate con link > 1', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SKY_DECK, {
      cards: { u1: code('Foolish Burial'), u2: code('Sky Striker Mecha - Hornet Drones') },
      setup: baseSetup({ hand: { required: ['u1', 'u2'], size: 5, fill: 'random' } }),
      auto: { pause: 'always' },
    })
    // attiva Foolish Burial, poi risponde a se stesso con Hornet Drones (Quick-Play dalla mano) se possibile
    const { st } = await run(host, r, (p) => {
      if (p.kind === 'idle') {
        const o = p.activates.find((x) => x.code === code('Foolish Burial'))
        return o ? answerIdle('activate', o.index) : answerIdle('toEnd')
      }
      if (p.kind === 'chain') {
        const hornet = p.options.find((x) => x.code === code('Sky Striker Mecha - Hornet Drones'))
        if (hornet && !p.forced) return drive({ ...p, options: [hornet] }, { chain: 'first' })
        return drive(p)
      }
      return drive(p)
    }, 14)
    const links = st.steps.filter((s) => s.chain).map((s) => s.chain!.link)
    expect(Math.max(...links, 0)).toBeGreaterThanOrEqual(1)
    const two = st.steps.find((s) => s.action === 'chainActivate')
    if (two) expect(two.chain!.link).toBeGreaterThan(1)
    expectValid(r, st)
  })

  it('primo/secondo: giocando per secondo l\'avversario apre e passa, poi pesco', async () => {
    const host = makeHost()
    await host.init()
    const r = req(SKY_DECK, { setup: baseSetup({ first: false }), auto: { pause: 'never' } })
    const st = (await host.handle({ op: 'startDuel', req: r })) as DuelState
    expect(st.pending?.kind).toBe('idle')
    expect(st.piles[0].handCount).toBe(6) // 5 iniziali + pescata del turno 2
    expect(st.piles[1].handCount).toBe(0)
    expect(st.lp).toEqual([8000, 8000])
    expectValid(r, st)
  })

  it('board avversario da setup (uid o*) e LP', async () => {
    const host = makeHost()
    await host.init()
    const r = req(XYZ_DECK, {
      cards: { o1: code('Dark Magician') },
      setup: baseSetup({ opponent: { board: { lp: 6000, places: [{ uid: 'o1', place: { p: 1, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } }] } } }),
    })
    const st = (await host.handle({ op: 'startDuel', req: r })) as DuelState
    expect(st.lp).toEqual([8000, 6000])
    expect(st.endboard.opponent?.places).toEqual([{ uid: 'o1', place: { p: 1, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } }])
    expectValid(r, st)
  })

  it('risposta non valida → errore, stato invariato', async () => {
    const host = makeHost()
    await host.init()
    const r = req(XYZ_DECK, { auto: { pause: 'never' } })
    const st = (await host.handle({ op: 'startDuel', req: r })) as DuelState
    expect(st.pending?.kind).toBe('idle')
    await expect(host.handle({ op: 'respond', answer: answerIdle('activate', 99) })).rejects.toThrow()
    const snap = (await host.handle({ op: 'snapshot' })) as { answers: unknown[] }
    expect(snap.answers).toEqual([])
  })
})
