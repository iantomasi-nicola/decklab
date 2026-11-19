import { describe, expect, it } from 'vitest'
import { ASH, index } from './fixtures'
import { normalizeName } from './cardIndex'
import { parseYdk, serializeYdk } from './ydk'
import { parseYdke, serializeYdke } from './ydke'
import { parseTextList, textResultToDeck } from './textList'
import { detectAndParse, serializeDeckJson } from './importDetect'
import { exportDeckText } from './exportText'

const deck = { main: [ASH, ASH, 1001, 1005], extra: [1007], side: [1003] }

describe('normalizeName', () => {
  it('rimuove accenti, apostrofi, & e maiuscole', () => {
    expect(normalizeName("Pentola dell'Avidità")).toBe('pentola dellavidita')
    expect(normalizeName('Ash Blossom & Joyous Spring')).toBe('ash blossom and joyous spring')
  })
})

describe('ydk', () => {
  it('parse con CRLF, commenti e righe vuote', () => {
    const t = '#created by me\r\n#main\r\n14558127\r\n\r\n14558127\r\n# boh\r\n#extra\r\n1007\r\n!side\r\n1003\r\n'
    expect(parseYdk(t)).toEqual({ main: [ASH, ASH], extra: [1007], side: [1003] })
  })
  it('roundtrip', () => expect(parseYdk(serializeYdk(deck))).toEqual(deck))
})

describe('ydke', () => {
  it('uint32 little-endian', () => {
    expect(serializeYdke({ main: [ASH], extra: [], side: [] })).toBe('ydke://ryPeAA==!!!')
  })
  it('roundtrip', () => expect(parseYdke(serializeYdke(deck))).toEqual(deck))
  it('errori', () => {
    expect(() => parseYdke('ydke://AAA!!!')).toThrow()
    expect(() => parseYdke('foo')).toThrow()
  })
})

describe('textList', () => {
  it('formati di conteggio EN', () => {
    const r = parseTextList('3 Ash Blossom & Joyous Spring\nRaigeki x2\n1x Dark Hole\n// c\n', index)
    expect(r.matched.map((m) => [m.card.id, m.count])).toEqual([[ASH, 3], [1003, 2], [1004, 1]])
    expect(r.unmatched).toEqual([])
  })
  it('italiano con accenti e senza &', () => {
    const r = parseTextList('2 fioritura di cenere e gioiosa primavera\n1 Pentola dell Avidita', index)
    expect(r.matched.map((m) => m.card.id)).toEqual([ASH, 1001])
  })
  it('l\'alias si risolve alla carta canonica', () => {
    const r = parseTextList('1 Ash Blossom & Joyous Spring', index)
    expect(r.ambiguous).toEqual([])
    expect(r.matched[0]!.card.id).toBe(ASH)
  })
  it('tollerante a refusi', () => {
    const r = parseTextList('3 Ash Blosom & Joyous Spring', index)
    expect(r.matched[0]).toMatchObject({ count: 3, fuzzy: true })
    expect(r.matched[0]!.card.id).toBe(ASH)
  })
  it('ambiguo e non trovato', () => {
    const r = parseTextList('1 Dark Mag\n1 Carta Inesistente Xyz', index)
    expect(r.ambiguous[0]!.candidates.map((c) => c.id).sort()).toEqual([1005, 1006])
    expect(r.unmatched[0]!.line).toBe('1 Carta Inesistente Xyz')
  })
  it('sezioni', () => {
    const d = textResultToDeck(parseTextList('Main Deck\n2 Raigeki\nExtra Deck\n1 Accesscode Talker\nSide Deck\n1 Dark Hole', index))
    expect(d).toEqual({ main: [1003, 1003], extra: [1007], side: [1004] })
  })
})

describe('exportText', () => {
  it('lingua scelta e roundtrip', () => {
    const it = exportDeckText({ main: [ASH, 14558128, 1005], extra: [1007], side: [] }, index, 'it')
    expect(it).toContain('2 Fioritura di Cenere & Gioiosa Primavera')
    expect(it).toContain('1 Accesscode Talker') // fallback EN
    const back = textResultToDeck(parseTextList(it, index))
    expect(back).toEqual({ main: [ASH, ASH, 1005], extra: [1007], side: [] })
    expect(exportDeckText(deck, index, 'en')).toContain('2 Ash Blossom & Joyous Spring')
  })
})

describe('detectAndParse', () => {
  it('ydk', () => expect(detectAndParse(serializeYdk(deck))).toMatchObject({ format: 'ydk', deck }))
  it('ydk solo numeri', () => expect(detectAndParse('14558127\n1001').format).toBe('ydk'))
  it('ydke', () => expect(detectAndParse(serializeYdke(deck))).toMatchObject({ format: 'ydke', deck }))
  it('json', () => expect(detectAndParse(serializeDeckJson(deck))).toMatchObject({ format: 'json', deck }))
  it('json errato', () => expect(detectAndParse('{"format":"x"}').error).toBeTruthy())
  it('testo', () => {
    const r = detectAndParse('3 Ash Blossom & Joyous Spring', index)
    expect(r.format).toBe('text')
    expect(r.deck!.main).toEqual([ASH, ASH, ASH])
  })
  it('testo senza index', () => expect(detectAndParse('3 Raigeki').error).toBeTruthy())
  it('vuoto', () => expect(detectAndParse('  ').format).toBe('unknown'))
})
