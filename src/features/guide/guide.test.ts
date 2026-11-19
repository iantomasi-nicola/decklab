import { describe, expect, it } from 'vitest'
import fixtureJson from '../../../tests/fixtures/combo/v1.json'
import { createCardIndex } from '@/domain/deck/cardIndex'
import type { Card } from '@/domain/types'
import type { ComboDoc } from '@/domain/combo/types'
import { buildSteps, boardView, endboardState, handOf, motherDivergence, stepDetails, stepsUsingCards, variantsOf } from './guideModel'
import { guideLocales } from './locales'
import { legalityOf, limitedCards } from './legality'
import { makeNoteResolver, noteToPlain, parseNote, resolveDocNotes } from './notes'

const fixture = () => structuredClone(fixtureJson) as unknown as ComboDoc
const NAMES: Record<number, string[]> = {
  999000001: ['Card A', 'Carta A'],
  999000002: ['Card B', 'Carta B'],
  999000003: ['Card C', 'Carta C'],
  14558127: ['Ash Blossom & Joyous Spring'],
}
const doc = () => {
  const d = fixture()
  d.cards = { u1: 999000001, u2: 999000002, u3: 999000003, o1: 14558127 }
  return d
}

describe('note con carte inline', () => {
  const r = makeNoteResolver(doc(), (c) => NAMES[c] ?? [])
  const plain = (t: string, lang: 'it' | 'en' = 'en') => noteToPlain(parseNote(t, r), (c) => (lang === 'it' ? (NAMES[c]![1] ?? NAMES[c]![0]!) : NAMES[c]![0]!))

  it('risolve @nome parziale, anche con altre parole dopo', () => {
    const segs = parseNote('Se usa @Ash e poi continui', r)
    expect(segs).toEqual([
      { t: 'text', s: 'Se usa ' },
      { t: 'card', code: 14558127, raw: 'Ash' },
      { t: 'text', s: ' e poi continui' },
    ])
  })
  it('prende il nome più lungo possibile', () => {
    expect(parseNote('@Card A.', r)).toEqual([{ t: 'card', code: 999000001, raw: 'Card A' }, { t: 'text', s: '.' }])
    expect(parseNote('@Carta B!', r)[0]).toEqual({ t: 'card', code: 999000002, raw: 'Carta B' })
  })
  it('supporta @[Nome], @uid e @passcode', () => {
    expect(plain('x @[Card C] y')).toBe('x Card C y')
    expect(plain('x @u2 y')).toBe('x Card B y')
    expect(plain('x @999000003 y')).toBe('x Card C y')
  })
  it('il nome esce nella lingua scelta', () => {
    expect(plain('Cerca @u1', 'it')).toBe('Cerca Carta A')
    expect(plain('Cerca @u1', 'en')).toBe('Cerca Card A')
  })
  it('lascia invariato ciò che non si risolve (email, @sconosciuto)', () => {
    expect(plain('scrivi a nicola@example.com o @Zzz')).toBe('scrivi a nicola@example.com o @Zzz')
    expect(plain('nessun riferimento')).toBe('nessun riferimento')
    expect(plain('@')).toBe('@')
  })
  it('resolveDocNotes sostituisce le note in ogni lingua', () => {
    const d = doc()
    d.steps[0]!.note = { it: 'Poi @u1', en: 'Then @u1' }
    const out = resolveDocNotes(d, r, (c, l) => NAMES[c]![l === 'it' ? 1 : 0] ?? NAMES[c]![0]!)
    expect(out.steps[0]!.note).toEqual({ it: 'Poi Carta A', en: 'Then Card A' })
    expect(d.steps[0]!.note).toEqual({ it: 'Poi @u1', en: 'Then @u1' }) // originale intatto
  })
})

describe('modello guida', () => {
  it('mano: carte necessarie e carte a caso', () => {
    const d = doc()
    const h = handOf(d)
    expect(h.required.map((c) => c.uid)).toEqual(['u1', 'u2'])
    expect(h.random).toBe(3)
    d.setup.hand.fill = 'none'
    expect(handOf(d).random).toBe(0)
  })
  it('passi: numerazione, catene e rami agganciati', () => {
    const d = doc()
    d.steps = [
      { id: 's1', action: 'normalSummon', card: 'u1', moves: [] },
      { id: 's2', action: 'activate', card: 'u1', chain: { id: 'c1', link: 1 }, moves: [] },
      { id: 's3', action: 'chainActivate', card: 'u2', chain: { id: 'c1', link: 2 }, moves: [] },
      { id: 's4', action: 'resolve', ref: 's2', moves: [], group: 'g' },
    ]
    d.branches = [{ id: 'b1', condition: { afterStep: 's2', window: 'activation', opponent: { code: 14558127 } }, steps: [], rejoin: null }]
    const s = buildSteps(d)
    expect(s.map((x) => x.number)).toEqual([1, 2, 3, 4])
    expect(s[1]!.chain).toMatchObject({ first: true, last: false, link: 1 })
    expect(s[2]!.chain).toMatchObject({ first: false, last: true, link: 2 })
    expect(s[3]!.group).toMatchObject({ first: true, last: true })
    expect(s[1]!.branches.map((b) => b.id)).toEqual(['b1'])
    expect(s[0]!.branches).toEqual([])
  })
  it('dettagli del passo: cerca, materiali, costi, bersagli', () => {
    const det = stepDetails({
      id: 's', action: 'activate', searched: ['u2'], targets: ['u3'], costs: [{ kind: 'discard', cards: ['u1'] }],
      moves: [{ uid: 'u1', to: { loc: 'gy' }, why: 'material' }],
    })
    expect(det.map((d) => d.kind)).toEqual(['search', 'materials', 'costs', 'targets'])
  })
  it('board finale: ricalcolato o preso dal documento', () => {
    const d = doc()
    d.steps = [{ id: 's1', action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', to: { loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' }, why: 'summon' }] }]
    const st = endboardState(d)
    const own = boardView(st, 0, d.cards)
    expect(own.monsters.map((c) => c.uid)).toEqual(['u1'])
    expect(own.backrow).toEqual([])
    d.endboard = { own: { lp: 4000, places: [{ uid: 'u3', place: { loc: 'emz', seq: 0, pos: 'FACEUP_ATK' } }] } }
    const st2 = endboardState(d)
    expect(boardView(st2, 0, d.cards).monsters.map((c) => c.uid)).toEqual(['u3'])
    expect(boardView(st2, 0, d.cards).lp).toBe(4000)
  })
  it('varianti: passo di divergenza e madre', () => {
    const d = doc()
    d.steps = [
      { id: 's1', action: 'normalSummon', moves: [] },
      { id: 's2', action: 'normalSummon', moves: [] },
    ]
    const child = (id: string, after: string | null, title: string) => ({
      id,
      name: { it: title },
      payload: { meta: { ...d.meta, derivedFrom: { comboId: 'M', afterStep: after } } },
    })
    const rows = variantsOf(d, 'M', [child('c1', 's2', 'B'), child('c2', null, 'A'), child('c3', 's1', 'C'), { id: 'x', name: { it: 'altra' }, payload: { meta: d.meta } }])
    expect(rows.map((r) => [r.id, r.afterStepNo])).toEqual([['c2', 0], ['c3', 1], ['c1', 2]])
    const own = { ...d, meta: { ...d.meta, derivedFrom: { comboId: 'M', afterStep: 's2' } } }
    expect(motherDivergence(own, { id: 'M', name: { it: 'Madre' }, payload: d })).toEqual({ motherId: 'M', title: { it: 'Madre' }, afterStepNo: 2 })
    expect(motherDivergence(d, undefined)).toBeNull()
  })
  it('passi che usano carte con limite', () => {
    const d = doc()
    d.steps = [
      { id: 's1', action: 'normalSummon', card: 'u1', moves: [] },
      { id: 's2', action: 'activate', card: 'u2', targets: ['u3'], moves: [] },
    ]
    expect([...stepsUsingCards(d, (c) => c, new Set([999000003]))]).toEqual(['s2'])
  })
})

describe('legalità con la banlist attuale', () => {
  const card = (id: number, extra = false): Card => ({ id, alias: 0, name: { en: `C${id}` }, type: 1, race: 1, attribute: 1, level: 4, atk: 0, def: 0, setcodes: [], isExtra: extra })
  const index = createCardIndex(Array.from({ length: 30 }, (_, i) => card(i + 1)))
  const mk = (main: number[]): ComboDoc => ({ ...doc(), deck: { main, extra: [], side: [] } })
  const main40 = (n1: number) => [...Array(n1).fill(1), ...Array.from({ length: 40 }, (_, i) => 2 + Math.floor(i / 3))].slice(0, 40) as number[]
  const old: import('@/domain/types').Banlist = { format: 'TCG', id: '2026.01', limits: {} }
  const cur: import('@/domain/types').Banlist = { format: 'TCG', id: '2026.10', limits: { 1: 1 } }

  it('senza dati: in caricamento; senza mazzo: nessuna verifica', () => {
    expect(legalityOf(mk(main40(1)), null).kind).toBe('loading')
    expect(legalityOf(mk([]), { index, banlists: [cur] }).kind).toBe('noDeck')
  })
  it("usa l'ultima banlist del formato", () => {
    const r = legalityOf(mk(main40(1)), { index, banlists: [old, cur] })
    expect(r).toMatchObject({ kind: 'legal', banlist: 'TCG 2026.10' })
  })
  it('segnala le carte oltre il limite della banlist attuale', () => {
    const r = legalityOf(mk(main40(3)), { index, banlists: [old, cur] })
    expect(r.kind).toBe('illegal')
    if (r.kind === 'illegal') expect(limitedCards(r.issues)).toEqual(new Set([1]))
  })
  it('banlist mancante: nessun limite, ma lo dichiara', () => {
    const r = legalityOf(mk(main40(3)), { index, banlists: [] })
    expect(r).toMatchObject({ kind: 'legal', missing: true })
  })
})

describe('testi it/en', () => {
  const keys = (o: unknown, p = ''): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort()
  it('stesse chiavi nelle due lingue', () => {
    expect(keys(guideLocales.it)).toEqual(keys(guideLocales.en))
  })
  it('nessun testo vuoto', () => {
    for (const l of [guideLocales.it, guideLocales.en]) {
      const walk = (o: unknown) => Object.values(o as Record<string, unknown>).forEach((v) => (typeof v === 'string' ? expect(v.trim()).not.toBe('') : walk(v)))
      walk(l)
    }
  })
})
