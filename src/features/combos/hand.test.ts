import { describe, expect, it } from 'vitest'
import { validateCombo } from '@/domain/combo/validate'
import type { ComboDoc } from '@/domain/combo/types'
import { useEditor } from './editorStore'
import { addStep, createBlankDoc, handCodes, handIssues, handModeOf, handTotal, isOwnHandAdd, setHand, type Draft } from './model'

const blank = (): ComboDoc =>
  createBlankDoc({ id: 'c1', title: { it: 'T' }, archetype: { name: { it: 'A' } }, variant: null, rules: 'TCG', banlist: { format: 'TCG', id: '' }, deck: { main: [100, 100, 200, 300, 400], extra: [900], side: [] }, now: '2026-11-19T00:00:00.000Z' })

const toHand = (uid: string, code: number, seq = 0): Draft => ({ step: { action: 'search', card: uid, to: { p: 0, loc: 'hand', seq }, moves: [{ uid, to: { p: 0, loc: 'hand', seq }, why: 'search' }], searched: [uid] }, register: { [uid]: code } })

describe('mano di partenza: modello', () => {
  it('una bozza che porta una carta nuova in mano è una carta di setup', () => {
    expect(isOwnHandAdd(toHand('u1', 100))).toBe(true)
    expect(isOwnHandAdd({ step: { action: 'sendToGY', card: 'u1', moves: [{ uid: 'u1', to: { p: 0, loc: 'gy' } }] }, register: { u1: 100 } })).toBe(false)
    expect(isOwnHandAdd({ step: { action: 'bounce', card: 'u1', moves: [{ uid: 'u1', to: { p: 0, loc: 'hand' } }] } })).toBe(false)
  })

  it('setHand: esatta, mista, a caso; riusa gli uid e produce un documento valido', () => {
    let { doc } = setHand(blank(), { codes: [100, 200], mode: 'exact' })
    expect(doc.setup.hand).toMatchObject({ fill: 'none', size: 5 })
    expect(handCodes(doc)).toEqual([100, 200])
    expect(handModeOf(doc.setup.hand)).toBe('exact')
    expect(handTotal(doc.setup.hand)).toBe(2)
    expect(validateCombo(doc).errors).toEqual([])
    const before = doc.setup.hand.required
    doc = setHand(doc, { codes: [100, 200, 300], mode: 'mixed' }).doc
    expect(doc.setup.hand.required.slice(0, 2)).toEqual(before)
    expect(handModeOf(doc.setup.hand)).toBe('mixed')
    expect(handTotal(doc.setup.hand)).toBe(5)
    doc = setHand(doc, { codes: [100], mode: 'random' }).doc
    expect(doc.setup.hand.required).toEqual([])
    expect(Object.keys(doc.cards)).toEqual([])
    expect(handModeOf(doc.setup.hand)).toBe('random')
  })

  it('setHand: una carta già usata dai passi non si perde in silenzio', () => {
    const d0 = setHand(blank(), { codes: [100, 200], mode: 'exact' }).doc
    const used = d0.setup.hand.required[0]!
    const doc = addStep(d0, 0, { step: { action: 'normalSummon', card: used, moves: [{ uid: used, from: { loc: 'hand' }, to: { p: 0, loc: 'mzone', seq: 0 } }] } }).doc
    const r = setHand(doc, { codes: [], mode: 'exact' })
    expect(r.blocked).toEqual([used])
    expect(r.doc.setup.hand.required).toEqual([used])
    expect(r.doc.cards[used]).toBe(100)
  })

  it('handIssues: carta non nel mazzo e mano esatta vuota', () => {
    const d = setHand(blank(), { codes: [100, 100], mode: 'exact' }).doc
    expect(handIssues(d)).toEqual([])
    const bad = { ...d, deck: { ...d.deck, main: [100, 200] } }
    expect(handIssues(bad).map((i) => i.code)).toEqual(['notInDeck'])
    expect(handIssues(setHand(blank(), { codes: [], mode: 'exact' }).doc).map((i) => i.code)).toEqual(['emptyExact'])
  })
})

describe('mano di partenza: store dell\'editor', () => {
  const open = (doc: ComboDoc) => useEditor.getState().open(doc, 'r1')

  it('prima del primo passo una carta messa in mano (anche dalla scheda Passi) entra in setup.hand.required', () => {
    open(blank())
    useEditor.getState().setMode('steps')
    expect(useEditor.getState().apply(toHand('u1', 100))).toBeNull()
    const d = useEditor.getState().doc!
    expect(d.setup.hand.required).toEqual(['u1'])
    expect(d.steps).toHaveLength(0)
    expect(useEditor.getState().handAsk).toBeNull()
  })

  it('dopo che esistono passi si chiede: mano iniziale oppure passo', () => {
    open(blank())
    useEditor.getState().apply({ step: { action: 'custom', moves: [], label: 'x' } })
    expect(useEditor.getState().doc!.steps).toHaveLength(1)
    useEditor.getState().apply(toHand('u1', 100))
    expect(useEditor.getState().handAsk).not.toBeNull()
    expect(useEditor.getState().doc!.setup.hand.required).toEqual([])
    useEditor.getState().resolveHandAsk('setup')
    expect(useEditor.getState().doc!.setup.hand.required).toEqual(['u1'])
    expect(useEditor.getState().doc!.steps).toHaveLength(1)
    useEditor.getState().apply(toHand('u2', 200, 1))
    useEditor.getState().resolveHandAsk('step')
    expect(useEditor.getState().doc!.steps).toHaveLength(2)
    expect(useEditor.getState().doc!.setup.hand.required).toEqual(['u1'])
    useEditor.getState().apply(toHand('u3', 300, 1))
    useEditor.getState().resolveHandAsk('cancel')
    expect(useEditor.getState().doc!.steps).toHaveLength(2)
    expect(useEditor.getState().handAsk).toBeNull()
  })
})
