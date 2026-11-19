import { describe, expect, it } from 'vitest'
import type { Banlist } from '../types'
import { ASH, filler, index } from '../deck/fixtures'
import { checkDeck, diffLegality } from './checkDeck'

const ban = (limits: Banlist['limits'] = {}, extra: Partial<Banlist> = {}): Banlist => ({ format: 'TCG', id: '2026.10', limits, ...extra })
const legalMain = [ASH, ASH, ...filler(38)]
const codes = (d: Parameters<typeof checkDeck>[0], b = ban(), r: 'TCG' | 'OCG' = 'TCG') => checkDeck(d, b, r, index).map((i) => i.code)

describe('checkDeck', () => {
  it('deck legale', () => expect(codes({ main: legalMain, extra: [1007], side: [] })).toEqual([]))
  it('alias contano come la stessa carta', () => {
    const main = [ASH, ASH, 14558128, 14558128, ...filler(36)]
    const issues = checkDeck({ main, extra: [], side: [] }, ban(), 'TCG', index)
    expect(issues).toEqual([{ code: 'too-many-copies', severity: 'error', cardId: ASH, params: { count: 4, max: 3 } }])
  })
  it('copie contate tra main e side', () => {
    expect(codes({ main: [ASH, ASH, ASH, ...filler(37)], extra: [], side: [14558128] })).toEqual(['too-many-copies'])
  })
  it('proibita / limitata / semi-limitata', () => {
    const d = { main: [1001, 1001, 1003, 1003, 1003, 1004, 1004, ...filler(33)], extra: [], side: [] }
    expect(codes(d, ban({ 1001: 0, 1003: 1, 1004: 2 })).sort()).toEqual(['forbidden', 'limited'])
    expect(codes(d, ban({ 1001: 1, 1003: 2, 1004: 1 })).sort()).toEqual(['limited', 'limited', 'semi-limited'].sort())
  })
  it('limite in banlist su carta base vale per alias', () => {
    expect(codes({ main: [ASH, 14558128, ...filler(38)], extra: [], side: [] }, ban({ [ASH]: 1 }))).toEqual(['limited'])
  })
  it('dimensioni', () => {
    expect(codes({ main: filler(39), extra: [], side: [] })).toEqual(['main-size'])
    expect(codes({ main: filler(61), extra: [], side: [] })).toContain('main-size')
    expect(codes({ main: filler(40), extra: Array(16).fill(1007), side: Array(16).fill(1009) })).toEqual(
      expect.arrayContaining(['extra-size', 'side-size', 'too-many-copies']),
    )
  })
  it('Extra in Main e non-Extra in Extra', () => {
    const c = checkDeck({ main: [1007, ...filler(39)], extra: [1009], side: [] }, ban(), 'TCG', index)
    expect(c.map((i) => [i.code, i.cardId])).toEqual([['main-size', 1007], ['extra-size', 1009]])
  })
  it('punti Genesys, saltati se assenti', () => {
    const d = { main: legalMain, extra: [], side: [] }
    expect(codes(d, ban({}, { points: { [ASH]: 40 }, pointsCap: 70 }))).toEqual(['genesys-points'])
    expect(codes(d, ban({}, { points: { [ASH]: 40 }, pointsCap: 80 }))).toEqual([])
    expect(codes(d, ban({}, { points: { [ASH]: 400 } }))).toEqual([])
  })
  it('non nel formato e sconosciuta', () => {
    const d = { main: [1002, 999999, ...filler(38)], extra: [], side: [] }
    expect(codes(d, ban(), 'OCG').sort()).toEqual(['not-in-format', 'unknown-card'])
    expect(codes(d, ban(), 'TCG')).toEqual(['unknown-card'])
  })
})

describe('diffLegality', () => {
  it('segnala varianti/combo che diventano illegali', () => {
    const prev = ban()
    const next = ban({ [ASH]: 1 })
    const targets = [
      { id: 'v1', kind: 'variant' as const, deck: { main: legalMain, extra: [], side: [] }, rules: 'TCG' as const },
      { id: 'c1', kind: 'combo' as const, deck: { main: filler(40), extra: [], side: [] }, rules: 'TCG' as const },
    ]
    const d = diffLegality(prev, next, targets, index)
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ id: 'v1', becameIllegal: true, wasLegal: true, isLegal: false })
    expect(d[0]!.newIssues[0]!.code).toBe('limited')
    const back = diffLegality(next, prev, targets, index)
    expect(back[0]).toMatchObject({ becameIllegal: false, isLegal: true })
    expect(back[0]!.resolvedIssues).toHaveLength(1)
  })
})
