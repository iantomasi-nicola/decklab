import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Card } from '@/domain/types'
import { decodeCards } from '@/domain/cards/cardsFormat'
import { createSearchEngine, matchesFilters, type SearchEngine } from '@/domain/cards/searchEngine'
import { createSearchRuntime } from '@/domain/cards/searchRuntime'
import { normalizeName } from '@/domain/deck/cardIndex'

const DATA = join(__dirname, '../../public/data')
const manifest = JSON.parse(readFileSync(join(DATA, 'manifest.json'), 'utf8')) as { files: { cards: string } }
const ASH = 14558127

let cards: Card[]
let engine: SearchEngine

beforeAll(() => {
  cards = decodeCards(JSON.parse(readFileSync(join(DATA, manifest.files.cards), 'utf8')))
  engine = createSearchEngine(cards)
})

const top = (q: string, n = 1) => engine.search(q, { limit: n }).map((c) => c.id)
const names = (q: string, n = 5) => engine.search(q, { limit: n }).map((c) => c.name.en)

describe('normalizzazione', () => {
  it('accenti, "&", apostrofi, maiuscole', () => {
    expect(normalizeName('Perché & l’Èra')).toBe('perche and lera')
    expect(normalizeName("Ash Blossom & Joyous Spring")).toBe('ash blossom and joyous spring')
  })
  it('query con "&" o "and" o accenti danno la stessa carta', () => {
    expect(top('ash blossom & joyous spring')).toEqual([ASH])
    expect(top('ASH BLOSSOM AND JOYOUS SPRING')).toEqual([ASH])
    expect(top('ash & joy')).toEqual([ASH])
  })
  it('apostrofi ignorati: "magicians circle" = "Magician\'s Circle"', () => {
    expect(names('magicians circle', 3)).toContain("Magician's Circle")
    expect(names("magician's circle", 3)).toContain("Magician's Circle")
  })
})

describe('ricerca IT/EN', () => {
  it('"ash blossom" e "fioritura di cenere" → stessa carta', () => {
    expect(top('ash blossom')).toEqual([ASH])
    expect(top('fioritura di cenere')).toEqual([ASH])
  })
  it('tollera i refusi', () => {
    expect(top('fioritura di cenre')).toEqual([ASH])
    expect(top('ash blosom')).toEqual([ASH])
    expect(top('fiorittura di cenere')).toEqual([ASH])
  })
  it('prefisso parziale e ordine delle parole libero', () => {
    expect(top('fioritura di cen')).toEqual([ASH])
    expect(top('joyous ash')).toEqual([ASH])
  })
  it('passcode digitato', () => {
    expect(top('14558127')).toEqual([ASH])
  })
  it('restituisce la carta base, mai un artwork alternativo', () => {
    for (const c of engine.search('blue-eyes white dragon', { limit: 10 })) expect(c.alias).toBe(0)
  })
  it('query vuota → nessun risultato (senza filtri)', () => {
    expect(engine.search('   ')).toEqual([])
  })
})

describe('ranking', () => {
  it('nome esatto prima di tutto', () => {
    expect(names('effect veiler', 1)).toEqual(['Effect Veiler'])
    expect(names('pot of greed', 1)).toEqual(['Pot of Greed'])
  })
  it('prefisso del nome prima di "contiene"', () => {
    const r = engine.search('ghost', { limit: 20 })
    const firstNonPrefix = r.findIndex((c) => !normalizeName(c.name.en).startsWith('ghost') && !normalizeName(c.name.it ?? '').startsWith('ghost'))
    const lastPrefix = r.map((c) => normalizeName(c.name.en).startsWith('ghost') || normalizeName(c.name.it ?? '').startsWith('ghost')).lastIndexOf(true)
    if (firstNonPrefix >= 0) expect(lastPrefix).toBeLessThan(firstNonPrefix)
    expect(r.length).toBeGreaterThan(5)
  })
  it('a parità di prefisso, nome più corto prima', () => {
    const r = engine.search('pot of', { limit: 10 }).map((c) => c.name.en)
    expect(r[0]).toBe('Pot of Greed')
  })
  it('la lingua non esclude l\'altra: IT con lang=en e viceversa', () => {
    expect(engine.search('fioritura di cenere', { lang: 'en', limit: 1 })[0]!.id).toBe(ASH)
    expect(engine.search('ash blossom', { lang: 'it', limit: 1 })[0]!.id).toBe(ASH)
  })
  it('rispetta il limite', () => {
    expect(engine.search('dragon', { limit: 7 })).toHaveLength(7)
  })
})

describe('filtri', () => {
  it('kind/extraOnly/inFormat combinati con la query', () => {
    const r = engine.search('dragon', { limit: 50, filters: { kind: 'monster', extraOnly: true } })
    expect(r.length).toBeGreaterThan(10)
    expect(r.every((c) => c.isExtra && c.type & 1)).toBe(true)
    const spells = engine.search('dragon', { limit: 50, filters: { kind: 'spell' } })
    expect(spells.every((c) => c.type & 2)).toBe(true)
    const tcg = engine.search('dragon', { limit: 50, filters: { inFormat: 'TCG' } })
    expect(tcg.every((c) => c.tcg)).toBe(true)
  })
  it('solo filtri, senza testo: elenco alfabetico', () => {
    const r = engine.search('', { limit: 10, filters: { kind: 'trap' } })
    expect(r).toHaveLength(10)
    expect(r.every((c) => c.type & 4)).toBe(true)
  })
  it('livello', () => {
    const r = engine.search('dragon', { limit: 50, filters: { kind: 'monster', levelMin: 8, levelMax: 8 } })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((c) => c.level === 8)).toBe(true)
  })
  it('archetipo (setcode)', () => {
    const withSet = cards.find((c) => c.setcodes.length)!
    const sc = withSet.setcodes[0]!
    const r = engine.search('', { limit: 30, filters: { setcode: sc } })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((c) => matchesFilters(c, { setcode: sc }))).toBe(true)
  })
})

describe('prestazioni (15k carte)', () => {
  it('ogni ricerca < 50 ms (mediana e massimo)', () => {
    const queries = ['ash blossom', 'fioritura di cenere', 'fioritura di cenre', 'a', 'dr', 'dragon', 'mago nero', 'pot of g', 'maxx c', 'blue-eyes', 'zzzz', 'drago occhi blu', 'ghost belle & haunted']
    for (const q of queries) engine.search(q) // riscaldamento JIT
    const times: number[] = []
    for (let i = 0; i < 5; i++)
      for (const q of queries) {
        const t = performance.now()
        engine.search(q, { limit: 20 })
        times.push(performance.now() - t)
      }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]!
    const max = times[times.length - 1]!
    console.info(`[perf] ${cards.length} righe, ${engine.size} carte base: mediana ${median.toFixed(2)} ms, max ${max.toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)]!.toFixed(2)} ms`)
    expect(median).toBeLessThan(50)
    expect(max).toBeLessThan(50)
  })
  it('costruzione indice', () => {
    const t = performance.now()
    createSearchEngine(cards)
    console.info(`[perf] build indice: ${(performance.now() - t).toFixed(0)} ms`)
  })
})

describe('searchRuntime (stesso codice del worker)', () => {
  it('scarica, indicizza e risponde; init idempotente per URL', async () => {
    const fetchFn = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => JSON.parse(readFileSync(join(DATA, url), 'utf8')) }))
    const rt = createSearchRuntime(fetchFn)
    expect(() => rt.search('ash')).toThrow()
    await Promise.all([rt.init(manifest.files.cards), rt.init(manifest.files.cards)])
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(rt.search('fioritura di cenre')[0]!.id).toBe(ASH)
  })
  it('errore di rete → init rifiutato e ritentabile', async () => {
    let ok = false
    const rt = createSearchRuntime(async (url) => ({ ok, status: ok ? 200 : 503, json: async () => JSON.parse(readFileSync(join(DATA, url), 'utf8')) }))
    await expect(rt.init(manifest.files.cards)).rejects.toThrow(/503/)
    ok = true
    await expect(rt.init(manifest.files.cards)).resolves.toMatchObject({ size: expect.any(Number) })
  })
})
