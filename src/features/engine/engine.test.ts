import { beforeEach, describe, expect, it } from 'vitest'
import { applyStep, initialState } from '@/domain/combo/state'
import type { ComboDoc, Step } from '@/domain/combo/types'
import { answerCards, answerChain, answerIdle } from '@/engine/answers'
import { cardInfo } from '@/features/combos/cardKind'
import { CODE, makeState, sampleRequests, scenarioClient } from '../../../tests/mocks/engineClient'
import { resetDuelForTests, unsupportedFromErrors, useDuel } from './duelStore'
import { actionsAt, actionsForCard, destsForCard, legalActions, whyNot } from './legal'
import { ENGINE_STRINGS, engText } from './strings'
import { docFromDuel, requestFromDoc, savedSeed, usedUids } from './sync'
import { reachableTotals, sumStatus, valuesOf } from './sum'
import { countersOf, refsOf, viewFromDuel } from './view'
import base from '../../../tests/fixtures/combo/v1.json'

const info = (uid: string) => {
  const mon = new Set(['u1', 'u2', 'u5', 'u6', 'u10', 'u11'])
  return cardInfo({ type: uid === 'u10' ? 0x800001 : uid === 'u11' ? 0x4000001 : mon.has(uid) ? 0x1 : uid === 'u3' ? 0x2 : 0x4, level: 4 })
}

describe('testi it/en', () => {
  it('stesse chiavi e stessi segnaposto', () => {
    const a = Object.keys(ENGINE_STRINGS.it).sort()
    expect(Object.keys(ENGINE_STRINGS.en).sort()).toEqual(a)
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join()
    for (const k of a) expect(ph(ENGINE_STRINGS.en[k as keyof typeof ENGINE_STRINGS.en]), k).toBe(ph(ENGINE_STRINGS.it[k as keyof typeof ENGINE_STRINGS.it]))
  })
  it('plurali', () => {
    expect(engText('it', 'sel.chainCount', { n: 1 })).toBe('1 effetto attivabile')
    expect(engText('en', 'sel.chainCount', { n: 2 })).toBe('2 effects available')
  })
})

describe('azioni legali (idle) → destinazioni di trascinamento', () => {
  const req = sampleRequests().idle!
  const state = viewFromDuel(makeState(req)).state
  const legal = legalActions(req, info, state)

  it('un mostro in mano ha Evoca e Cala sulle zone mostro libere (non su quelle occupate)', () => {
    const acts = actionsForCard(legal, 'u1')
    expect(acts.map((a) => a.kind).sort()).toEqual(['monsterSet', 'summon'])
    const d = destsForCard(legal, 'u1')
    expect(d.has('z:0:mzone:0')).toBe(true)
    expect(d.has('z:0:mzone:1')).toBe(false) // u6 occupa la zona 1
    expect(d.has('z:0:szone:0')).toBe(false)
    expect(d.has('z:1:mzone:0')).toBe(false)
  })
  it('Extra Deck: Evocazione Speciale in zona mostro libera o EMZ', () => {
    const d = destsForCard(legal, 'u10')
    expect(d.has('z:0:emz:0')).toBe(true)
    expect(d.has('z:0:mzone:4')).toBe(true)
  })
  it('Magia/Trappola in mano: Cala/Attiva sulle zone M/T libere', () => {
    const d = destsForCard(legal, 'u3')
    expect(d.has('z:0:szone:0')).toBe(true)
    expect(d.has('z:0:szone:2')).toBe(false) // u7 occupa la 2
    expect(actionsForCard(legal, 'u3').map((a) => a.kind).sort()).toEqual(['activate', 'spellSet'])
  })
  it('una carta in campo non si trascina: attiva e cambia posizione restano come azioni', () => {
    expect(actionsForCard(legal, 'u6').map((a) => a.kind).sort()).toEqual(['activate', 'posChange'])
    expect(destsForCard(legal, 'u6').size).toBe(0)
  })
  it('azione eseguibile solo sulla destinazione giusta; la risposta è quella del core', () => {
    const at = actionsAt(legal, 'u1', 'z:0:mzone:3')
    expect(at.map((a) => a.kind).sort()).toEqual(['monsterSet', 'summon'])
    expect(at.find((a) => a.kind === 'summon')!.answer).toEqual(answerIdle('summon', 0))
    expect(actionsAt(legal, 'u1', 'z:0:mzone:1')).toEqual([])
  })
  it('motivi di rifiuto', () => {
    expect(whyNot(req, { owner: 1, loc: 'mzone', isMonster: true, normalUsed: false })).toBe('why.opponent')
    expect(whyNot(req, { owner: 0, loc: 'hand', isMonster: true, normalUsed: true })).toBe('why.normalUsed')
    expect(whyNot(sampleRequests().chain!, { owner: 0, loc: 'hand', isMonster: true, normalUsed: false })).toBe('why.notIdle')
    expect(whyNot(req, { owner: 0, loc: 'gy', isMonster: false, normalUsed: false })).toBe('why.nothing')
  })
  it('battaglia: bersagli = mostri avversari, oppure tutte le zone se attacco diretto', () => {
    const b = sampleRequests().battle!
    const l = legalActions(b, info, state)
    expect([...destsForCard(l, 'u6')].sort()).toEqual(['c:o1', 'c:o2'])
    const bb = b as Extract<typeof b, { kind: 'battle' }>
    const direct = legalActions({ ...bb, attacks: [{ ...bb.attacks[0]!, canDirect: true }] }, info, state)
    expect(destsForCard(direct, 'u6').has('z:1:mzone:0')).toBe(true)
  })
  it('richiesta non di menu: nessuna azione', () => {
    expect(legalActions(sampleRequests().chain!, info, state)).toEqual([])
    expect(legalActions(null, info, state)).toEqual([])
  })
})

describe('mapper richiesta → UI', () => {
  it('ogni kind di richiesta elenca le carte citate', () => {
    const r = sampleRequests()
    expect(refsOf(r.idle!).length).toBeGreaterThan(8)
    expect(refsOf(r.unselect!).map((x) => x.uid)).toContain('u5')
    expect(refsOf(r.sum!).length).toBe(5)
    expect(refsOf(r.yesNo!)).toEqual([])
    expect(refsOf(null)).toEqual([])
  })
  it('viewFromDuel: campo dal core, pile, deck', () => {
    const v = viewFromDuel(makeState(null))
    expect(v.state.places.u6).toMatchObject({ p: 0, loc: 'mzone', seq: 1 })
    expect(v.state.places.u1).toMatchObject({ loc: 'hand' })
    expect(v.state.places.o1).toMatchObject({ p: 1, loc: 'mzone', seq: 2 })
    expect(v.state.places.u10).toMatchObject({ loc: 'extra' })
    expect(v.deckCount).toBe(28)
    expect(v.registry.u6).toBe(CODE.ash)
  })
  it('segnalini dai passi', () => {
    const st: Step = { id: 's1', action: 'placeCounter', moves: [], counters: [{ uid: 'u6', type: 'spell', delta: 2 }] }
    expect(countersOf([st])).toEqual({ u6: { spell: 2 } })
  })
  it('indici nelle risposte: SELECT_UNSELECT → i già scelti seguono le scegliibili', () => {
    const u = sampleRequests().unselect as Extract<ReturnType<typeof sampleRequests>[string], { kind: 'unselect' }>
    expect(u.selectable.length + u.selected[0]!.index).toBe(3)
  })
})

describe('somma di livelli', () => {
  it('carte a due valori', () => {
    expect(valuesOf(1 + (2 << 16))).toEqual([1, 2])
    expect(valuesOf(4)).toEqual([4])
    expect([...reachableTotals([4, 1 + (2 << 16)])].sort()).toEqual([5, 6])
  })
  it('esatta: raggiunta, superata, parziale', () => {
    expect(sumStatus(8, true, [4, 4])).toEqual({ shown: 8, ok: true, over: false })
    expect(sumStatus(8, true, [4, 7])).toMatchObject({ ok: false, over: true })
    expect(sumStatus(8, true, [4])).toMatchObject({ ok: false, over: false, shown: 4 })
    expect(sumStatus(8, true, [4, 3 + (5 << 16)])).toMatchObject({ ok: false }) // 7 o 9
    expect(sumStatus(8, true, [3 + (4 << 16), 4])).toMatchObject({ ok: true, shown: 8 })
  })
  it('almeno: basta superare', () => {
    expect(sumStatus(8, false, [7, 4])).toMatchObject({ ok: true })
    expect(sumStatus(8, false, [3])).toMatchObject({ ok: false })
  })
})

describe('documento ↔ duello', () => {
  const doc = structuredClone(base) as unknown as ComboDoc
  it('i passi del motore sostituiscono quelli della combo; le carte non citate non si salvano', () => {
    const step: Step = { id: 's1', action: 'normalSummon', card: 'u6', moves: [{ uid: 'u6', to: { loc: 'mzone', seq: 1 } }] }
    const d = makeState(null, { steps: [step], requiredHand: ['u1'] })
    const next = docFromDuel(doc, d, { core: 'x', scriptsCommit: 'y', cdbVersion: 'z', mode: 'MR5', seed: [7, 0, 1], responses: ['a'] })
    expect(next.steps).toEqual([step])
    expect(next.meta.source).toBe('engine')
    expect(next.setup.hand.required).toEqual(['u1'])
    expect(Object.keys(next.cards).sort()).toEqual(['u1', 'u6'])
    expect(next.engine?.seed).toEqual([7, 0, 1])
    expect(usedUids(next).has('u6')).toBe(true)
  })
  it('richiesta di avvio e seed salvato', () => {
    const d = { ...doc, engine: { core: 'x', scriptsCommit: 'y', cdbVersion: 'z', mode: 'MR5', seed: [9, ...doc.deck.main.map((_, i) => i)], responses: [] } } as ComboDoc
    expect(savedSeed(d)).toEqual({ seed: 9, order: doc.deck.main.map((_, i) => i) })
    expect(savedSeed(doc)).toBeNull()
    expect(requestFromDoc(d, 5).seed).toBe(5)
    expect(requestFromDoc(d, 5, [0]).deckOrder).toEqual([0])
    // lo stato iniziale della combo resta calcolabile dopo la sostituzione
    expect(applyStep(initialState(d), { id: 'x', action: 'custom', moves: [] }).lp[0]).toBe(8000)
  })
  it('carta non simulabile dagli errori Lua', () => {
    expect(unsupportedFromErrors(['[string "c12345678.lua"]:3: boom', 'x c999999.lua y'])).toEqual([12345678, 999999])
    expect(unsupportedFromErrors(['altro'])).toEqual([])
  })
})

describe('store del duello (client finto)', () => {
  const doc = structuredClone(base) as unknown as ComboDoc
  beforeEach(() => resetDuelForTests())
  const idle = sampleRequests().idle!

  it('avvia, risponde, annulla e ripete; le operazioni sono serializzate', async () => {
    const fake = scenarioClient([makeState(idle), makeState(sampleRequests().place!), makeState(idle, { steps: [] })])
    useDuel.getState().setClientFactory(() => fake)
    expect(await useDuel.getState().start(requestFromDoc(doc, 3))).toBe(true)
    expect(useDuel.getState().status).toBe('running')
    expect(useDuel.getState().state?.pending?.kind).toBe('idle')
    expect(fake.started).toHaveLength(1)
    expect((fake.started[0] as { auto: unknown }).auto).toEqual(useDuel.getState().prefs)
    // due risposte in rapida successione: la seconda aspetta la prima
    const p1 = useDuel.getState().respond(answerIdle('summon', 0))
    const p2 = useDuel.getState().respond(answerIdle('toEnd'))
    expect(useDuel.getState().busy).toBe(true)
    await Promise.all([p1, p2])
    expect(fake.answers).toHaveLength(2)
    expect(useDuel.getState().busy).toBe(false)
    expect(useDuel.getState().state?.position).toBe(2)
    await useDuel.getState().undo()
    expect(useDuel.getState().state?.position).toBe(1)
    expect(useDuel.getState().state?.canRedo).toBe(true)
    await useDuel.getState().redo()
    expect(useDuel.getState().state?.position).toBe(2)
    expect(useDuel.getState().engine?.responses).toHaveLength(2)
    await useDuel.getState().stop()
    expect(useDuel.getState().status).toBe('off')
    expect(useDuel.getState().state).toBeNull()
  })

  it('risposta rifiutata: lo stato resta, errore "invalid"; errore di script: stato di errore', async () => {
    const fake = scenarioClient([makeState(idle), makeState(idle)], {
      onRespond: (_a, i) => (i === 0 ? Object.assign(new Error('no'), { code: 'invalid-answer' }) : undefined),
    })
    useDuel.getState().setClientFactory(() => fake)
    await useDuel.getState().start(requestFromDoc(doc, 1))
    expect(await useDuel.getState().respond(answerChain(null))).toBe(false)
    expect(useDuel.getState().status).toBe('running')
    expect(useDuel.getState().error?.kind).toBe('invalid')
    const bad = scenarioClient([makeState(idle)])
    bad.startDuel = async () => { throw Object.assign(new Error('rete'), { code: 'script-fetch' }) }
    useDuel.getState().setClientFactory(() => bad)
    expect(await useDuel.getState().start(requestFromDoc(doc, 1))).toBe(false)
    expect(useDuel.getState().status).toBe('error')
    expect(useDuel.getState().error?.kind).toBe('script')
  })

  it('avanzamento degli script dagli eventi del worker', async () => {
    const fake = scenarioClient([makeState(idle)], { delayMs: 20 })
    useDuel.getState().setClientFactory(() => fake)
    const p = useDuel.getState().start(requestFromDoc(doc, 1))
    await new Promise((r) => setTimeout(r, 5))
    fake.emit({ event: 'scripts', done: 3, total: 10 })
    expect(useDuel.getState().load).toEqual({ done: 3, total: 10 })
    await p
    expect(useDuel.getState().load).toBeNull()
  })

  it('carta non simulabile: errori Lua → elenco passcode', async () => {
    const fake = scenarioClient([makeState(idle, { errors: ['c14558127.lua:1: attempt to index nil'] })])
    useDuel.getState().setClientFactory(() => fake)
    await useDuel.getState().start(requestFromDoc(doc, 1))
    expect(useDuel.getState().unsupported).toEqual([14558127])
  })

  it('le preferenze si salvano e passano al motore', async () => {
    useDuel.getState().setPrefs({ pause: 'never', sort: false })
    const fake = scenarioClient([makeState(idle)])
    useDuel.getState().setClientFactory(() => fake)
    await useDuel.getState().start(requestFromDoc(doc, 1))
    expect((fake.started[0] as { auto: { pause: string; sort: boolean } }).auto).toMatchObject({ pause: 'never', sort: false })
  })
})

describe('risposte di selezione', () => {
  it('SELECT_CARD usa gli indici originali del core', () => {
    const c = sampleRequests().cardsField as Extract<ReturnType<typeof sampleRequests>[string], { kind: 'cards' }>
    expect(answerCards(c, [3, 0])).toMatchObject({ indicies: [3, 0] })
    expect(answerCards(c, null)).toMatchObject({ indicies: null })
  })
})
