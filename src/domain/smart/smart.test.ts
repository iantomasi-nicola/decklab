import { describe, expect, it } from 'vitest'
import fixtureJson from '../../../tests/fixtures/combo/v1.json'
import type { ComboDoc, Step } from '../combo/types'
import type { Banlist, Card } from '../types'
import { createCardIndex } from '../deck/cardIndex'
import { checkCoherence } from './coherence'
import { drawHand, mulberry32, playableCombos, whatCanIDo } from './practiceHand'
import { banlistImpact, suggestReplacements } from './banlistImpact'

const fx = () => structuredClone(fixtureJson) as unknown as ComboDoc
const codes = (d: ComboDoc) => checkCoherence(d).map((i) => `${i.code.split('.').pop()}@${i.stepId}`)

describe('checkCoherence', () => {
  it('la fixture valida è coerente', () => expect(checkCoherence(fx())).toEqual([]))

  it('carta non disponibile / uid sconosciuto', () => {
    const d = fx()
    d.cards.u5 = 555
    d.steps.push({ id: 's3', action: 'normalSummon', card: 'u5', moves: [] } as Step)
    d.steps.push({ id: 's4', action: 'activate', card: 'u99', moves: [] } as Step)
    expect(codes(d)).toEqual(['cardNotAvailable@s3', 'unknownUid@s4'])
    expect(checkCoherence(d, () => 'Foo')[0]!.suggestion?.code).toBe('smart.coherence.fix.addSearch')
  })

  it('una carta cercata prima poi usata è ok', () => {
    const d = fx()
    d.steps.push({ id: 's3', action: 'normalSummon', card: 'u2', moves: [{ uid: 'u2', to: { loc: 'mzone', seq: 0 } }] } as Step)
    expect(checkCoherence(d)).toEqual([])
  })

  it('materiale non sul campo e bersaglio inesistente', () => {
    const d = fx()
    d.steps.push({ id: 's3', action: 'specialSummon', card: 'u3', method: 'xyz', targets: ['u77'], moves: [
      { uid: 'u2', to: { loc: 'overlay', host: 'u3' }, why: 'material' }, { uid: 'u3', to: { loc: 'mzone', seq: 1 } }] } as Step)
    d.deck.extra = [999000003]
    expect(codes(d)).toEqual(['targetMissing@s3', 'materialNotOnField@s3'])
  })

  it('movimento da zona sbagliata', () => {
    const d = fx()
    d.steps.push({ id: 's3', action: 'sendToGY', moves: [{ uid: 'u1', from: { loc: 'hand' }, to: { loc: 'gy' } }] } as Step)
    const i = checkCoherence(d)
    expect(i[0]).toMatchObject({ code: 'smart.coherence.wrongSource', params: { declared: 'hand', actual: 'mzone' }, suggestion: { params: { loc: 'mzone' } } })
  })

  it('una volta per turno ripetuto, anche dopo un ramo', () => {
    const d = fx()
    d.steps.push({ id: 's3', action: 'activate', card: 'u1', effect: { kind: 'trigger', index: 1 }, moves: [] } as Step)
    d.steps.push({ id: 's4', action: 'activate', card: 'u1', effect: { kind: 'trigger', index: 2 }, moves: [] } as Step)
    d.steps.push({ id: 's5', action: 'activate', card: 'u1', effect: { kind: 'continuous', index: 1 }, moves: [] } as Step)
    expect(codes(d)).toEqual(['oncePerTurn@s3'])
    d.branches[0]!.steps = [{ id: 'b1s1', action: 'activate', card: 'u1', effect: { kind: 'trigger', index: 1 }, moves: [] } as Step]
    expect(codes(d)).toContain('oncePerTurn@b1s1')
  })

  it('passo dopo endTurn e ramo con afterStep inesistente', () => {
    const d = fx()
    d.steps.push({ id: 's3', action: 'endTurn', moves: [] } as Step, { id: 's4', action: 'custom', label: 'x', moves: [] } as Step)
    d.branches[0]!.condition.afterStep = 'nope'
    expect(codes(d)).toEqual(['afterEndTurn@s4', 'branchMissingStep@nope'])
  })
})

describe('practiceHand', () => {
  const deck = Array.from({ length: 40 }, (_, i) => 100 + i)
  it('drawHand riproducibile col seed e senza mutare', () => {
    const copy = [...deck]
    const a = drawHand(deck, 5, 42), b = drawHand(deck, 5, mulberry32(42))
    expect(a).toEqual(b)
    expect(a.hand).toHaveLength(5)
    expect(a.rest).toHaveLength(35)
    expect(new Set([...a.hand, ...a.rest]).size).toBe(40)
    expect(deck).toEqual(copy)
    expect(drawHand(deck, 5, 43).hand).not.toEqual(a.hand)
  })
  it('limiti: mano più grande del deck e deck vuoto', () => {
    expect(drawHand([1, 2], 5, 1).hand).toHaveLength(2)
    expect(drawHand([], 5, 1)).toEqual({ hand: [], rest: [] })
  })
  const combo = (id: string, req: number[]): ComboDoc => {
    const d = fx()
    d.meta.title = { en: id }
    d.cards = Object.fromEntries(req.map((c, i) => [`u${i + 1}`, c]))
    d.setup.hand.required = Object.keys(d.cards)
    return d
  }
  it('playableCombos con molteplicità e ordine', () => {
    const A = combo('A', [1, 2]), B = combo('B', [1, 1]), C = combo('C', [3]), E = combo('E', [])
    const r = playableCombos([1, 2, 9], [C, B, E, A])
    expect(r.map((m) => m.doc.meta.title.en)).toEqual(['A', 'E', 'B', 'C'])
    expect(r.find((m) => m.doc.meta.title.en === 'B')).toMatchObject({ playable: false, missing: [1], score: 0.5 })
  })
  it('whatCanIDo: parziali con mancanti, esclude zero in comune e senza requisiti', () => {
    const A = combo('A', [1, 2]), C = combo('C', [3]), E = combo('E', [])
    const r = whatCanIDo([2], [A, C, E])
    expect(r.map((m) => m.doc.meta.title.en)).toEqual(['A'])
    expect(r[0]).toMatchObject({ playable: false, missing: [1] })
  })
  it('alias contano come la carta base', () => {
    const idx = createCardIndex([
      { id: 1, alias: 0, name: { en: 'A' }, type: 1, race: 0, attribute: 0, level: 4, atk: 0, def: 0, setcodes: [], isExtra: false },
      { id: 2, alias: 1, name: { en: 'A' }, type: 1, race: 0, attribute: 0, level: 4, atk: 0, def: 0, setcodes: [], isExtra: false },
    ])
    expect(playableCombos([2], [combo('A', [1])], idx)[0]!.playable).toBe(true)
  })
})

describe('banlistImpact', () => {
  const mk = (id: number, o: Partial<Card> = {}): Card => ({ id, alias: 0, name: { en: `C${id}` }, type: 1, race: 1, attribute: 1, level: 4, atk: 1500, def: 0, setcodes: [], isExtra: false, ...o })
  const cards = [
    mk(10, { setcodes: [7] }), mk(11, { setcodes: [7] }), mk(12, { setcodes: [7], race: 2, level: 8, atk: 3000 }),
    mk(13, { setcodes: [7], type: 2 }), mk(14, { setcodes: [8] }), mk(15, { setcodes: [7], isExtra: true }), mk(16, { setcodes: [7] }),
    mk(999000001), mk(999000002), mk(999000003),
  ]
  const index = createCardIndex(cards)
  const bl: Banlist = { format: 'TCG', id: 't', limits: { 999000001: 1, 999000002: 0, 16: 0 } }
  it('segnala passi con carte limitate/proibite', () => {
    const hits = banlistImpact(fx(), bl, index)
    expect(hits.find((h) => h.stepId === 's1' && h.role === 'card')).toMatchObject({ cardId: 999000001, status: 'limited', excess: false })
    expect(hits.find((h) => h.stepId === 's2' && h.uid === 'u2')).toMatchObject({ status: 'forbidden' })
    expect(hits.some((h) => h.stepId === null && h.role === 'hand')).toBe(true)
  })
  it('eccesso di copie nella combo', () => {
    const d = fx()
    d.cards.u3 = 999000001
    const hits = banlistImpact(d, bl, index)
    expect(hits.filter((h) => h.cardId === 999000001).every((h) => h.excess && h.copies === 2)).toBe(true)
  })
  it('nessun impatto con banlist vuota', () => {
    expect(banlistImpact(fx(), { format: 'TCG', id: 'x', limits: {} }, index)).toEqual([])
  })
  it('suggestReplacements: stesso archetipo/ruolo, ordinate, senza proibite né ruoli diversi', () => {
    const r = suggestReplacements(10, index, { banlist: bl }).map((x) => x.card.id)
    expect(r).toEqual([11, 12])
    expect(r).not.toContain(13) // magia
    expect(r).not.toContain(14) // altro archetipo
    expect(r).not.toContain(15) // extra
    expect(r).not.toContain(16) // proibita
    expect(suggestReplacements(424242, index)).toEqual([])
  })
})
