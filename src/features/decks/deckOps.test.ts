import { describe, expect, it } from 'vitest'
import {
  addCard, countIn, emptyDeck, moveCard, newHistory, pushState, redoState, removeAll, removeCard,
  replacePresent, toStacks, undoState, HISTORY_LIMIT,
} from './deckOps'
import { computeStats } from './deckStats'
import { cards, index } from '@/domain/deck/fixtures'

describe('deckOps', () => {
  it('aggiunge accanto alle copie già presenti e rimuove l\'ultima', () => {
    let d = addCard(emptyDeck(), 'main', 1)
    d = addCard(d, 'main', 2)
    d = addCard(d, 'main', 1)
    expect(d.main).toEqual([1, 1, 2])
    d = removeCard(d, 'main', 1)
    expect(d.main).toEqual([1, 2])
    expect(removeCard(d, 'main', 99)).toBe(d)
    expect(removeAll(addCard(d, 'main', 1), 'main', 1).main).toEqual([2])
  })
  it('sposta tra sezioni e raggruppa', () => {
    const d = moveCard({ main: [1, 1, 2], extra: [], side: [] }, 'main', 'side', 1)
    expect(d).toEqual({ main: [1, 2], extra: [], side: [1] })
    expect(toStacks([5, 6, 5])).toEqual([{ id: 5, count: 2 }, { id: 6, count: 1 }])
    expect(countIn([1, 1, 2], 1)).toBe(2)
  })
})

describe('history', () => {
  it('annulla / ripeti e azzera il futuro con una nuova modifica', () => {
    let h = newHistory(0)
    h = pushState(h, 1)
    h = pushState(h, 2)
    h = undoState(h)
    expect(h.present).toBe(1)
    h = redoState(h)
    expect(h.present).toBe(2)
    h = undoState(undoState(h))
    h = pushState(h, 9)
    expect(h.future).toEqual([])
    expect(undoState(newHistory(5)).present).toBe(5)
  })
  it('replacePresent unisce due gesti in un solo passo di annullamento', () => {
    let h = pushState(newHistory('a'), 'b')
    h = replacePresent(h, 'c')
    expect(undoState(h).present).toBe('a')
  })
  it('limita la cronologia', () => {
    let h = newHistory(0)
    for (let i = 1; i < HISTORY_LIMIT + 50; i++) h = pushState(h, i)
    expect(h.past.length).toBe(HISTORY_LIMIT)
  })
})

describe('computeStats', () => {
  it('conta tipi e gestisce carte sconosciute', () => {
    const s = computeStats({ main: [1001, 1005, 1005, 999999], extra: [1007], side: [1009] }, index)
    expect(s.total).toBe(4)
    expect(s.unknown).toBe(1)
    expect(s.kinds.monster).toBe(4)
    expect(cards.length).toBeGreaterThan(0)
  })
})
