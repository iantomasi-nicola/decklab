import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateCombo } from '@/domain/combo/validate'
// @ts-expect-error modulo .mjs senza tipi
import { makeLong } from '../fixtures/combo/makeLong.mjs'

describe('fixture combo lunghe', () => {
  it('long-60.json è valido, senza avvisi, ed è quello che produce il generatore', () => {
    const doc = JSON.parse(readFileSync('tests/fixtures/combo/long-60.json', 'utf8'))
    const r = validateCombo(doc)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
    expect(doc.steps.length).toBe(60)
    expect(doc.branches.length).toBe(2)
    expect(makeLong(60)).toEqual(doc)
  })
  for (const n of [30, 120, 200]) {
    it(`il generatore produce ${n} passi validi`, () => {
      const doc = makeLong(n)
      const r = validateCombo(doc)
      expect(r.errors).toEqual([])
      expect(r.warnings).toEqual([])
      expect(doc.steps.length).toBe(n)
    })
  }
})
