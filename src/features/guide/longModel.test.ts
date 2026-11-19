import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeName } from '@/domain/deck/cardIndex'
import type { ComboDoc } from '@/domain/combo/types'
import { buildListItems, buildOutline, matchSteps } from './guideModel'
import { buildTimeline, blockStarts, frameSections, stepBlock } from '../replay/replayModel'

const long = () => JSON.parse(readFileSync('tests/fixtures/combo/long-60.json', 'utf8')) as ComboDoc

describe('sommario e lista per combo lunghe (long-60)', () => {
  it('sezioni per fase che coprono tutti i passi, senza buchi né sovrapposizioni', () => {
    const d = long()
    const out = buildOutline(d)
    expect(out.map((s) => s.phase)).toEqual(['main1', 'battle', 'main2', 'end'])
    let next = 1
    for (const s of out) {
      expect(s.from).toBe(next)
      let b = s.from
      for (const blk of s.blocks) {
        expect(blk.from).toBe(b)
        b = blk.to + 1
      }
      expect(b).toBe(s.to + 1)
      next = s.to + 1
    }
    expect(next).toBe(61)
    const kinds = new Set(out.flatMap((s) => s.blocks.map((b) => b.kind)))
    expect(kinds).toEqual(new Set(['steps', 'chain', 'group']))
  })
  it('senza fasi: gruppi da 10 passi', () => {
    const d = long()
    d.steps.forEach((s) => delete s.phase)
    const out = buildOutline(d)
    expect(out).toHaveLength(6)
    expect(out.every((s) => s.phase === undefined)).toBe(true)
  })
  it('catene comprimibili: comprimere nasconde i passi del blocco ma tiene l\'intestazione', () => {
    const d = long()
    const full = buildListItems(d, new Set())
    const chain = full.find((i) => i.kind === 'chain')!
    expect(chain.kind === 'chain' && chain.links).toBeGreaterThanOrEqual(2)
    const id = chain.kind === 'chain' ? chain.id : ''
    const folded = buildListItems(d, new Set([id]))
    expect(folded.filter((i) => i.kind === 'step').length).toBeLessThan(full.filter((i) => i.kind === 'step').length)
    expect(folded.some((i) => i.kind === 'chain' && i.id === id && i.collapsed)).toBe(true)
    expect(full.filter((i) => i.kind === 'phase')).toHaveLength(4)
  })
  it('ricerca: per testo (senza accenti) e per numero; filtro senza intestazioni', () => {
    const hay = ['evoca normalmente tengu', 'attiva perdita marchiata', 'risolvi']
    expect([...matchSteps(hay, 'Marchiata', normalizeName)!]).toEqual([2])
    expect([...matchSteps(hay, '3', normalizeName)!]).toEqual([3])
    expect(matchSteps(hay, '  ', normalizeName)).toBeNull()
    const items = buildListItems(long(), new Set(), new Set([5, 9]))
    expect(items.map((i) => (i.kind === 'step' ? i.gs.number : -1))).toEqual([5, 9])
  })
})

describe('replay: blocchi di fotogrammi', () => {
  it('le sezioni coprono tutti i fotogrammi e PagSu/PagGiù saltano di blocco', () => {
    const d = long()
    const tl = buildTimeline(d)
    const secs = frameSections(tl)
    expect(secs.at(-1)!.to).toBe(tl.frames.length - 1)
    const starts = blockStarts(secs)
    expect(starts[0]).toBe(0)
    expect(starts[1]).toBe(1)
    expect(stepBlock(starts, 0, 1)).toBe(1)
    const mid = starts[5]! + 1 // dentro un blocco (o all'inizio del successivo)
    expect(stepBlock(starts, mid, -1)).toBeLessThan(mid)
    expect(stepBlock(starts, mid, 1)).toBeGreaterThan(mid)
    expect(stepBlock(starts, tl.frames.length - 1, 1)).toBe(starts.at(-1))
    expect(stepBlock(starts, 0, -1)).toBe(0)
  })
  it('con un ramo: sezione "ramo" finale con i suoi fotogrammi', () => {
    const d = long()
    const tl = buildTimeline(d, 'b1')
    const secs = frameSections(tl)
    const last = secs.at(-1)!
    expect(last.branch).toBe(true)
    expect(last.from).toBe(tl.branchStart)
    expect(last.to).toBe(tl.frames.length - 1)
  })
})
