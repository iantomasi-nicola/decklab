import { describe, expect, it } from 'vitest'
import { createCardIndex } from '@/domain/deck/cardIndex'
import { serializeYdk } from '@/domain/deck/ydk'
import { serializeYdke } from '@/domain/deck/ydke'
import { serializeDeckJson } from '@/domain/deck/importDetect'
import type { Card } from '@/domain/types'
import { index as fx, ASH, filler } from '@/domain/deck/fixtures'
import { baseName, interpretImport, resolveReview, slug } from './importHelpers'

const deck = { main: [ASH, 1001, 1001], extra: [1007], side: [24224830] }
const base = { alias: 0, type: 0, race: 0, attribute: 0, level: 4, atk: 0, def: 0, setcodes: [], isExtra: false }
const twin = createCardIndex([
  { ...base, id: 1, name: { en: 'Twin Dragon', it: 'Drago Gemello' } },
  { ...base, id: 2, name: { en: 'Twin Dragon', it: 'Drago Gemello' } } as Card,
  { ...base, id: 3, name: { en: 'Solo', it: 'Solo' } },
])

describe('interpretImport', () => {
  it('riconosce ydk, ydke e JSON dell\'app', () => {
    for (const [txt, fmt] of [[serializeYdk(deck), 'ydk'], [serializeYdke(deck), 'ydke'], [serializeDeckJson(deck), 'json']] as const) {
      const o = interpretImport(txt, fx)
      expect(o.kind).toBe('deck')
      if (o.kind === 'deck') {
        expect(o.format).toBe(fmt)
        expect(o.deck).toEqual(deck)
      }
    }
  })
  it('testo IT/EN con conteggi e sezioni', () => {
    const o = interpretImport('Main Deck\n3 Fioritura di Cenere & Gioiosa Primavera\n2 Pot of Greed\nExtra Deck\n1 Accesscode Talker', fx)
    expect(o.kind).toBe('deck')
    if (o.kind === 'deck') {
      expect(o.deck.main.length).toBe(5)
      expect(o.deck.extra).toEqual([1007])
    }
  })
  it('richiede revisione per ambigui e non trovati', () => {
    const o = interpretImport('2 Twin Dragon\n1 Solo\n1 Inesistente Xyz Qwerty', twin)
    expect(o.kind).toBe('review')
    if (o.kind === 'review') {
      expect(o.result.ambiguous).toHaveLength(1)
      expect(o.result.unmatched).toHaveLength(1)
      expect(resolveReview(o.result, { 0: 2 }).main.sort()).toEqual([2, 2, 3])
      expect(resolveReview(o.result, {}).main).toEqual([3])
    }
  })
  it('errori: vuoto, ydke rotto, testo senza carte, testo senza indice', () => {
    expect(interpretImport('   ', fx)).toMatchObject({ kind: 'error', code: 'empty' })
    expect(interpretImport('ydke://@@@!!!', fx)).toMatchObject({ kind: 'error', code: 'invalid' })
    expect(interpretImport('lorem ipsum dolor sit amet', fx)).toMatchObject({ kind: 'error', code: 'noCards' })
    expect(interpretImport('3 Pot of Greed')).toMatchObject({ kind: 'error', code: 'needsIndex' })
    expect(filler(1)).toHaveLength(1)
  })
  it('utility di nome file', () => {
    expect(baseName('Mio Mazzo.ydk')).toBe('Mio Mazzo')
    expect(slug('Fioritura & Cenere!')).toBe('fioritura-cenere')
  })
})
