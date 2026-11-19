import { describe, expect, it } from 'vitest'
import { createCardIndex } from '../deck/cardIndex'
import type { Banlist, Card, DeckLists } from '../types'
import { applySidePlan, previewRows } from './apply'
import { adjustCount, clampToDeck, cycleCount, duplicatePlanData, emptyPlanData, otherTurn } from './plans'
import { suggestSwaps, type CardRole } from './suggest'
import { validateSidePlan } from './validate'

const card = (id: number, name: string, extra: Partial<Card> = {}): Card => ({
  id, alias: 0, name: { en: name }, type: 1, race: 1, attribute: 1, level: 4, atk: 1000, def: 0, setcodes: [], isExtra: false, ...extra,
})
const ASH = 100, ASH_ALT = 101, MAXX = 102, IMPERM = 103, DRAIN = 104, STARTER = 105, BRICKY = 106, COSMIC = 107, NIBIRU = 108
const cards: Card[] = [
  card(ASH, 'Ash'), card(ASH_ALT, 'Ash', { alias: ASH }), card(MAXX, 'Maxx C'), card(IMPERM, 'Imperm', { type: 4 }), card(DRAIN, 'Drain'),
  card(STARTER, 'Starter'), card(BRICKY, 'Bricky'), card(COSMIC, 'Cosmic', { type: 2 }), card(NIBIRU, 'Nibiru'),
  ...Array.from({ length: 60 }, (_, i) => card(1000 + i, `Filler ${i}`)),
]
const index = createCardIndex(cards)
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => 1000 + from + i)
const banlist: Banlist = { format: 'TCG', id: 't', limits: { [NIBIRU]: 1 } }

/** 40 carte: 3 Starter, 2 Ash (1 artwork alt), 1 Bricky, 1 Imperm, 33 filler; Side: Maxx x2, Drain, Cosmic, Nibiru, Ash. */
const deck = (): DeckLists => ({
  main: [STARTER, STARTER, STARTER, ASH, ASH_ALT, BRICKY, IMPERM, ...filler(33)],
  extra: [],
  side: [MAXX, MAXX, DRAIN, COSMIC, NIBIRU],
})
const canon = (id: number) => index.canonicalId(id)
const ctx = { rules: 'TCG' as const, banlist, index }

describe('applySidePlan', () => {
  it('sposta OUT nel Side e IN nel Main senza toccare Extra e dimensioni', () => {
    const d = { ...deck(), extra: [999] }
    const r = applySidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }, { cardId: ASH, count: 1 }], ins: [{ cardId: MAXX, count: 2 }] }, canon)
    expect(r.main).toHaveLength(d.main.length - 2 + 2)
    expect(r.main.filter((x) => x === MAXX)).toHaveLength(2)
    expect(r.main).not.toContain(BRICKY)
    expect(r.side).toContain(BRICKY)
    expect(r.side.filter((x) => x === MAXX)).toHaveLength(0)
    expect(r.extra).toEqual([999])
    expect(r.side).toHaveLength(d.side.length)
  })
  it('conta gli alias come la stessa carta e toglie l\'artwork giusto', () => {
    const r = applySidePlan(deck(), { outs: [{ cardId: ASH, count: 2 }], ins: [] }, canon)
    expect(r.main.filter((x) => canon(x) === ASH)).toHaveLength(0)
    expect(r.side.filter((x) => x === ASH_ALT || x === ASH)).toHaveLength(2)
  })
  it('limita lo scambio alle copie disponibili e non muta l\'input', () => {
    const d = deck()
    const copy = structuredClone(d)
    const r = applySidePlan(d, { outs: [{ cardId: BRICKY, count: 5 }], ins: [{ cardId: DRAIN, count: 4 }] }, canon)
    expect(r.main.filter((x) => x === BRICKY)).toHaveLength(0)
    expect(r.main.filter((x) => x === DRAIN)).toHaveLength(1)
    expect(d).toEqual(copy)
  })
  it('raggruppa le copie che entrano accanto a quelle già presenti', () => {
    const d = deck()
    d.side.push(STARTER)
    const r = applySidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: STARTER, count: 1 }] }, canon)
    expect(r.main.slice(0, 4)).toEqual([STARTER, STARTER, STARTER, STARTER])
  })
})

describe('previewRows', () => {
  it('segna keep/out/in per carta', () => {
    const rows = previewRows(deck(), { outs: [{ cardId: STARTER, count: 1 }], ins: [{ cardId: MAXX, count: 1 }] }, canon)
    const s = rows.find((r) => r.cardId === STARTER)!
    expect([s.keep, s.out, s.in]).toEqual([2, 1, 0])
    const m = rows.find((r) => r.cardId === MAXX)!
    expect([m.keep, m.out, m.in]).toEqual([0, 0, 1])
  })
})

describe('validateSidePlan', () => {
  it('piano bilanciato e legale: ok', () => {
    const v = validateSidePlan(deck(), { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: DRAIN, count: 1 }] }, ctx)
    expect(v.ok).toBe(true)
    expect(v.issues).toEqual([])
    expect(v.summary).toMatchObject({ outCount: 1, inCount: 1, mainAfter: 40, balanced: true })
  })
  it('in != out: dice quanti mancano e di che lato', () => {
    const v = validateSidePlan(deck(), { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: MAXX, count: 2 }, { cardId: DRAIN, count: 1 }] }, ctx)
    expect(v.ok).toBe(false)
    expect(v.issues.find((i) => i.code === 'unbalanced')?.params).toEqual({ missing: 2, side: 'out' })
    const w = validateSidePlan(deck(), { outs: [{ cardId: BRICKY, count: 1 }, { cardId: IMPERM, count: 1 }], ins: [{ cardId: MAXX, count: 1 }] }, ctx)
    expect(w.issues.find((i) => i.code === 'unbalanced')?.params).toEqual({ missing: 1, side: 'in' })
  })
  it('carte non presenti nel Main/Side', () => {
    const v = validateSidePlan(deck(), { outs: [{ cardId: COSMIC, count: 1 }], ins: [{ cardId: BRICKY, count: 1 }] }, ctx)
    expect(v.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['out-unavailable', 'in-unavailable']))
    expect(v.ok).toBe(false)
  })
  it('Main fuori da 40-60 dopo gli scambi (anche con piano sbilanciato)', () => {
    const v = validateSidePlan(deck(), { outs: [{ cardId: BRICKY, count: 1 }], ins: [] }, ctx)
    expect(v.issues.some((i) => i.code === 'main-size' && i.params.count === 39)).toBe(true)
  })
  it('Side oltre 15 dopo gli scambi', () => {
    const d = deck()
    d.main.push(...filler(5, 40))
    d.side.push(...filler(10, 45))
    expect(d.side).toHaveLength(15)
    const v = validateSidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }, { cardId: IMPERM, count: 1 }], ins: [] }, ctx)
    expect(v.issues.some((i) => i.code === 'side-size')).toBe(true)
  })
  it('max 3 copie con alias', () => {
    const d = deck() // Ash x2 nel Main + 1 Ash nel Side = 3 totali
    d.side.push(ASH_ALT)
    const ok = validateSidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: ASH, count: 1 }] }, ctx)
    expect(ok.issues.some((i) => i.code === 'too-many-copies')).toBe(false)
    d.side.push(ASH)
    const bad = validateSidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: ASH, count: 2 }] }, ctx)
    expect(bad.issues.some((i) => i.code === 'too-many-copies' || i.code === 'in-unavailable' || i.code === 'unbalanced')).toBe(true)
  })
  it('banlist: attribuisce al piano solo i problemi nuovi', () => {
    const d = deck()
    d.side.push(NIBIRU) // 2 Nibiru totali, Limitata: illegale già prima dello scambio
    const v = validateSidePlan(d, { outs: [{ cardId: BRICKY, count: 1 }], ins: [{ cardId: DRAIN, count: 1 }] }, ctx)
    expect(v.issues.some((i) => i.code === 'legality')).toBe(false)
  })
  it('piano vuoto: avviso, non ok', () => {
    const v = validateSidePlan(deck(), { outs: [], ins: [] }, ctx)
    expect(v.issues).toEqual([{ code: 'empty', severity: 'warning', params: {} }])
    expect(v.ok).toBe(false)
  })
})

describe('operazioni sui piani', () => {
  it('cycleCount sale e poi azzera', () => {
    let l = cycleCount([], STARTER, 2)
    l = cycleCount(l, STARTER, 2)
    expect(l).toEqual([{ cardId: STARTER, count: 2 }])
    expect(cycleCount(l, STARTER, 2)).toEqual([])
  })
  it('adjustCount rispetta il tetto', () => {
    expect(adjustCount([{ cardId: 1, count: 2 }], 1, 5, 3)).toEqual([{ cardId: 1, count: 3 }])
    expect(adjustCount([{ cardId: 1, count: 1 }], 1, -1)).toEqual([])
  })
  it('duplica per l\'altro turno senza condividere i riferimenti', () => {
    const p = { ...emptyPlanData('Snake-Eye', 'first'), outs: [{ cardId: 1, count: 1 }] }
    const c = duplicatePlanData(p, { name: 'Snake-Eye (copia)', turn: otherTurn('first') })
    expect(c.matchup).toMatchObject({ name: 'Snake-Eye (copia)', turn: 'second' })
    c.outs[0]!.count = 9
    expect(p.outs[0]!.count).toBe(1)
  })
  it('clampToDeck toglie le carte non più presenti', () => {
    const r = clampToDeck({ outs: [{ cardId: COSMIC, count: 1 }, { cardId: STARTER, count: 5 }], ins: [{ cardId: MAXX, count: 3 }] }, deck(), canon)
    expect(r).toEqual({ outs: [{ cardId: STARTER, count: 3 }], ins: [{ cardId: MAXX, count: 2 }] })
  })
})

describe('suggestSwaps', () => {
  const roles = (o: Record<number, CardRole>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]))
  const base = { deck: deck(), canonical: canon }

  it('senza tag non inventa nulla', () => {
    const s = suggestSwaps({ ...base, matchup: { name: 'X', turn: 'first' }, roles: new Map() })
    expect(s).toMatchObject({ outs: [], ins: [], empty: 'no-roles' })
  })
  it('handtrap nel Side contro non-engine/brick nel Main', () => {
    const s = suggestSwaps({
      ...base,
      matchup: { name: 'Mirror', turn: 'first' },
      roles: roles({ [DRAIN]: { tags: ['handtrap'] }, [BRICKY]: { tags: [], selfBrick: true }, [STARTER]: { tags: ['S1'] } }),
    })
    expect(s.ins).toEqual([{ cardId: DRAIN, count: 1, reason: 'handtrap' }])
    expect(s.outs).toEqual([{ cardId: BRICKY, count: 1, reason: 'brick' }])
    expect(s.empty).toBeNull()
  })
  it('anti:<archetipo> ha la precedenza e out:<archetipo> taglia tutte le copie', () => {
    const s = suggestSwaps({
      ...base,
      matchup: { name: 'vs Snake-Eye', archetype: 'Snake-Eye', turn: 'second' },
      roles: roles({
        [COSMIC]: { tags: ['breaker'] },
        [DRAIN]: { tags: ['anti:snakeeye'] },
        [STARTER]: { tags: ['S1', 'out:Snake-Eye'] },
      }),
    })
    expect(s.ins.map((i) => i.cardId)).toEqual([DRAIN, COSMIC])
    expect(s.outs).toEqual([{ cardId: STARTER, count: 2, reason: 'dead' }])
    expect(s.ins.reduce((n, i) => n + i.count, 0)).toBe(2)
    expect(s.unmatched).toEqual({ ins: 0, outs: 1 })
  })
  it('contro un matchup gli rompi-board valgono di più giocando secondo', () => {
    const r = roles({ [DRAIN]: { tags: ['handtrap'] }, [COSMIC]: { tags: ['breaker'] }, [BRICKY]: { tags: [], selfBrick: true } })
    const first = suggestSwaps({ ...base, matchup: { name: 'a', turn: 'first' }, roles: r })
    const second = suggestSwaps({ ...base, matchup: { name: 'a', turn: 'second' }, roles: r })
    expect(first.ins[0]!.cardId).toBe(DRAIN)
    expect(second.ins[0]!.cardId).toBe(COSMIC)
  })
  it('non propone carte engine come OUT e segnala i candidati senza controparte', () => {
    const s = suggestSwaps({
      ...base,
      matchup: { name: 'a', turn: 'first' },
      roles: roles({ [DRAIN]: { tags: ['HT'] }, [MAXX]: { tags: ['handtrap'] }, [STARTER]: { tags: ['S1', 'NE'] }, [IMPERM]: { tags: ['NE'] } }),
    })
    expect(s.outs).toEqual([{ cardId: IMPERM, count: 1, reason: 'nonEngine' }])
    expect(s.ins).toHaveLength(1)
    expect(s.unmatched.ins).toBe(2)
  })
})
