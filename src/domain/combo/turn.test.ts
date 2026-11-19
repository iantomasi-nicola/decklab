import { describe, expect, it } from 'vitest'
import fixtureJson from '../../../tests/fixtures/combo/v1.json'
import longJson from '../../../tests/fixtures/combo/long-60.json'
import { canTransition, effectAvailability, legalTransitions, optTotalInDoc, phaseWarnings, turnStateAt, turnTimeline, usesOfCard } from './turn'
import type { ComboDoc, Step } from './types'

const base = () => structuredClone(fixtureJson) as unknown as ComboDoc
const mz = (seq: number) => ({ loc: 'mzone' as const, seq, pos: 'FACEUP_ATK' as const })

function doc(steps: Partial<Step>[], cards: Record<string, number> = {}): ComboDoc {
  const d = base()
  d.cards = { u1: 100, u2: 200, u3: 100, u4: 400, o1: 14558127, ...cards }
  d.branches = []
  d.steps = steps.map((s, i) => ({ id: `s${i + 1}`, action: 'custom', moves: [], ...s })) as Step[]
  return d
}

describe('transizioni di fase', () => {
  it('sequenza canonica e salti validi', () => {
    expect(legalTransitions('draw').map((t) => t.to)).toEqual(['standby', 'main1'])
    expect(legalTransitions('main1').map((t) => t.to)).toEqual(['battle', 'main2', 'end'])
    expect(legalTransitions('battle').map((t) => t.to)).toEqual(['main2', 'end'])
    expect(legalTransitions('main2').map((t) => t.to)).toEqual(['end'])
    expect(legalTransitions('end')).toEqual([])
    expect(canTransition('main1', 'end')).toBe(true)
    expect(canTransition('battle', 'main1')).toBe(false)
    expect(canTransition('main2', 'battle')).toBe(false)
  })
})

describe('turnStateAt', () => {
  it('stato iniziale: main1, nulla di usato', () => {
    const ts = turnStateAt(doc([{ action: 'normalSummon', card: 'u1' }]), -1)
    expect(ts.phase).toBe('main1')
    expect(ts.turn).toBe(1)
    expect(ts.normalSummonUsed).toBe(false)
    expect(ts.optUsedCount).toBe(0)
    expect(ts.phaseTransitions.map((t) => t.to)).toEqual(['battle', 'main2', 'end'])
  })

  it('Evocazione Normale, Tributo e Calata condividono il diritto', () => {
    for (const action of ['normalSummon', 'tributeSummon', 'setMonster'] as const) {
      const ts = turnStateAt(doc([{ action, card: 'u1' }]), 0)
      expect(ts.normalSummonUsed, action).toBe(true)
      expect(ts.normalSummon).toMatchObject({ uid: 'u1', code: 100, type: action, stepIndex: 0 })
    }
    const t = turnStateAt(doc([{ action: 'tributeSummon', card: 'u1' }]), 0)
    expect(t.tributeSummonUsed).toBe(true)
    expect(t.setMonsterUsed).toBe(false)
  })

  it('le Evocazioni Speciali non consumano la Normale; Pendulum è una volta per turno', () => {
    const ts = turnStateAt(doc([
      { action: 'specialSummon', method: 'fusion', card: 'u1' },
      { action: 'specialSummon', method: 'pendulum', card: 'u2' },
      { action: 'flipSummon', card: 'u4' },
    ]), 2)
    expect(ts.normalSummonUsed).toBe(false)
    expect(ts.specialSummons).toBe(2)
    expect(ts.specialByMethod).toEqual({ fusion: 1, pendulum: 1 })
    expect(ts.pendulumSummonUsed).toBe(true)
    expect(ts.flipSummons).toBe(1)
  })

  it('extraNormalSummon in x aumenta il numero di Normali ammesse', () => {
    const ts = turnStateAt(doc([
      { action: 'normalSummon', card: 'u1', x: { extraNormalSummon: 1 } },
    ]), 0)
    expect(ts.normalSummonsMax).toBe(2)
    expect(ts.normalSummonUsed).toBe(false)
  })

  it('conta gli effetti OPT per copia + indice; il secondo uso è segnalato', () => {
    const e = { kind: 'ignition' as const, index: 1 }
    const d = doc([
      { action: 'activate', card: 'u1', effect: e },
      { action: 'activate', card: 'u3', effect: e }, // altra copia dello stesso passcode: per copia è lecito
      { action: 'activate', card: 'u1', effect: { kind: 'quick', index: 2 } },
      { action: 'activate', card: 'u1', effect: e }, // ripetizione
    ])
    const ts = turnStateAt(d, 3)
    expect(ts.optUsedCount).toBe(3)
    expect(ts.optOverused.map((u) => u.key)).toEqual(['u1#1'])
    expect(ts.optOverused[0]!.count).toBe(2)
    expect(effectAvailability(ts, { uid: 'u1', code: 100, index: 1 }).used).toBe(true)
    expect(effectAvailability(ts, { uid: 'u4', code: 400, index: 1 }).used).toBe(false)
    expect(usesOfCard(ts, 'u1').map((u) => u.index)).toEqual([1, 2])
    expect(ts.activations.ignition).toEqual({ count: 3, uids: ['u1', 'u3'] })
    expect(ts.activations.quick.count).toBe(1)
  })

  it("x.opt = 'name' unisce le copie con lo stesso passcode", () => {
    const e = { kind: 'trigger' as const, index: 1 }
    const d = doc([
      { action: 'activate', card: 'u1', effect: e, x: { opt: 'name' } },
      { action: 'activate', card: 'u3', effect: e, x: { opt: 'name' } },
    ])
    const ts = turnStateAt(d, 1)
    expect(ts.optUsedCount).toBe(1)
    expect(ts.optUses[0]).toMatchObject({ scope: 'name', count: 2, uids: ['u1', 'u3'], code: 100 })
    expect(effectAvailability(ts, { uid: 'u3', code: 100, index: 1 })).toMatchObject({ used: true, byName: true })
  })

  it('continui e attivazioni di Magia/Trappola non sono OPT; x.opt=false disattiva', () => {
    const d = doc([
      { action: 'activate', card: 'u1', effect: { kind: 'continuous', index: 1 } },
      { action: 'activate', card: 'u2', effect: { kind: 'activation' } },
      { action: 'activate', card: 'u3', effect: { kind: 'ignition', index: 1 }, x: { opt: false } },
      { action: 'activate', card: 'u4', effect: { kind: 'ignition' } }, // senza indice: non si può contare per effetto
    ])
    const ts = turnStateAt(d, 3)
    expect(ts.optUsedCount).toBe(0)
    expect(ts.activations.continuous.count).toBe(1)
    expect(ts.activations.activation.count).toBe(1)
    expect(ts.activations.ignition.count).toBe(2)
  })

  it('carte che hanno attaccato; attacco da Main 1 porta in Battle', () => {
    const ts = turnStateAt(doc([
      { action: 'attack', card: 'u1' },
      { action: 'attack', card: 'u2' },
      { action: 'attack', card: 'u1' },
    ]), 2)
    expect(ts.attacked).toEqual(['u1', 'u2'])
    expect(ts.attackCounts).toEqual({ u1: 2, u2: 1 })
    expect(ts.phase).toBe('battle')
    expect(ts.phaseLog).toEqual([{ from: 'main1', to: 'battle', stepIndex: 0, stepId: 's1', valid: true, inferred: true }])
  })

  it('enterPhase esplicito, senza fase = successiva; fasi non valide segnalate', () => {
    const d = doc([
      { action: 'enterPhase', phase: 'battle' },
      { action: 'enterPhase', phase: 'main2' },
      { action: 'enterPhase' }, // → end (successiva)
    ])
    expect(turnStateAt(d, 2).phase).toBe('end')
    expect(turnStateAt(d, 2).phaseTransitions).toEqual([])
    expect(phaseWarnings(d)).toEqual([])
    const bad = doc([{ action: 'enterPhase', phase: 'battle' }, { action: 'custom', phase: 'main1' }])
    expect(phaseWarnings(bad)).toEqual([{ stepId: 's2', stepIndex: 1, from: 'battle', to: 'main1' }])
  })

  it('endTurn azzera i contatori e riparte da Main 1 nel turno successivo', () => {
    const d = doc([
      { action: 'normalSummon', card: 'u1' },
      { action: 'activate', card: 'u1', effect: { kind: 'ignition', index: 1 } },
      { action: 'endTurn' },
      { action: 'normalSummon', card: 'u2' },
    ])
    const end = turnStateAt(d, 2)
    expect(end.turnEnded).toBe(true)
    expect(end.turn).toBe(1)
    expect(end.phaseTransitions).toEqual([])
    const next = turnStateAt(d, 3)
    expect(next.turn).toBe(2)
    expect(next.phase).toBe('main1')
    expect(next.optUsedCount).toBe(0)
    expect(next.normalSummon).toMatchObject({ uid: 'u2' })
    expect(next.log.map((l) => l.type)).toEqual(['normalSummon'])
  })

  it('segnalini dallo stato; log ordinato per il promemoria', () => {
    const d = doc([
      { action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', to: mz(1), why: 'summon' }] },
      { action: 'placeCounter', card: 'u1', counters: [{ uid: 'u1', type: 'spell', delta: 2 }] },
      { action: 'activate', card: 'u1', effect: { kind: 'quick', index: 1 } },
    ])
    const ts = turnStateAt(d, 2)
    expect(ts.counters).toEqual({ u1: { spell: 2 } })
    expect(ts.counterTotal).toBe(2)
    expect(ts.log.map((l) => l.type)).toEqual(['normalSummon', 'effect'])
    expect(ts.log[1]).toMatchObject({ opt: true, repeat: false, index: 1, kind: 'quick' })
  })

  it('indici fuori range vengono limitati e la timeline ha n+1 stati', () => {
    const d = doc([{ action: 'normalSummon', card: 'u1' }])
    expect(turnTimeline(d)).toHaveLength(2)
    expect(turnStateAt(d, 99).normalSummonUsed).toBe(true)
    expect(turnStateAt(d, -5).normalSummonUsed).toBe(false)
  })

  it('rami: parte dallo stato del turno dopo afterStep', () => {
    const d = doc([
      { action: 'normalSummon', card: 'u1' },
      { action: 'activate', card: 'u1', effect: { kind: 'ignition', index: 1 } },
    ])
    d.branches = [{
      id: 'b1', condition: { afterStep: 's1', window: 'activation', opponent: { code: 14558127 } }, rejoin: null,
      steps: [{ id: 'b1s1', action: 'activate', card: 'u2', effect: { kind: 'quick', index: 1 }, moves: [] }],
    }]
    const t0 = turnStateAt(d, -1, undefined, 'b1')
    expect(t0.normalSummonUsed).toBe(true)
    expect(t0.optUsedCount).toBe(0)
    const t1 = turnStateAt(d, 0, undefined, 'b1')
    expect(t1.optUsedCount).toBe(1)
    expect(() => turnStateAt(d, 0, undefined, 'nope')).toThrow()
  })

  it('optTotalInDoc conta gli effetti OPT distinti della combo', () => {
    const e = { kind: 'ignition' as const, index: 1 }
    const d = doc([
      { action: 'activate', card: 'u1', effect: e },
      { action: 'activate', card: 'u1', effect: e },
      { action: 'activate', card: 'u3', effect: e },
      { action: 'activate', card: 'u2', effect: { kind: 'continuous', index: 1 } },
    ])
    expect(optTotalInDoc(d)).toBe(2)
  })

  it('combo lunga (60 passi): coerente e veloce', () => {
    const d = longJson as unknown as ComboDoc
    const t = performance.now()
    const tl = turnTimeline(d)
    expect(performance.now() - t).toBeLessThan(500)
    expect(tl).toHaveLength(d.steps.length + 1)
    for (const ts of tl) {
      expect(['draw', 'standby', 'main1', 'battle', 'main2', 'end']).toContain(ts.phase)
      expect(ts.optUsedCount).toBeGreaterThanOrEqual(0)
    }
  })
})
