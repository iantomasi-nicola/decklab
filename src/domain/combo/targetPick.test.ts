import { describe, expect, it } from 'vitest'
import { canConfirmPick, clearPick, initPick, normalizeLimits, pickCounter, pickMissing, pickOrder, stepCandidate, togglePick, undoPick } from './targetPick'

const C = ['u1', 'u2', 'u3', 'u4', 'u5']

describe('targetPick', () => {
  it('limiti: default 1 da 1; min <= max <= candidati', () => {
    expect(normalizeLimits({ candidates: C })).toEqual({ min: 1, max: 1 })
    expect(normalizeLimits({ candidates: C, max: 2 })).toEqual({ min: 2, max: 2 })
    expect(normalizeLimits({ candidates: C, min: 1, max: 3 })).toEqual({ min: 1, max: 3 })
    expect(normalizeLimits({ candidates: ['u1', 'u2'], max: 9 })).toEqual({ min: 2, max: 2 })
    expect(normalizeLimits({ candidates: C, min: 5, max: 2 })).toEqual({ min: 2, max: 2 })
  })

  it('selezione multipla ordinata, deselezione, pieno', () => {
    let s = initPick({ candidates: C, max: 2 })
    expect(canConfirmPick(s)).toBe(false)
    expect(pickMissing(s)).toBe(2)
    s = togglePick(s, 'u3').state
    s = togglePick(s, 'u1').state
    expect(s.selected).toEqual(['u3', 'u1'])
    expect(pickOrder(s, 'u3')).toBe(1)
    expect(pickOrder(s, 'u1')).toBe(2)
    expect(pickOrder(s, 'u2')).toBe(0)
    expect(canConfirmPick(s)).toBe(true)
    const full = togglePick(s, 'u5')
    expect(full.change).toBe('full')
    expect(full.state.selected).toEqual(['u3', 'u1'])
    const rem = togglePick(s, 'u3')
    expect(rem.change).toBe('removed')
    expect(rem.state.selected).toEqual(['u1'])
    expect(pickOrder(rem.state, 'u1')).toBe(1) // la numerazione si ricompatta
  })

  it('max = 1 sostituisce la scelta', () => {
    let s = initPick({ candidates: C })
    s = togglePick(s, 'u2').state
    const r = togglePick(s, 'u4')
    expect(r.change).toBe('replaced')
    expect(r.state.selected).toEqual(['u4'])
  })

  it('non candidati ignorati; intervallo min..max', () => {
    let s = initPick({ candidates: C, min: 1, max: 3 })
    expect(togglePick(s, 'zz').change).toBe('ignored')
    s = togglePick(s, 'u1').state
    expect(canConfirmPick(s)).toBe(true)
    expect(pickCounter(s)).toEqual({ min: 1, max: 3, total: 5, chosen: 1, range: true })
  })

  it('preselezione filtrata, annulla ultima, azzera', () => {
    let s = initPick({ candidates: C, max: 2 }, ['u2', 'zz', 'u2', 'u4', 'u5'])
    expect(s.selected).toEqual(['u2', 'u4'])
    s = undoPick(s)
    expect(s.selected).toEqual(['u2'])
    expect(clearPick(s).selected).toEqual([])
  })

  it('navigazione con avvolgimento', () => {
    const s = initPick({ candidates: ['a', 'b', 'c'] })
    expect(stepCandidate(s, undefined, 1)).toBe('a')
    expect(stepCandidate(s, undefined, -1)).toBe('c')
    expect(stepCandidate(s, 'c', 1)).toBe('a')
    expect(stepCandidate(s, 'a', -1)).toBe('c')
  })
})
