import { describe, expect, it } from 'vitest'
import type { Card } from '../../src/domain/types'
import { decodeCards, encodeCards } from '../../src/domain/cards/cardsFormat'
import { loadCards, loadTexts, type DataManifest } from '../../src/domain/cards/loadCards'

const base = (o: Partial<Card> & Pick<Card, 'id' | 'name'>): Card => ({
  alias: 0, type: 0x21, race: 0x10, attribute: 4, level: 3, atk: 0, def: 1800,
  setcodes: [], isExtra: false, tcg: true, ocg: true, ...o,
})

const FIXTURE: Card[] = [
  base({ id: 14558127, name: { en: 'Ash Blossom & Joyous Spring', it: 'Fioritura di Cenere & Gioiosa Primavera' }, genesys: 18 }),
  base({ id: 14558128, alias: 14558127, name: { en: 'Ash Blossom & Joyous Spring', it: 'Fioritura di Cenere & Gioiosa Primavera' }, genesys: 18 }),
  base({ id: 15308295, name: { en: 'Abyss Actor - Comic Relief' }, type: 0x1000021 | 0x1000000, level: 4, scale: 8, setcodes: [0x10ec, 0x20] }),
  base({ id: 1, name: { en: 'Pot of Greed' }, type: 2, race: 0, attribute: 0, level: 0, atk: 0, def: 0, ocg: false }),
  base({ id: 2, name: { en: 'Infinite Link', it: 'Infinite Link' }, type: 0x4000021, atk: -2, isExtra: true, tcg: false }),
]

describe('formato carte compatto', () => {
  it('round-trip encode/decode (ordinato per id, nome IT uguale all\'EN scartato)', () => {
    const file = encodeCards(FIXTURE)
    expect(file.n).toBe(5)
    expect(file.cols.id).toEqual([1, 2, 14558127, 14558128, 15308295])
    const out = decodeCards(JSON.parse(JSON.stringify(file)))
    const expected = [...FIXTURE]
      .sort((a, b) => a.id - b.id)
      .map((c) => (c.name.it === c.name.en ? { ...c, name: { en: c.name.en } } : c))
    expect(out).toEqual(expected)
  })

  it('i nomi degli alias identici alla base non sono duplicati nel file', () => {
    const file = encodeCards(FIXTURE)
    const i = file.cols.id.indexOf(14558128)
    expect(file.cols.en[i]).toBe('')
    expect(file.cols.it[i]).toBe('')
    expect(decodeCards(file).find((c) => c.id === 14558128)!.name.it).toMatch(/^Fioritura/)
  })

  it('mappe sparse: scala, archetipi, genesys', () => {
    const file = encodeCards(FIXTURE)
    expect(Object.keys(file.cols.scale)).toHaveLength(1)
    expect(Object.keys(file.cols.setcodes)).toHaveLength(1)
    expect(Object.keys(file.cols.genesys)).toHaveLength(2)
  })

  it('rifiuta versioni sconosciute', () => {
    const file = { ...encodeCards(FIXTURE), v: 2 } as never
    expect(() => decodeCards(file)).toThrow()
  })
})

describe('loader', () => {
  const manifest: DataManifest = {
    schema: 1, version: 't', builtAt: '2026-01-01T00:00:00Z',
    files: { cards: 'cards.t.json', banlists: 'banlists.t.json', archetypes: 'archetypes.t.json', texts: { en: 'texts.en.t.json' } },
  }
  const fakeFetch = async (url: string) => {
    const body: Record<string, unknown> = {
      '/data/cards.t.json': encodeCards(FIXTURE),
      '/data/texts.en.t.json': { format: 'combo-lab/texts', v: 1, lang: 'en', texts: { '1': 'draw 2' } },
    }
    const b = body[url]
    return { ok: b !== undefined, status: b === undefined ? 404 : 200, json: async () => b }
  }
  it('ricostruisce Card[] e testi', async () => {
    expect(await loadCards(manifest, '/data/', fakeFetch)).toHaveLength(5)
    expect(await loadTexts(manifest, 'en', '/data/', fakeFetch)).toEqual({ '1': 'draw 2' })
    expect(await loadTexts(manifest, 'it', '/data/', fakeFetch)).toEqual({})
  })
  it('errore se il file manca', async () => {
    await expect(loadCards({ ...manifest, files: { ...manifest.files, cards: 'x.json' } }, '/data/', fakeFetch)).rejects.toThrow(/404/)
  })
})
