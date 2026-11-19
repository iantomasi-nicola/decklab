import { describe, expect, it } from 'vitest'
import fixtureJson from '../../../tests/fixtures/combo/v1.json'
import { serializeYdke } from '../deck/ydke'
import { readCombo, migrateToCurrent } from './migrate'
import { applyStep, allStates, boardOf, initialState, overlaysOf, stateAt, zoneCards } from './state'
import { exportCompact, exportText } from './text'
import type { ComboDoc, Step } from './types'
import { validateCombo } from './validate'
import { comboSchema } from './schema'
import { decodeLink, encodeLink, minimizeCombo } from '../share/link'
import { buildQr, QR_MAX_CHARS } from '../share/qr'
import Ajv2020 from 'ajv/dist/2020'
import schemaJson from '../../../schema/combo.v1.schema.json'

const fixture = () => structuredClone(fixtureJson) as unknown as ComboDoc
const names: Record<number, { it: string; en: string }> = {
  999000001: { it: 'Carta A', en: 'Card A' },
  999000002: { it: 'Carta B', en: 'Card B' },
  999000003: { it: 'Carta C', en: 'Card C' },
  14558127: { it: 'Ash Blossom & Joyous Spring', en: 'Ash Blossom & Joyous Spring' },
}
const nameOf = (code: number, lang: 'it' | 'en') => names[code]?.[lang] ?? String(code)
const mz = (seq: number) => ({ loc: 'mzone' as const, seq, pos: 'FACEUP_ATK' as const })
const codes = (r: ReturnType<typeof validateCombo>) => [...r.errors, ...r.warnings].map((i) => i.code.replace('combo.validation.', ''))

/** Combo con Xyz: evoca A e D, Xyz con loro come materiali, poi stacca. */
function xyzDoc(): ComboDoc {
  const d = fixture()
  d.cards = { u1: 999000001, u2: 999000002, u3: 999000003, u4: 999000001, o1: 14558127 }
  d.deck.main = [999000001, 999000001, 999000002]
  d.steps = [
    { id: 's1', action: 'specialSummon', card: 'u1', moves: [{ uid: 'u1', to: mz(1), why: 'summon' }] },
    { id: 's2', action: 'specialSummon', card: 'u4', moves: [{ uid: 'u4', to: mz(3), why: 'summon' }] },
    {
      id: 's3', action: 'specialSummon', method: 'xyz', card: 'u3',
      moves: [
        { uid: 'u1', from: mz(1), to: { loc: 'overlay', seq: 0, host: 'u3' }, why: 'material' },
        { uid: 'u4', from: mz(3), to: { loc: 'overlay', seq: 1, host: 'u3' }, why: 'material' },
        { uid: 'u3', from: { loc: 'extra' }, to: { loc: 'emz', seq: 0, pos: 'FACEUP_ATK' }, why: 'summon' },
      ],
      lp: [{ p: 0, delta: -1000 }],
      counters: [{ uid: 'u3', type: 'spell', delta: 2 }],
    },
  ]
  d.branches = []
  d.endboard = undefined
  return d
}

describe('state', () => {
  it('initialState: mano richiesta, LP default', () => {
    const s = initialState(fixture())
    expect(s.places.u1).toEqual({ p: 0, loc: 'hand', seq: 0 })
    expect(s.places.u2?.loc).toBe('hand')
    expect(s.lp).toEqual([8000, 8000])
  })

  it('applyStep: evocazione e ricerca, immutabile', () => {
    const doc = fixture()
    const s0 = initialState(doc)
    const frozen = JSON.stringify(s0)
    const s1 = applyStep(s0, doc.steps[0]!)
    expect(JSON.stringify(s0)).toBe(frozen)
    expect(s1.places.u1).toMatchObject({ loc: 'mzone', seq: 2, pos: 'FACEUP_ATK', p: 0 })
    expect(zoneCards(s1, 0, 'hand')).toEqual(['u2'])
    // ricerca di una carta non ancora rivelata: nasce in mano
    const search: Step = { id: 'x', action: 'search', searched: ['u9'], moves: [{ uid: 'u9', to: { loc: 'hand' }, why: 'search' }] }
    expect(applyStep(s1, search).places.u9).toEqual({ p: 0, loc: 'hand' })
  })

  it('applyStep: Xyz con materiali, LP e segnalini', () => {
    const doc = xyzDoc()
    const all = allStates(doc)
    const fin = all.main[3]!
    expect(fin.places.u3).toMatchObject({ loc: 'emz', seq: 0 })
    expect(overlaysOf(fin, 'u3')).toEqual(['u1', 'u4'])
    expect(fin.places.u1).toMatchObject({ loc: 'overlay', host: 'u3', p: 0 })
    expect(fin.lp).toEqual([7000, 8000])
    expect(fin.counters.u3).toEqual({ spell: 2 })
    const rm = applyStep(fin, { id: 'r', action: 'placeCounter', moves: [], counters: [{ uid: 'u3', type: 'spell', delta: -2 }] })
    expect(rm.counters.u3).toBeUndefined()
    expect(boardOf(fin, 0).places.map((p) => p.uid)).toEqual(['u1', 'u3', 'u4'])
  })

  it('stateAt / allStates con rami', () => {
    const doc = fixture()
    doc.branches[0]!.steps = [{ id: 'b1s1', action: 'sendToGY', card: 'u2', moves: [{ uid: 'u2', to: { loc: 'gy' } }] }]
    expect(stateAt(doc, -1).places.u1?.loc).toBe('hand')
    expect(stateAt(doc, 0).places.u1?.loc).toBe('mzone')
    expect(stateAt(doc, 99)).toEqual(allStates(doc).main[2])
    expect(stateAt(doc, -1, 'b1').places.u2?.loc).toBe('hand')
    expect(stateAt(doc, 0, 'b1').places.u2?.loc).toBe('gy')
    expect(() => stateAt(doc, 0, 'nope')).toThrow()
  })

  it('avversario: p dall uid / dal board', () => {
    const doc = fixture()
    doc.setup.opponent!.board = { lp: 4000, places: [{ uid: 'o1', place: { loc: 'szone', seq: 0, pos: 'FACEDOWN' } }] }
    const s = initialState(doc)
    expect(s.places.o1?.p).toBe(1)
    expect(s.lp).toEqual([8000, 4000])
    const s2 = applyStep(s, { id: 'z', action: 'sendToGY', moves: [{ uid: 'o1', to: { loc: 'gy' } }] })
    expect(s2.places.o1).toMatchObject({ p: 1, loc: 'gy' })
  })
})

describe('validate V1–V9', () => {
  it('fixture §13 valida senza errori né avvisi', () => {
    const r = validateCombo(fixture())
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })
  it('V1', () => {
    expect(codes(validateCombo(null))).toContain('notObject')
    expect(codes(validateCombo({ ...fixture(), format: 'x' }))).toContain('badFormat')
    expect(codes(validateCombo({ ...fixture(), v: undefined }))).toContain('badVersion')
    const r = validateCombo({ ...fixture(), v: 2 })
    expect(r.ok).toBe(true)
    expect(r.readOnly).toBe(true)
    expect(codes(r)).toEqual(['readOnlyNewerVersion'])
  })
  it('schema: struttura errata', () => {
    const d = fixture() as unknown as Record<string, unknown>
    d.steps = [{ id: 's1', action: 'boh', moves: [] }]
    const r = validateCombo(d)
    expect(r.ok).toBe(false)
    expect(r.errors[0]!.rule).toBe('schema')
  })
  it('V2', () => {
    const d = fixture()
    d.branches[0]!.steps = [{ ...d.steps[0]! }]
    expect(codes(validateCombo(d))).toContain('duplicateStepId')
  })
  it('V3', () => {
    const d = fixture()
    d.steps[0]!.targets = ['zz']
    const r = validateCombo(d)
    expect(r.errors.find((e) => e.code.endsWith('unknownUid'))?.params).toEqual({ uid: 'zz' })
  })
  it('V4', () => {
    const d = fixture()
    d.branches[0]!.condition.afterStep = 'nope'
    expect(codes(validateCombo(d))).toContain('afterStepMissing')
    const e = fixture()
    e.branches[0]!.rejoin = 's1'
    expect(codes(validateCombo(e))).toContain('rejoinNotAfter')
    const f = fixture()
    f.branches[0]!.condition.afterStep = 's1'
    f.branches[0]!.rejoin = 's2'
    expect(validateCombo(f).errors).toEqual([])
  })
  it('V5', () => {
    const d = xyzDoc()
    d.steps[0]!.group = 'g1'
    d.steps[2]!.group = 'g1'
    expect(codes(validateCombo(d))).toContain('groupNotContiguous')
    d.steps[1]!.group = 'g1'
    expect(codes(validateCombo(d))).not.toContain('groupNotContiguous')
  })
  it('V6', () => {
    const d = fixture()
    d.deck.ydke = serializeYdke(d.deck)
    expect(validateCombo(d).errors).toEqual([])
    d.deck.ydke = serializeYdke({ main: [1], extra: [], side: [] })
    expect(codes(validateCombo(d))).toContain('ydkeMismatch')
  })
  it('V7: deriva = avviso non bloccante', () => {
    const d = fixture()
    d.endboard!.own.places[0]!.place.seq = 4
    const r = validateCombo(d)
    expect(r.ok).toBe(true)
    expect(r.warnings.map((w) => w.rule)).toEqual(['V7'])
  })
  it('V8', () => {
    const d = fixture()
    d.setup.hand.required = ['u1', 'u1']
    d.cards.u4 = 999000001
    expect(validateCombo(d).errors.map((e) => e.code)).toEqual([]) // u1 due volte ma solo 2 copie → ok
    d.setup.hand.required = ['u1', 'u1', 'u4']
    expect(codes(validateCombo(d))).toContain('handCardNotInDeck')
    const e = fixture()
    e.setup.hand.required = ['u3']
    expect(codes(validateCombo(e))).toContain('handCardNotInDeck') // u3 è nell'extra, non nel main
  })
  it('V9', () => {
    const d = fixture()
    d.steps[0]!.moves[0]!.from = { loc: 'gy' }
    expect(codes(validateCombo(d))).toContain('moveFromMismatch')
    const e = fixture()
    e.cards.u7 = 999000002
    e.steps[0]!.moves.push({ uid: 'u7', from: { loc: 'hand' }, to: { loc: 'gy' } })
    const r = validateCombo(e)
    expect(r.ok).toBe(true)
    expect(codes(r)).toContain('moveUnknownCard')
  })
  it('xyz valido', () => {
    const r = validateCombo(xyzDoc())
    expect(r.errors).toEqual([])
  })
})

describe('JSON schema', () => {
  const ajv = new Ajv2020({ strict: false })
  const validate = ajv.compile(schemaJson)
  it('accetta fixture e rifiuta documento errato', () => {
    expect(validate(fixture())).toBe(true)
    expect(validate({ ...fixture(), format: 'altro' })).toBe(false)
    expect(validate({ ...fixture(), campoSconosciuto: 1 })).toBe(true)
  })
  it('zod e tipi coincidono con ComboDoc', () => {
    const parsed: ComboDoc = comboSchema.parse(fixture()) as ComboDoc
    expect(parsed.v).toBe(1)
  })
})

describe('migrate / readCombo', () => {
  it('round-trip JSON, identità v1', () => {
    const src = fixture()
    const r = readCombo(JSON.stringify(src))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc).toEqual(src)
      expect(r.readOnly).toBe(false)
      expect(JSON.parse(JSON.stringify(r.doc))).toEqual(src)
    }
    expect(migrateToCurrent(src as never).doc).toBe(src)
  })
  it('preserva campi ignoti', () => {
    const src = { ...fixture(), futuro: { a: 1 }, steps: fixture().steps.map((s) => ({ ...s, extra: 'x' })) }
    const r = readCombo(src)
    expect(r.ok && (r.doc as unknown as Record<string, unknown>).futuro).toEqual({ a: 1 })
    expect(r.ok && (r.doc.steps[0] as unknown as Record<string, unknown>).extra).toBe('x')
  })
  it('v superiore: sola lettura, documento invariato', () => {
    const src = { ...fixture(), v: 7, nuovo: [1, 2] }
    const r = readCombo(src)
    expect(r.ok && r.readOnly).toBe(true)
    expect(r.ok && r.doc).toEqual(src)
  })
  it('errori: JSON non valido e import con errore bloccante', () => {
    expect(readCombo('{').ok).toBe(false)
    const bad = fixture()
    bad.steps[0]!.card = 'zz'
    expect(readCombo(bad).ok).toBe(false)
  })
})

describe('text', () => {
  it('numerato IT', () => {
    const t = exportText(fixture(), { lang: 'it', nameOf, legality: '✔ legale' })
    expect(t).toContain('Apertura base — Esempio / Standard — TCG, banlist 2026.10 ✔ legale')
    expect(t).toContain('Mano: Carta A, Carta B + 3 casuali · Giochi per primo')
    expect(t).toContain('1. Evoca Normalmente Carta A.')
    expect(t).toContain("2. Attiva l'effetto 1 di Carta A: cerca Carta B.")
    expect(t).toContain("↳ Se l'avversario usa Ash Blossom & Joyous Spring (effetto 1) in risposta all'attivazione: Se Ash sulla ricerca")
    expect(t).toContain('Board finale: Carta A (Zona Mostro 3)')
  })
  it('numerato EN e Xyz con materiali', () => {
    const t = exportText(xyzDoc(), { lang: 'en', nameOf })
    expect(t).toContain('3. Special Summon Card C (Xyz): materials Card A, Card A')
    expect(t).toContain('End board:')
    expect(t).toContain('+ 2 Xyz material')
  })
  it('compatto', () => {
    const t = exportCompact(fixture(), { lang: 'it', nameOf })
    expect(t.split('\n')[0]).toBe('**Apertura base** (TCG 2026.10) | Mano: Carta A, Carta B')
    expect(t).toContain('1) NS Carta A  2) Eff.1 Carta A → cerca Carta B [Ash Blossom & Joyous Spring→Se Ash sulla ricerca]')
    expect(t).toContain('Board finale: Carta A')
    expect(exportCompact(fixture(), { lang: 'en', nameOf, layout: 'lines' })).toContain('1) NS Card A\n2) ')
  })
})

describe('share link', () => {
  it('round-trip fixture; endboard ricalcolato, ydke/responses rimossi', () => {
    const d = fixture()
    const link = encodeLink(d)
    expect(link.startsWith('1.')).toBe(true)
    expect(link).toMatch(/^1\.[A-Za-z0-9_-]+$/)
    const r = decodeLink(`https://x.test/c#${link}`)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.doc).toEqual(d)
    expect(minimizeCombo(d).endboard).toBeUndefined()
  })
  it('20 passi + engine', () => {
    const d = xyzDoc()
    d.engine = { core: 'c', scriptsCommit: 'abc', cdbVersion: '1', mode: 'MR5', seed: [1, 2], responses: ['AAAA', 'BBBB'] }
    d.deck.ydke = serializeYdke(d.deck)
    for (let i = 4; i <= 20; i++) {
      d.steps.push({ id: `s${i}`, action: 'changeLP', moves: [], lp: [{ p: 1, delta: -100 }], note: { it: `Passo ${i}`, en: `Step ${i}` } })
    }
    expect(d.steps).toHaveLength(20)
    const r = decodeLink(encodeLink(d))
    expect(r.ok).toBe(true)
    if (r.ok) {
      const { engine, endboard, deck, ...rest } = r.doc
      const { engine: e0, endboard: _e, deck: d0, ...rest0 } = d
      expect(rest).toEqual(rest0)
      expect(engine).toEqual({ ...e0, responses: [] })
      expect(deck.ydke).toBeUndefined()
      expect(deck.main).toEqual(d0.main)
      expect(endboard?.own.places.some((p) => p.uid === 'u3')).toBe(true)
      expect(endboard?.opponent?.lp).toBe(8000 - 1700)
    }
  })
  it('errori di decodifica', () => {
    expect(decodeLink('abc').ok).toBe(false)
    expect(decodeLink('9.abc').ok).toBe(false)
    const r = decodeLink('1.!!!')
    expect(!r.ok && r.errors[0]!.code).toBe('combo.link.corrupt')
  })
})

describe('qr', () => {
  it('genera SVG per link breve, avvisa se lungo', async () => {
    const q = await buildQr(encodeLink(fixture()))
    expect(q.svg).toContain('<svg')
    expect(q.warning).toBeUndefined()
    const long = await buildQr('a'.repeat(1500))
    expect(long.warning).toBe('combo.qr.long')
    const tooLong = await buildQr('a'.repeat(QR_MAX_CHARS + 1))
    expect(tooLong.svg).toBeNull()
    expect(tooLong.warning).toBe('combo.qr.tooLong')
  })
})
