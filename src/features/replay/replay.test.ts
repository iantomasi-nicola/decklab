import { describe, expect, it } from 'vitest'
import fixtureJson from '../../../tests/fixtures/combo/v1.json'
import type { ComboDoc } from '@/domain/combo/types'
import { buildTimeline, chainUpTo, initialPlayer, intervalFor, playerReducer, SPEEDS, type PlayerState } from './replayModel'

const fixture = () => structuredClone(fixtureJson) as unknown as ComboDoc
const mz = (seq: number) => ({ loc: 'mzone' as const, seq, pos: 'FACEUP_ATK' as const })

function doc(): ComboDoc {
  const d = fixture()
  d.cards = { u1: 999000001, u2: 999000002, u3: 999000003, o1: 14558127 }
  d.steps = [
    { id: 's1', action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', to: mz(1), why: 'summon' }] },
    { id: 's2', action: 'activate', card: 'u1', chain: { id: 'c1', link: 1 }, moves: [] },
    { id: 's3', action: 'chainActivate', card: 'u2', chain: { id: 'c1', link: 2 }, moves: [{ uid: 'u2', to: { loc: 'szone', seq: 0, pos: 'FACEUP' } }] },
    { id: 's4', action: 'resolve', ref: 's3', moves: [{ uid: 'u2', to: { loc: 'gy' }, why: 'send' }] },
  ]
  d.branches = [
    {
      id: 'b1',
      condition: { afterStep: 's1', window: 'activation', opponent: { code: 14558127 } },
      steps: [{ id: 'b1s1', action: 'specialSummon', card: 'u3', moves: [{ uid: 'u3', to: mz(3), why: 'summon' }] }],
      rejoin: null,
    },
  ]
  return d
}

describe('buildTimeline', () => {
  it('linea principale: un fotogramma per passo + stato iniziale', () => {
    const tl = buildTimeline(doc())
    expect(tl.frames).toHaveLength(5)
    expect(tl.branchStart).toBe(5)
    expect(tl.frames[0]!.step).toBeUndefined()
    expect(tl.frames[1]!.state.places.u1).toMatchObject({ loc: 'mzone', seq: 1 })
    expect(tl.frames[1]!.active).toBe('u1')
    expect(tl.frames.map((f) => f.label)).toEqual([0, 1, 2, 3, 4])
  })
  it('catena: anelli in ordine, la risoluzione resta nella stessa catena', () => {
    const tl = buildTimeline(doc())
    expect(tl.frames[2]!.chain).toEqual(['u1'])
    expect(tl.frames[3]!.chain).toEqual(['u1', 'u2'])
    expect(tl.frames[4]!.chain).toEqual(['u1', 'u2'])
    expect(tl.frames[1]!.chain).toEqual([])
  })
  it('ramo: passi fino al punto di diramazione, poi quelli del ramo', () => {
    const tl = buildTimeline(doc(), 'b1')
    expect(tl.frames).toHaveLength(3)
    expect(tl.branchStart).toBe(2)
    expect(tl.frames[1]!.inBranch).toBe(false)
    expect(tl.frames[2]!.inBranch).toBe(true)
    expect(tl.frames[2]!.label).toBe(1)
    expect(tl.frames[2]!.state.places.u3).toMatchObject({ loc: 'mzone', seq: 3 })
    expect(tl.frames[2]!.state.places.u1).toMatchObject({ loc: 'mzone', seq: 1 }) // eredita lo stato del punto di diramazione
  })
  it('ramo inesistente: linea principale', () => {
    expect(buildTimeline(doc(), 'zzz').frames).toHaveLength(5)
  })
  it('combo senza passi: solo lo stato iniziale', () => {
    const d = doc()
    d.steps = []
    d.branches = []
    expect(buildTimeline(d).frames).toHaveLength(1)
  })
  it('chainUpTo non guarda i passi successivi', () => {
    const steps = doc().steps
    expect(chainUpTo(steps, 1)).toEqual(['u1'])
    expect(chainUpTo(steps, 0)).toEqual([])
  })
})

describe('lettore', () => {
  const last = 4
  const run = (s: PlayerState, ...a: Parameters<typeof playerReducer>[1][]) => a.reduce((acc, x) => playerReducer(acc, x, last), s)
  it('avanti/indietro si fermano agli estremi e mettono in pausa', () => {
    expect(run({ ...initialPlayer, playing: true }, { type: 'next' })).toMatchObject({ index: 1, playing: false })
    expect(run(initialPlayer, { type: 'prev' }).index).toBe(0)
    expect(run({ ...initialPlayer, index: 4 }, { type: 'next' }).index).toBe(4)
  })
  it('salto limitato al range', () => {
    expect(run(initialPlayer, { type: 'seek', index: 99 }).index).toBe(4)
    expect(run(initialPlayer, { type: 'seek', index: -3 }).index).toBe(0)
  })
  it('play: riparte dall’inizio se alla fine; si ferma da solo sull’ultimo passo', () => {
    expect(run({ ...initialPlayer, index: 4 }, { type: 'play' })).toMatchObject({ index: 0, playing: true })
    const s = run({ ...initialPlayer, index: 3, playing: true }, { type: 'tick' })
    expect(s).toMatchObject({ index: 4, playing: false })
  })
  it('combo senza passi: play non parte', () => {
    expect(playerReducer(initialPlayer, { type: 'play' }, 0).playing).toBe(false)
  })
  it('toggle e velocità', () => {
    expect(run(initialPlayer, { type: 'toggle' }).playing).toBe(true)
    expect(run(initialPlayer, { type: 'toggle' }, { type: 'toggle' }).playing).toBe(false)
    let s = initialPlayer
    const seen = new Set<number>()
    for (let i = 0; i < SPEEDS.length; i++) (s = playerReducer(s, { type: 'cycleSpeed' }, last)), seen.add(s.speed)
    expect(seen.size).toBe(SPEEDS.length)
    expect(s.speed).toBe(1)
  })
  it('intervallo inversamente proporzionale alla velocità, da 0.5× a 3×', () => {
    expect(SPEEDS[0]).toBe(0.5)
    expect(SPEEDS[SPEEDS.length - 1]).toBe(3)
    expect(intervalFor(2)).toBeLessThan(intervalFor(1))
    expect(intervalFor(0.5)).toBe(intervalFor(1) * 2)
  })
})
