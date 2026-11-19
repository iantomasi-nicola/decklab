import { describe, expect, it } from 'vitest'
import type { Archetype } from '@/domain/types'
import { filterArchetypes, toggleIn } from './archetypeMeta'

const mk = (id: string, it: string, en: string): Archetype => ({ id, name: { it, en }, keyCards: [], starters: [], extenders: [], updatedAt: '', deletedAt: null })
const list = [mk('a', 'Drago Bianco', 'Blue-Eyes'), mk('b', 'Mago Nero', 'Dark Magician'), mk('c', 'Fiamma', 'Flame')]

describe('archetipi: filtro e ordine', () => {
  it('cerca in IT/EN senza accenti, per tag, solo preferiti; preferiti per primi', () => {
    const f = (q: string, fav: string[] = [], favOnly = false, tags: string[] = [], map = {}) =>
      filterArchetypes(list, { query: q, favoritesOnly: favOnly, tagIds: tags }, fav, map, { t1: 'Meta' }, 'it').map((a) => a.id)
    expect(f('dark')).toEqual(['b'])
    expect(f('MAGO')).toEqual(['b'])
    expect(f('')).toEqual(['a', 'c', 'b'].sort((x, y) => list.find((a) => a.id === x)!.name.it!.localeCompare(list.find((a) => a.id === y)!.name.it!)))
    expect(f('', ['c'])[0]).toBe('c')
    expect(f('', ['c'], true)).toEqual(['c'])
    expect(f('', [], false, ['t1'], { a: ['t1'] })).toEqual(['a'])
    expect(f('meta', [], false, [], { b: ['t1'] })).toEqual(['b'])
  })
  it('toggleIn', () => {
    expect(toggleIn(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleIn(['a', 'b'], 'a')).toEqual(['b'])
  })
})
