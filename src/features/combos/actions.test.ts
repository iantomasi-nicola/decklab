import { describe, expect, it } from 'vitest'
import { applyStep, initialState, type GameState, type NPlace } from '@/domain/combo/state'
import type { ComboDoc, Uid } from '@/domain/combo/types'
import { validateCombo } from '@/domain/combo/validate'
import { destinations, optionsFor, pickByModifier, type Ctx, type Src } from './actions'
import { UNKNOWN_INFO, type CardInfo } from './cardKind'
import { addStep, applySetupDraft, createBlankDoc, deriveDoc, finalizeDoc, moveStep, normalizeGroups, pickText, remainingPool, toggleGroup, withNoteLang, withText } from './model'
import { destKey } from './zones'

const monster: CardInfo = { ...UNKNOWN_INFO, level: 4 }
const big: CardInfo = { ...UNKNOWN_INFO, level: 7 }
const spell: CardInfo = { ...UNKNOWN_INFO, kind: 'spell' }
const field: CardInfo = { ...UNKNOWN_INFO, kind: 'spell', field: true }
const xyz: CardInfo = { ...UNKNOWN_INFO, extra: 'xyz', level: 4 }
const link: CardInfo = { ...UNKNOWN_INFO, extra: 'link', level: 2 }

const state = (places: Record<Uid, NPlace>): GameState => ({ places, lp: [8000, 8000], counters: {} })
const ctx = (places: Record<Uid, NPlace>, infos: Record<Uid, CardInfo> = {}, mode: Ctx['mode'] = 'steps'): Ctx => ({
  state: state(places),
  infoOf: (u) => infos[u] ?? UNKNOWN_INFO,
  mode,
})
const src = (uid: Uid, place: NPlace, info: CardInfo): Src => ({ uid, place, info })
const ids = (o: { id: string }[]) => o.map((x) => x.id)
const hand: NPlace = { p: 0, loc: 'hand', seq: 0 }

describe('tabella origine → destinazione (§8.1)', () => {
  it('Mano (mostro) → Zona Mostro: Normale · Speciale · Calata', () => {
    const c = ctx({ u1: hand })
    const o = optionsFor(src('u1', hand, monster), { t: 'zone', p: 0, loc: 'mzone', seq: 2 }, c)
    expect(ids(o)).toEqual(['normalSummon', 'specialSummon', 'setMonster'])
    expect(o[0]!.draft).toMatchObject({ action: 'normalSummon', to: { loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } })
    expect(o[2]!.draft.moves[0]!.to.pos).toBe('FACEDOWN_DEF')
  })
  it('Mano (livello 7) → Zona Mostro: il Tributo è il default e chiede 2 tributi', () => {
    const o = optionsFor(src('u1', hand, big), { t: 'zone', p: 0, loc: 'mzone', seq: 0 }, ctx({ u1: hand }))
    expect(o[0]!.id).toBe('tributeSummon')
    expect(o[0]!.follow).toEqual({ kind: 'tribute', need: 2 })
  })
  it('Mano (Magia) → Zona M/T: Attiva · Cala; Terreno e Pendulum', () => {
    const c = ctx({ u1: hand, u2: hand })
    expect(ids(optionsFor(src('u1', hand, spell), { t: 'zone', p: 0, loc: 'szone', seq: 2 }, c))).toEqual(['activate', 'setSpellTrap'])
    expect(ids(optionsFor(src('u2', hand, field), { t: 'zone', p: 0, loc: 'fzone', seq: 0 }, c))).toEqual(['activate', 'setSpellTrap'])
    const pend: CardInfo = { ...UNKNOWN_INFO, pendulum: true }
    const dests = destinations(src('u3', hand, pend), ctx({ u3: hand })).map(destKey)
    expect(dests).toContain('z:0:szone:0')
    expect(dests).toContain('z:0:szone:4')
    expect(dests).not.toContain('z:0:szone:2')
  })
  it('Extra Deck → Zona Mostro/EMZ: Speciale col metodo dedotto dal tipo, poi i materiali', () => {
    const e: NPlace = { p: 0, loc: 'extra' }
    const o = optionsFor(src('u1', e, xyz), { t: 'zone', p: 0, loc: 'mzone', seq: 1 }, ctx({ u1: e }))
    expect(o).toHaveLength(1)
    expect(o[0]!.draft).toMatchObject({ action: 'specialSummon', method: 'xyz' })
    expect(o[0]!.follow).toEqual({ kind: 'materials', xyz: true, host: 'u1' })
    const l = optionsFor(src('u2', e, link), { t: 'zone', p: 0, loc: 'emz', seq: 0 }, ctx({ u2: e }))
    expect(l[0]!.draft).toMatchObject({ method: 'link', to: { loc: 'emz', seq: 0, p: 0 } })
  })
  it('Cimitero → Zona: Speciale · Cala', () => {
    const g: NPlace = { p: 0, loc: 'gy' }
    expect(ids(optionsFor(src('u1', g, monster), { t: 'zone', p: 0, loc: 'mzone', seq: 0 }, ctx({ u1: g })))).toEqual(['specialSummon', 'setMonster'])
  })
  it('Carta in campo → Cimitero / Bandite / Mano / Deck', () => {
    const f: NPlace = { p: 0, loc: 'mzone', seq: 1, pos: 'FACEUP_ATK' }
    const c = ctx({ u1: f })
    const s = src('u1', f, monster)
    expect(ids(optionsFor(s, { t: 'pile', p: 0, loc: 'gy' }, c))).toEqual(['sendToGY', 'destroy'])
    expect(ids(optionsFor(s, { t: 'pile', p: 0, loc: 'banished' }, c))).toEqual(['banish'])
    expect(ids(optionsFor(s, { t: 'pile', p: 0, loc: 'hand' }, c))).toEqual(['returnToHand'])
    expect(ids(optionsFor(s, { t: 'pile', p: 0, loc: 'deck' }, c))).toEqual(['deckTop', 'deckBottom', 'deckShuffle'])
    expect(ids(optionsFor(s, { t: 'zone', p: 0, loc: 'mzone', seq: 3 }, c))).toEqual(['moveZone'])
  })
  it('Mano → Cimitero: scarta è il default', () => {
    expect(ids(optionsFor(src('u1', hand, monster), { t: 'pile', p: 0, loc: 'gy' }, ctx({ u1: hand })))[0]).toBe('discard')
  })
  it('su un mostro Xyz: materiale; Magia Equipaggiamento: Equipaggia', () => {
    const f: NPlace = { p: 0, loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' }
    const c = ctx({ x: f, u1: hand, u2: hand }, { x: xyz, u2: { ...spell, equip: true } })
    const a = optionsFor(src('u1', hand, monster), { t: 'card', uid: 'x' }, c)
    expect(a[0]!.draft).toMatchObject({ action: 'attach', targets: ['x'], to: { loc: 'overlay', host: 'x', seq: 0 } })
    const e = optionsFor(src('u2', hand, { ...spell, equip: true }), { t: 'card', uid: 'x' }, c)
    expect(ids(e)).toEqual(['attach', 'equip'])
  })
  it('destinazioni: le zone occupate e i tipi sbagliati non sono evidenziati', () => {
    const c = ctx({ u1: hand, u2: { p: 0, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } })
    const d = destinations(src('u1', hand, monster), c).map(destKey)
    expect(d).not.toContain('z:0:mzone:2')
    expect(d).toContain('z:0:mzone:3')
    expect(d.some((k) => k.includes('szone'))).toBe(false)
    expect(d).not.toContain('z:0:emz:0') // la EMZ è solo per l'Extra Deck
    expect(d).not.toContain('p:0:extra')
  })
  it('scorciatoie: Shift = Speciale, Alt = Cala, Ctrl = Attiva', () => {
    const o = optionsFor(src('u1', hand, monster), { t: 'zone', p: 0, loc: 'mzone', seq: 2 }, ctx({ u1: hand }))
    expect(pickByModifier(o, { shift: true })!.id).toBe('specialSummon')
    expect(pickByModifier(o, { alt: true })!.id).toBe('setMonster')
    expect(pickByModifier(o, {})).toBeNull()
    const s = optionsFor(src('u2', hand, spell), { t: 'zone', p: 0, loc: 'szone', seq: 2 }, ctx({ u2: hand }))
    expect(pickByModifier(s, { ctrl: true })!.id).toBe('activate')
  })
  it('configurazione: solo il posizionamento, senza azioni di gioco', () => {
    const o = optionsFor(src('u1', hand, monster), { t: 'zone', p: 0, loc: 'mzone', seq: 2 }, ctx({ u1: hand }, {}, 'setup'))
    expect(ids(o)).toEqual(['placeAtk', 'placeDef', 'placeSet'])
  })
})

const blank = (): ComboDoc =>
  createBlankDoc({
    id: 'c1',
    title: { it: 'T' },
    archetype: { name: { it: 'A' } },
    variant: null,
    rules: 'TCG',
    banlist: { format: 'TCG', id: '' },
    deck: { main: [100, 100, 200], extra: [300], side: [] },
    now: '2026-11-19T00:00:00.000Z',
  })

describe('modello del documento', () => {
  it('ogni passo applicato produce un documento valido e lo stato atteso', () => {
    let doc = blank()
    // carta dal Deck alla mano nella configurazione
    doc = applySetupDraft(doc, {
      step: { action: 'custom', card: 'u1', moves: [{ uid: 'u1', to: { p: 0, loc: 'hand', seq: 0 } }] },
      register: { u1: 100 },
    })
    expect(doc.setup.hand.required).toEqual(['u1'])
    expect(validateCombo(doc).errors).toEqual([])
    expect(remainingPool(doc).main.get(100)).toBe(1)
    const r = addStep(doc, 0, {
      step: { action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', from: { p: 0, loc: 'hand', seq: 0 }, to: { p: 0, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' }, why: 'summon' }] },
    })
    expect(r.doc.steps.map((s) => s.id)).toEqual(['s1'])
    expect(r.cursor).toBe(1)
    expect(applyStep(initialState(r.doc), r.doc.steps[0]!).places.u1).toMatchObject({ loc: 'mzone', seq: 2 })
    expect(validateCombo(r.doc).errors).toEqual([])
  })
  it('inserisce in mezzo (cursore) e mantiene id unici', () => {
    let doc = blank()
    for (let i = 0; i < 3; i++) doc = addStep(doc, doc.steps.length, { step: { action: 'custom', label: String(i), moves: [] } }).doc
    const r = addStep(doc, 1, { step: { action: 'custom', label: 'x', moves: [] } })
    expect(r.doc.steps.map((s) => s.label)).toEqual(['0', 'x', '1', '2'])
    expect(new Set(r.doc.steps.map((s) => s.id)).size).toBe(4)
  })
  it('gruppi "ordine libero" restano contigui (V5)', () => {
    let doc = blank()
    for (let i = 0; i < 4; i++) doc = addStep(doc, doc.steps.length, { step: { action: 'custom', label: String(i), moves: [] } }).doc
    doc = toggleGroup(doc, 's2')
    doc = toggleGroup(doc, 's3')
    expect(doc.steps.map((s) => s.group)).toEqual(['g1', 'g1', 'g1', undefined])
    const moved = moveStep(doc, 's2', 1) // s2 ↔ s3: restano contigui
    expect(validateCombo(moved).errors.filter((e) => e.rule === 'V5')).toEqual([])
    const broken = normalizeGroups([{ ...doc.steps[0]!, group: 'g9' }, doc.steps[1]!, { ...doc.steps[2]!, group: 'g9' }])
    expect(broken.map((s) => s.group)).toEqual([undefined, undefined, undefined])
  })
  it('variante da un passo: copia setup + passi, registro ridotto, derivedFrom, madre invariata', () => {
    let doc = blank()
    doc = applySetupDraft(doc, { step: { action: 'custom', moves: [{ uid: 'u1', to: { p: 0, loc: 'hand', seq: 0 } }] }, register: { u1: 100 } })
    doc = addStep(doc, 0, { step: { action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', to: { p: 0, loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' } }] } }).doc
    doc = addStep(doc, 1, { step: { action: 'search', card: 'u2', searched: ['u2'], moves: [{ uid: 'u2', to: { p: 0, loc: 'hand', seq: 0 } }] }, register: { u2: 200 } }).doc
    const before = JSON.stringify(doc)
    const incl = deriveDoc(doc, 0, true, { id: 'c2', title: { it: 'V' }, now: '2026-11-19T01:00:00.000Z' })
    expect(incl.steps.map((s) => s.id)).toEqual(['s1'])
    expect(incl.meta.derivedFrom).toMatchObject({ comboId: 'c1', afterStep: 's1' })
    expect(Object.keys(incl.cards)).toEqual(['u1']) // u2 non è più citata
    expect(validateCombo(incl).errors).toEqual([])
    const excl = deriveDoc(doc, 0, false, { id: 'c3', title: { it: 'V' }, now: '2026-11-19T01:00:00.000Z' })
    expect(excl.steps).toEqual([])
    expect(excl.meta.derivedFrom).toMatchObject({ comboId: 'c1', afterStep: null })
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('testi a campo unico', () => {
  it('mostra la lingua corrente, altrimenti la prima disponibile', () => {
    expect(pickText({ it: 'ciao', en: 'hello' }, 'en')).toBe('hello')
    expect(pickText({ it: 'ciao' }, 'en')).toBe('ciao')
    expect(pickText({ en: 'hello' }, 'it')).toBe('hello')
    expect(pickText({ it: 'a', en: 'b' }, 'fr', ['en'])).toBe('b')
    expect(pickText(undefined, 'it')).toBe('')
  })
  it('salva sotto la lingua corrente e la mette per prima in noteLang', () => {
    expect(withText({ it: 'ciao' }, 'en', 'hello')).toEqual({ it: 'ciao', en: 'hello' })
    expect(withText({ it: 'ciao', en: 'x' }, 'en', '')).toEqual({ it: 'ciao' })
    expect(withNoteLang(['it'], 'en')).toEqual(['en', 'it'])
    expect(withNoteLang(['en', 'it'], 'en')).toEqual(['en', 'it'])
  })
  it('finalizeDoc mantiene l\'ordine di noteLang e toglie le lingue senza testo', () => {
    let doc = blank()
    doc = { ...doc, meta: { ...doc.meta, title: { it: 'T', en: 'T' }, noteLang: ['en', 'it'] } }
    expect(finalizeDoc(doc, 'x').meta.noteLang).toEqual(['en', 'it'])
    doc = { ...doc, meta: { ...doc.meta, title: { en: 'T' } } }
    expect(finalizeDoc(doc, 'x').meta.noteLang).toEqual(['en'])
  })
})
