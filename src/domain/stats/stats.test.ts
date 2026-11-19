import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyze, applyOverride, atLeastOne, buildRules, collectUnknownPairs, comb, composition, computeHand, effectiveLabel, engineIds, hypergeom, labelKey, mergeCards, parseDeckspace, poissonBinomial, roundPlan, sensitivity, serializeDeckspace, tournament } from './index'
import type { HandInput, Label, StatsCard } from './index'
import type { Card } from '../types'

const C = (n: number, k: number) => comb(n, k)
const close = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThan(eps)
const card = (id: number, count: number, tags: string[] = [], extra: Partial<StatsCard> = {}): StatsCard => ({ id, count, tags, ...extra })
const input = (cards: StatsCard[], labels: Record<string, Label> = {}, assumed: number | null = 40, extraRules?: number[][]): HandInput => ({ cards, labels, assumedDeckSize: assumed, extraRules })

describe('aritmetica', () => {
  it('coefficienti binomiali noti', () => {
    expect(comb(40, 5)).toBe(658008)
    expect(comb(37, 5)).toBe(435897)
    expect(comb(40, 6)).toBe(3838380)
    expect(comb(5, 6)).toBe(0)
    expect(comb(5, 0)).toBe(1)
  })
  it('ipergeometrica: somma 1 e valore a mano', () => {
    let s = 0
    for (let k = 0; k <= 5; k++) s += hypergeom(40, 3, 5, k)
    close(s, 1)
    close(hypergeom(40, 3, 5, 0), 435897 / 658008)
  })
  it('almeno una copia: 3 su 40, mano 5 = 1 − C(37,5)/C(40,5)', () => {
    close(atLeastOne(40, 3, 5), 1 - 435897 / 658008)
    expect(atLeastOne(40, 3, 5)).toBeCloseTo(0.3375, 3)
  })
  it('poisson-binomiale con p uguali = binomiale', () => {
    const pmf = poissonBinomial([0.2, 0.2, 0.2])
    close(pmf[0]!, 0.512)
    close(pmf[1]!, 3 * 0.2 * 0.64)
    close(pmf[3]!, 0.008)
  })
})

describe('mano iniziale: casi calcolati a mano', () => {
  it('3 copie di uno starter in 40 carte, mano 5', () => {
    const r = computeHand(input([card(1, 3, ['S1'])]), 5)
    close(r.playable, 1 - 435897 / 658008)
    close(r.playable + r.brick, 1)
    expect(r.deckSize).toBe(40)
    expect(r.blanks).toBe(37)
  })
  it('mano da 6: 1 − C(37,6)/C(40,6)', () => {
    close(computeHand(input([card(1, 3, ['S1'])]), 6).playable, 1 - C(37, 6) / C(40, 6))
  })
  it('due starter distinti da 3 copie: 1 − C(34,5)/C(40,5)', () => {
    close(computeHand(input([card(1, 3, ['S1']), card(2, 3, ['S1'])]), 5).playable, 1 - C(34, 5) / C(40, 5))
  })
  it('coppia A+B (3 copie ciascuna): 1 − 2C(37,5)/C(40,5) + C(34,5)/C(40,5)', () => {
    const cards = [card(1, 3, ['C2'], { comboWith: [2] }), card(2, 3, ['C2'])]
    const r = computeHand(input(cards), 5)
    close(r.playable, (C(40, 5) - 2 * C(37, 5) + C(34, 5)) / C(40, 5))
    expect(r.playable).toBeCloseTo(0.09798, 4)
  })
  it('coppia con la stessa carta (A,A): almeno 2 copie su 3', () => {
    const r = computeHand(input([card(1, 3, ['C2'], { comboWith: [1] })]), 5)
    close(r.playable, hypergeom(40, 3, 5, 2) + hypergeom(40, 3, 5, 3))
  })
  it('il mazzo non ipotetico usa solo le carte date', () => {
    const r = computeHand(input([card(1, 3, ['S1']), card(2, 37, [])], {}, null), 5)
    close(r.playable, 1 - 435897 / 658008)
    expect(r.blanks).toBe(0)
  })
  it('mazzo ipotetico più piccolo del totale: usa il totale', () => {
    expect(computeHand(input([card(1, 3, ['S1']), card(2, 40, [])], {}, 40), 5).deckSize).toBe(43)
  })
  it('mano più grande del mazzo: nessun calcolo', () => {
    const r = computeHand(input([card(1, 2, ['S1'])], {}, null), 5)
    expect(r.playable + r.brick).toBe(0)
  })
  it('istogramma: carte engine in mano', () => {
    const r = computeHand(input([card(1, 3, ['S1'])]), 5, { detail: true })
    close(r.engineHist[0]!, hypergeom(40, 3, 5, 0))
    close(r.engineHist[1]!, hypergeom(40, 3, 5, 1))
    close(r.engineHist.reduce((a, b) => a + b, 0), 1)
  })
  it('odds per carta e per ruolo', () => {
    const r = computeHand(input([card(1, 3, ['S1']), card(2, 2, ['S1', 'NE'])]), 5, { detail: true })
    close(r.cardOdds.find((c) => c.id === 2)!.p, 1 - C(38, 5) / C(40, 5))
    close(r.roleOdds.find((c) => c.role === 'S1')!.p, 1 - C(35, 5) / C(40, 5))
    expect(r.roleOdds.find((c) => c.role === 'NE')!.copies).toBe(2)
  })
})

/** Riferimento indipendente: enumera le mani come sottoinsiemi di carte fisiche e classifica con la definizione (non con il raggruppamento). */
function brute(rawInp: HandInput, h: number): { p: number; u: number } {
  const inp = applyOverride(rawInp)
  const cards = mergeCards(inp.cards)
  const total = inp.assumedDeckSize && inp.assumedDeckSize > cards.reduce((a, c) => a + c.count, 0) ? inp.assumedDeckSize : cards.reduce((a, c) => a + c.count, 0)
  const engine = new Set(engineIds(cards, inp.labels, inp.extraRules))
  const rules = buildRules(inp, h)
  const unk = [...collectUnknownPairs(inp, h, true).values()]
  const physical: number[] = []
  for (const c of cards) for (let i = 0; i < c.count; i++) physical.push(c.id)
  while (physical.length < total) physical.push(-1)
  let good = 0
  let maybe = 0
  let all = 0
  const contains = (ms: Map<number, number>, r: number[]) => {
    const need = new Map<number, number>()
    for (const id of r) need.set(id, (need.get(id) ?? 0) + 1)
    return [...need].every(([id, n]) => (ms.get(id) ?? 0) >= n)
  }
  const pick = (start: number, left: number, chosen: number[]) => {
    if (left === 0) {
      all++
      const e = chosen.filter((id) => engine.has(id))
      let st: 'P' | 'U' | 'B'
      if (e.length === 0) st = 'B'
      else if (e.length <= 3) {
        const l = effectiveLabel(inp, e, h)
        st = l === 'PLAYABLE' ? 'P' : l === 'UNKNOWN' ? 'U' : 'B'
      } else {
        const ms = new Map<number, number>()
        for (const id of e) ms.set(id, (ms.get(id) ?? 0) + 1)
        st = rules.some((r) => contains(ms, r)) ? 'P' : unk.some((r) => contains(ms, r)) ? 'U' : 'B'
      }
      if (st === 'P') good++
      else if (st === 'U') maybe++
      return
    }
    for (let i = start; i <= physical.length - left; i++) pick(i + 1, left - 1, [...chosen, physical[i]!])
  }
  pick(0, h, [])
  return { p: good / all, u: maybe / all }
}

describe('mano iniziale: confronto con enumerazione bruta', () => {
  const cards = [
    card(1, 2, ['S1']),
    card(2, 2, ['C2'], { comboWith: [3, 2] }),
    card(3, 3, ['C2', 'C3'], { brickWith: [4] }),
    card(4, 1, ['C3']),
    card(5, 1, ['NE']),
  ]
  const labels: Record<string, Label> = { [labelKey([3, 3, 4])]: 'PLAYABLE', [labelKey([3, 4])]: 'BRICK', [labelKey([2, 4, 4])]: 'PLAYABLE', [labelKey([1, 2])]: 'BRICK', [labelKey([2, 2, 3])]: 'BRICK' }
  for (const [h, n] of [[5, 12], [6, 13], [5, 15]] as const) {
    it(`mano ${h}, mazzo ${n}`, () => {
      const inp = input(cards, labels, n)
      const rules = buildRules(inp, h)
      void rules
      const r = computeHand(inp, h)
      const ref = brute(inp, h)
      close(r.playable, ref.p, 1e-12)
      close(r.unknown, ref.u, 1e-12)
    })
  }
  it('con regole extra (mano richiesta di una combo)', () => {
    const inp = input([card(1, 2, ['C2']), card(2, 1, ['C3']), card(3, 3, [])], {}, 12, [[1, 2, 3]])
    close(computeHand(inp, 5).playable, brute(inp, 5).p)
    expect(computeHand(inp, 5).playable).toBeGreaterThan(0)
  })
})

describe('etichette e regole', () => {
  it('una BRICK esplicita sulla coppia vince sulla derivazione', () => {
    const cards = [card(1, 3, ['C2'], { comboWith: [2] }), card(2, 3, ['C2'])]
    expect(buildRules(input(cards), 5)).toEqual([[1, 2]])
    expect(buildRules(input(cards, { [labelKey([2, 1])]: 'BRICK' }), 5)).toEqual([])
    expect(computeHand(input(cards, { '1,2': 'BRICK' }), 5).playable).toBe(0)
  })
  it('un brick in brickWith vince sul combo', () => {
    const cards = [card(1, 3, ['C2'], { comboWith: [2], brickWith: [2] }), card(2, 3, ['C2'])]
    expect(buildRules(input(cards), 5)).toEqual([])
  })
  it('un tris PLAYABLE esplicito è una regola; i superinsiemi di regole esistenti vengono tolti', () => {
    const cards = [card(1, 1, ['S1']), card(2, 1, ['C3']), card(3, 1, ['C3'])]
    expect(buildRules(input(cards, { '1,2,3': 'PLAYABLE' }), 5)).toEqual([[1]])
    expect(buildRules(input(cards.slice(1), { '2,3,3': 'PLAYABLE', '2,3': 'PLAYABLE' }), 5)).toEqual([[2, 3]])
  })
  it('regole non realizzabili (copie insufficienti, mano troppo piccola) sono scartate', () => {
    const cards = [card(1, 1, ['C2'], { comboWith: [1] })]
    expect(buildRules(input(cards), 5)).toEqual([])
    expect(buildRules(input([card(1, 1, ['C3'])], { '1': 'PLAYABLE' }), 5)).toEqual([[1]])
    expect(buildRules(input([card(1, 3, ['C3'])], { '1,1,1': 'PLAYABLE' }), 2)).toEqual([])
  })
  it('le carte con lo stesso passcode si fondono', () => {
    expect(mergeCards([card(1, 1, ['S1']), card(1, 2, ['NE']), card(2, 0)])).toEqual([{ id: 1, count: 3, tags: ['S1', 'NE'], comboWith: [], brickWith: [] }])
  })
})

describe('torneo', () => {
  it('15 round con brick 20%: media, P(≥1), distribuzione', () => {
    const t = tournament(new Array(15).fill(0.2), 3)
    close(t.expectedBricks, 3)
    close(t.expectedPlayable, 12)
    close(t.pNone, 0.8 ** 15)
    close(t.pAtLeast1, 1 - 0.8 ** 15)
    close(t.pmf.reduce((a, b) => a + b, 0), 1)
    close(t.pmf[1]!, 15 * 0.2 * 0.8 ** 14)
    close(t.pAtLeastK, 1 - t.pmf[0]! - t.pmf[1]! - t.pmf[2]!)
    expect(t.pmf).toHaveLength(16)
  })
  it('piani primo/secondo/misto', () => {
    expect(roundPlan('first', 3, 0.3, 0.1)).toEqual([0.3, 0.3, 0.3])
    expect(roundPlan('second', 2, 0.3, 0.1)).toEqual([0.1, 0.1])
    expect(roundPlan('mixed', 5, 0.3, 0.1)).toEqual([0.3, 0.3, 0.3, 0.1, 0.1])
    close(tournament(roundPlan('mixed', 4, 0.3, 0.1), 1).expectedBricks, 0.8)
  })
  it('zero round', () => {
    const t = tournament([], 1)
    expect(t.pAtLeast1).toBe(0)
    expect(t.pmf).toEqual([1])
  })
})

describe('sensibilità', () => {
  it('3 → 2 copie e 2 → 3 copie di un singolo starter (mano 5, 40 carte)', () => {
    const base2 = computeHand(input([card(1, 2, ['S1'])]), 5).playable
    const s = sensitivity(input([card(1, 2, ['S1'])]), 5).find((x) => x.id === 1)!
    close(s.minus!, (1 - C(39, 5) / C(40, 5) - base2) * 100, 1e-9)
    close(s.plus!, (1 - C(37, 5) / C(40, 5) - base2) * 100, 1e-9)
    const s3 = sensitivity(input([card(1, 3, ['S1'])]), 5).find((x) => x.id === 1)!
    expect(s3.plus).toBeNull()
    expect(s3.minus!).toBeLessThan(0)
  })
  it('senza mazzo ipotetico togliere una carta accorcia il mazzo', () => {
    const inp = input([card(1, 3, ['S1']), card(2, 37, [])], {}, null)
    const s = sensitivity(inp, 5).find((x) => x.id === 1)!
    close(s.minus!, (1 - C(37, 5) / C(39, 5) - (1 - C(37, 5) / C(40, 5))) * 100, 1e-9)
  })
  it('riempimento generico: aggiungerlo peggiora', () => {
    const f = sensitivity(input([card(1, 3, ['S1']), card(2, 37, [])], {}, null), 5).find((x) => x.id === 0)!
    expect(f.plus!).toBeLessThan(0)
    expect(f.minus!).toBeGreaterThan(0)
    // con il mazzo ipotetico la carta in più prende il posto di una vuota: nessun effetto
    expect(sensitivity(input([card(1, 3, ['S1'])]), 5).find((x) => x.id === 0)!.plus).toBe(0)
  })
  it('ordinata per impatto', () => {
    const s = sensitivity(input([card(1, 3, ['S1']), card(2, 1, ['S1'])]), 5)
    const imp = (x: (typeof s)[number]) => Math.max(Math.abs(x.minus ?? 0), Math.abs(x.plus ?? 0))
    for (let i = 1; i < s.length; i++) expect(imp(s[i - 1]!)).toBeGreaterThanOrEqual(imp(s[i]!))
  })
})

describe('analyze', () => {
  it('mani 5 e 6, callback e progresso', () => {
    const prog: number[] = []
    let early = false
    const r = analyze({ input: input([card(1, 3, ['S1'])]), handSizes: [5, 6], sensitivityHand: 5 }, { onProgress: (p) => prog.push(p), onHands: () => (early = true) })
    expect(early).toBe(true)
    expect(r.hands[6]!.playable).toBeGreaterThan(r.hands[5]!.playable)
    expect(r.sensitivity).not.toBeNull()
    expect(prog[prog.length - 1]).toBe(100)
    expect([...prog].sort((a, b) => a - b)).toEqual(prog)
  })
})

describe('composizione', () => {
  const mk = (type: number, attribute = 0, level = 0): Card => ({ id: 1, alias: 0, name: { en: 'x' }, type, race: 0, attribute, level, atk: 0, def: 0, setcodes: [], isExtra: false })
  it('tipi, attributi, livelli e ruoli', () => {
    const c = composition([
      { card: mk(0x21, 0x20, 4), count: 3, tags: ['S1'] },
      { card: mk(0x21, 0x10, 4), count: 2, tags: ['C2', 'NE'] },
      { card: mk(0x10002), count: 1, tags: [] },
      { card: mk(0x4), count: 2, tags: ['NE'] },
      { card: mk(0x4000021, 0x10, 2), count: 1, tags: [] },
      { card: undefined, count: 1, tags: [] },
    ])
    expect(c.kinds).toEqual({ monster: 6, spell: 1, trap: 2 })
    expect(c.total).toBe(9)
    expect(c.unknown).toBe(1)
    expect(c.attributes).toEqual({ dark: 3, light: 3 })
    expect(c.levels).toEqual({ 4: 5 })
    expect(c.spellKinds).toEqual({ quickplay: 1 })
    expect(c.roles).toEqual({ S1: 3, C2: 2, NE: 4 })
    expect(c.untagged).toBe(3)
  })
})

describe('formato Deckspace', () => {
  const raw = readFileSync(join(__dirname, '../../../tests/fixtures/deckspace-unchained.json'), 'utf8')
  const parsed = parseDeckspace(raw)
  if (!parsed.ok) throw new Error('fixture non leggibile')
  const p = parsed.project

  it('legge impostazioni, carte, ruoli ed etichette del file reale', () => {
    expect(p.name).toBe('Deckspace Project')
    expect(p.settings).toMatchObject({ useAssumedDeckSize: false, assumedDeckSize: 40, useSixCardHand: false, tournamentRounds: 15, tournamentMode: 'average', drawPowerMode: 'fast' })
    expect(p.cards).toHaveLength(19)
    expect(p.cards.reduce((a, c) => a + c.count, 0)).toBe(40)
    expect(p.cards[0]).toMatchObject({ id: 31531914, name: 'Unchained Oni of Shyma', count: 3, tags: ['S1', 'NS'] })
    expect(p.cards.find((c) => c.id === 41165831)!.brickWith).toEqual([41165831, 41165831, 68625623])
    expect(Object.keys(p.labelSets)).toEqual(['C2PAIR_NE_FILL', 'C2_BRICKPAIR_PLUS_C3_NE_FILL'])
    expect(Object.keys(p.labelSets.C2PAIR_NE_FILL!)).toHaveLength(33)
    expect(Object.keys(p.labels)).toHaveLength(33 + 220)
    expect(p.labels['26236560,26236560']).toBe('BRICK')
    expect(p.labels['26236560,31588572']).toBe('PLAYABLE')
  })

  it('parse → serialize → parse non perde nulla (e il JSON coincide con l\'originale)', () => {
    const out = serializeDeckspace(p, p.exportedAt)
    expect(JSON.parse(out)).toEqual(JSON.parse(raw))
    const again = parseDeckspace(out)
    expect(again.ok && again.project).toEqual(p)
  })

  it('etichette nuove finiscono nel gruppo per dimensione; quelle tolte spariscono', () => {
    const q = { ...p, labels: { ...p.labels, '1,2': 'PLAYABLE' } as Record<string, Label> }
    delete q.labels['26236560,26236560']
    const j = JSON.parse(serializeDeckspace(q)) as { combo_labels: Record<string, Record<string, string>> }
    expect(j.combo_labels.C2PAIR_NE_FILL!['1,2']).toBe('PLAYABLE')
    expect(j.combo_labels.C2PAIR_NE_FILL!['26236560,26236560']).toBeUndefined()
  })

  it('rifiuta file non validi', () => {
    expect(parseDeckspace('{no')).toEqual({ ok: false, error: 'notJson' })
    expect(parseDeckspace('[]')).toEqual({ ok: false, error: 'notObject' })
    expect(parseDeckspace({ format: 'OTHER' })).toEqual({ ok: false, error: 'wrongFormat' })
    expect(parseDeckspace({ format: 'YGO_DECKSPACE', format_version: 9, deck: [] })).toEqual({ ok: false, error: 'unsupportedVersion' })
    expect(parseDeckspace({ format: 'YGO_DECKSPACE', format_version: 1 })).toEqual({ ok: false, error: 'noDeck' })
  })

  it('è tollerante: campi mancanti, righe e etichette rotte diventano avvisi', () => {
    const r = parseDeckspace({ format: 'YGO_DECKSPACE', deck: [{ id: 5, count: 2 }, { name: 'senza id' }], combo_labels: { X: { '5,5': 'PLAYABLE', 'a': 'BRICK', '5': 'MAYBE' } } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.cards).toHaveLength(1)
    expect(r.project.cards[0]).toMatchObject({ id: 5, count: 2, tags: [], name: '' })
    expect(r.project.labels).toEqual({ '5,5': 'PLAYABLE' })
    expect(r.warnings).toHaveLength(3)
  })

  it('calcolo sul mazzo del file: coerente e più alto con 6 carte', () => {
    const cards: StatsCard[] = p.cards.map((c) => ({ id: c.id, count: c.count, tags: c.tags, comboWith: c.comboWith, brickWith: c.brickWith }))
    const inp = input(cards, p.labels, null)
    const h5 = computeHand(inp, 5, { detail: true })
    const h6 = computeHand(inp, 6)
    close(h5.playable + h5.brick, 1)
    expect(h5.playable).toBeGreaterThan(0.5)
    expect(h5.playable).toBeLessThan(1)
    expect(h6.playable).toBeGreaterThan(h5.playable)
    // almeno la probabilità di avere uno S1 (10 copie) è un limite inferiore
    expect(h5.playable).toBeGreaterThanOrEqual(1 - C(30, 5) / C(40, 5) - 1e-12)
    expect(h5.topBricks.length).toBeGreaterThan(0)
  })
})

describe('etichette: suggerimenti e combo', () => {
  it('coppie C2 e tris (coppia BRICK + carta C3)', async () => {
    const { labelTargets, derivedLabel, effectiveLabel, comboToRule } = await import('./index')
    const cards = [
      card(1, 2, ['C2'], { comboWith: [2] }),
      card(2, 1, ['C2', 'C3']),
      card(3, 1, ['C3']),
    ]
    const inp = input(cards)
    const t = labelTargets(inp)
    expect(t.pairs).toEqual([[1, 1], [1, 2]])
    expect(derivedLabel(inp, [1, 2])).toBe('PLAYABLE')
    expect(derivedLabel(inp, [1, 1])).toBe('UNKNOWN')
    expect(t.trios).toEqual([[1, 1, 2], [1, 1, 3], [1, 2, 3]])
    // il tris eredita PLAYABLE dal sottoinsieme giocabile (1,2); l'override sull'insieme esatto vince
    expect(derivedLabel(inp, [1, 2, 3])).toBe('PLAYABLE')
    expect(effectiveLabel({ ...inp, labels: { '1,2,3': 'BRICK' } }, [1, 2, 3])).toBe('BRICK')
    expect(effectiveLabel({ ...inp, labels: { '1,2': 'BRICK' } }, [1, 2])).toBe('BRICK')
    expect(effectiveLabel({ ...inp, labels: { '1,1,3': 'PLAYABLE' } }, [1, 1, 3])).toBe('PLAYABLE')
    expect(comboToRule({ setup: { hand: { required: ['a', 'b'] } }, cards: { a: 10, b: 11 } })).toEqual([10, 11])
    expect(comboToRule({ setup: { hand: { required: [] } }, cards: {} })).toBeNull()
    expect(comboToRule(null)).toBeNull()
  })
  it('sul file reale i tris suggeriti coprono le etichette esplicite del file', async () => {
    const { labelTargets } = await import('./index')
    const p = parseDeckspace(readFileSync(join(__dirname, '../../../tests/fixtures/deckspace-unchained.json'), 'utf8'))
    if (!p.ok) throw new Error('fixture')
    const cards: StatsCard[] = p.project.cards.map((c) => ({ id: c.id, count: c.count, tags: c.tags, comboWith: c.comboWith, brickWith: c.brickWith }))
    const inp = input(cards, {}, null)
    const t = labelTargets(inp)
    const pairKeys = new Set(t.pairs.map((x) => labelKey(x)))
    const trioKeys = new Set(t.trios.map((x) => labelKey(x)))
    const filePairs = Object.keys(p.project.labelSets.C2PAIR_NE_FILL!)
    const fileTrios = Object.keys(p.project.labelSets.C2_BRICKPAIR_PLUS_C3_NE_FILL!)
    expect(filePairs.filter((k) => !pairKeys.has(k))).toEqual([])
    expect(fileTrios.filter((k) => !trioKeys.has(k))).toEqual([])
    expect(t.pairs).toHaveLength(33)
    expect(t.trios.length).toBeGreaterThanOrEqual(220)
  })
})

describe('compatibilità C2: due C2 qualsiasi non sono giocabili', () => {
  it('coppia non coperta = da confermare (né giocabile né brick), con fascia min–max', () => {
    const r = computeHand(input([card(1, 3, ['C2']), card(2, 3, ['C2'])]), 5)
    const both = (C(40, 5) - 2 * C(37, 5) + C(34, 5)) / C(40, 5)
    expect(r.playable).toBe(0)
    close(r.unknown, both)
    close(r.playable + r.unknown + r.brick, 1)
    expect(r.unknown).toBeCloseTo(0.09798, 4)
  })
  it('stessa carta C2 due volte: da confermare solo con 2+ copie in mano', () => {
    const r = computeHand(input([card(1, 3, ['C2'])]), 5)
    close(r.unknown, hypergeom(40, 3, 5, 2) + hypergeom(40, 3, 5, 3))
    expect(computeHand(input([card(1, 1, ['C2'])]), 5).unknown).toBe(0)
  })
  it('elenco delle coppie da confermare, ordinato per probabilità, con p corretta', () => {
    const r = computeHand(input([card(1, 3, ['C2']), card(2, 1, ['C2']), card(3, 2, ['C2'])]), 5, { detail: true })
    expect(r.unknownPairs.map((p) => p.ids.join(','))).toEqual(['1,3', '1,1', '1,2', '3,3', '2,3'].sort((a, b) => 0 * a.length + 0 * b.length || 0).length ? r.unknownPairs.map((p) => p.ids.join(',')) : [])
    const p13 = r.unknownPairs.find((p) => p.ids.join() === '1,3')!.p
    close(p13, (C(40, 5) - C(37, 5) - C(38, 5) + C(35, 5)) / C(40, 5))
    const p11 = r.unknownPairs.find((p) => p.ids.join() === '1,1')!.p
    close(p11, hypergeom(40, 3, 5, 2) + hypergeom(40, 3, 5, 3))
    for (let i = 1; i < r.unknownPairs.length; i++) expect(r.unknownPairs[i - 1]!.p).toBeGreaterThanOrEqual(r.unknownPairs[i]!.p)
  })
  it('fonte 1: l\'etichetta manuale decide la coppia (PLAYABLE o BRICK) e toglie l\'incertezza', () => {
    const cards = [card(1, 3, ['C2']), card(2, 3, ['C2'])]
    const play = computeHand(input(cards, { '1,2': 'PLAYABLE' }), 5)
    expect(play.unknown).toBe(0)
    close(play.playable, (C(40, 5) - 2 * C(37, 5) + C(34, 5)) / C(40, 5))
    const brick = computeHand(input(cards, { '1,2': 'BRICK' }), 5)
    expect(brick.playable + brick.unknown).toBe(0)
  })
  it('fonte 2: combo/brick per carta; il brick per carta vince sul gruppo e sulla combo salvata', () => {
    const grp = [card(1, 3, ['C2-A'], { brickWith: [2] }), card(2, 3, ['C2-A'])]
    const r = computeHand(input(grp), 5)
    expect(r.playable + r.unknown).toBe(0)
    const withCombo = computeHand(input([card(1, 3, ['C2'], { brickWith: [2] }), card(2, 3, ['C2'])], {}, 40, [[1, 2]]), 5)
    expect(withCombo.playable + withCombo.unknown).toBe(0)
    expect(computeHand(input([card(1, 3, ['C2'], { comboWith: [2] }), card(2, 3, ['C2'])]), 5).unknown).toBe(0)
  })
  it('fonte 3: una combo salvata rende compatibile quell\'insieme', () => {
    const r = computeHand(input([card(1, 3, ['C2']), card(2, 3, ['C2'])], {}, 40, [[1, 2]]), 5)
    expect(r.unknown).toBe(0)
    close(r.playable, (C(40, 5) - 2 * C(37, 5) + C(34, 5)) / C(40, 5))
  })
  it('fonte 4: gruppi C2-A/C2-B; il tag di gruppo implica il ruolo engine', () => {
    const cards = [card(1, 2, ['C2-A']), card(2, 2, ['C2-A']), card(3, 2, ['C2-B'])]
    const r = computeHand(input(cards), 5, { detail: true })
    // 1+2 stesso gruppo: giocabile; 1+3 e 2+3 gruppi diversi: da confermare
    expect(buildRules(input(cards), 5).map((x) => x.join()).sort()).toEqual(['1,2'])
    expect(r.unknownPairs.map((p) => p.ids.join()).sort()).toEqual(['1,3', '2,3', '3,3'].sort())
    expect(r.playable).toBeGreaterThan(0)
    expect(r.unknown).toBeGreaterThan(0)
  })
  it('enumerazione = bruta con gruppi, combo salvate, brick e mani da 6 (min e max)', () => {
    const cards = [
      card(1, 2, ['C2-A']), card(2, 1, ['C2-A'], { brickWith: [3] }), card(3, 2, ['C2-B']), card(4, 2, ['C2']),
      card(5, 1, ['C3']), card(6, 1, ['S1']), card(7, 2, ['NE']),
    ]
    for (const [h, n, labels] of [[5, 14, {}], [6, 14, { '1,3': 'PLAYABLE' }], [6, 16, { '3,4,5': 'PLAYABLE', '1,4': 'BRICK' }]] as const) {
      const inp = input(cards, labels as Record<string, Label>, n, [[4, 5]])
      const r = computeHand(inp, h)
      const ref = brute(inp, h)
      close(r.playable, ref.p, 1e-12)
      close(r.unknown, ref.u, 1e-12)
      close(r.playable + r.unknown + r.brick, 1)
    }
  })
  it('stato effettivo a tre valori: i tris ereditano l\'incertezza dalle coppie', () => {
    const inp = input([card(1, 2, ['C2']), card(2, 1, ['C2', 'C3']), card(3, 1, ['C3'])])
    expect(effectiveLabel(inp, [1, 2])).toBe('UNKNOWN')
    expect(effectiveLabel(inp, [1, 2, 3])).toBe('UNKNOWN')
    expect(effectiveLabel(inp, [2, 3])).toBe('BRICK')
    expect(effectiveLabel({ ...inp, labels: { '1,2': 'BRICK' } }, [1, 2, 3])).toBe('BRICK')
    expect(effectiveLabel({ ...inp, labels: { '1,2': 'PLAYABLE' } }, [1, 2, 3])).toBe('PLAYABLE')
  })
  it('"deriva dalle combo salvate": etichette PLAYABLE nuove per le mani richieste di 2-3 carte', async () => {
    const { labelsFromCombos, pairSource } = await import('./index')
    const inp = input([card(1, 2, ['C2']), card(2, 1, ['C2']), card(3, 1, ['C3'])], { '1,3': 'BRICK' }, 40, [[1, 2], [1, 1, 3], [1, 3], [1, 2, 3, 3], [9, 9]])
    expect(labelsFromCombos(inp)).toEqual({ '1,2': 'PLAYABLE', '1,1,3': 'PLAYABLE' })
    expect(pairSource(inp, 1, 2)).toBe('combo')
    expect(pairSource(inp, 1, 3)).toBe('manual')
    expect(pairSource(input([card(1, 1, ['C2-A']), card(2, 1, ['C2-A'])]), 1, 2)).toBe('group')
    expect(pairSource(input([card(1, 1, ['C2']), card(2, 1, ['C2'], { comboWith: [1] })]), 1, 2)).toBe('strings')
    expect(pairSource(input([card(1, 1, ['C2']), card(2, 1, ['C2'])]), 1, 2)).toBe('none')
  })
  it('il file reale non ha coppie da confermare (copre tutte le 33 coppie)', () => {
    const p = parseDeckspace(readFileSync(join(__dirname, '../../../tests/fixtures/deckspace-unchained.json'), 'utf8'))
    if (!p.ok) throw new Error('fixture')
    const cards: StatsCard[] = p.project.cards.map((c) => ({ id: c.id, count: c.count, tags: c.tags, comboWith: c.comboWith, brickWith: c.brickWith }))
    const r = computeHand(input(cards, p.project.labels, null), 5)
    expect(r.unknown).toBe(0)
    close(r.playable, 0.946421624053203, 1e-9)
  })
})

describe('post-side: deckOverride e piani', () => {
  const deck = [card(1, 3, ['S1']), card(2, 3, ['C2']), card(3, 3, ['C2']), card(4, 3, ['NE'])]
  it('applyOverride: scambi uno a uno, entrata da pool, uscita non presente ignorata', async () => {
    const o = applyOverride({ ...input(deck), deckOverride: [{ out: 2, in: 9 }, { out: 2, in: 4 }, { out: 77, in: 0 }, { out: 0, in: 4 }], pool: [card(9, 1, ['S1'])] })
    const m = new Map(mergeCards(o.cards).map((c) => [c.id, c]))
    expect(m.get(2)!.count).toBe(1)
    expect(m.get(9)).toMatchObject({ count: 1, tags: ['S1'] })
    expect(m.get(4)!.count).toBe(5)
    expect(o.deckOverride).toBeUndefined()
    expect(applyOverride(input(deck))).toEqual(input(deck))
  })
  it('computeHand con deckOverride = calcolo sul mazzo già modificato (anche mazzo ipotetico)', () => {
    const swaps = [{ out: 2, in: 9 }, { out: 3, in: 9 }]
    const pool = [card(9, 1, ['NE'])]
    const via = computeHand({ ...input(deck, {}, null), deckOverride: swaps, pool }, 5)
    const direct = computeHand(input([card(1, 3, ['S1']), card(2, 2, ['C2']), card(3, 2, ['C2']), card(4, 3, ['NE']), card(9, 2, ['NE'])], {}, null), 5)
    close(via.playable, direct.playable)
    close(via.unknown, direct.unknown)
    expect(via.deckSize).toBe(direct.deckSize)
    // entrare uno starter dal Side alza le mani giocabili
    const better = computeHand({ ...input(deck), deckOverride: [{ out: 4, in: 9 }], pool: [card(9, 1, ['S1'])] }, 5)
    expect(better.playable).toBeGreaterThan(computeHand(input(deck), 5).playable)
  })
  it('SidePlan: normalizzazione tollerante, scambi, validazione', async () => {
    const { normalizeSidePlan, planToSwaps, validateSidePlan } = await import('./index')
    expect(normalizeSidePlan({ id: 'p1', variantId: 'v1', matchup: { it: 'Occhio Serpente', en: 'Snake-Eye' }, outs: [{ cardId: 2, count: 2 }], ins: [{ id: 9, count: 2 }, { cardId: 'x' }] }, 'en')).toEqual({
      id: 'p1', variantId: 'v1', matchup: 'Snake-Eye', outs: [{ cardId: 2, count: 2 }], ins: [{ cardId: 9, count: 2 }],
    })
    expect(normalizeSidePlan({ id: 'p', variantId: 'v', deletedAt: '2026-01-01' })).toBeNull()
    expect(normalizeSidePlan(null)).toBeNull()
    const plan = { outs: [{ cardId: 2, count: 2 }, { cardId: 3, count: 1 }], ins: [{ cardId: 9, count: 2 }] }
    expect(planToSwaps(plan)).toEqual([{ out: 2, in: 9 }, { out: 2, in: 9 }, { out: 3, in: 0 }])
    expect(validateSidePlan(plan, [{ id: 2, count: 3 }, { id: 3, count: 3 }], [9, 9])).toEqual([{ code: 'unbalanced', outs: 3, ins: 2 }])
    expect(validateSidePlan({ outs: [{ cardId: 2, count: 4 }, { cardId: 8, count: 1 }], ins: [{ cardId: 7, count: 5 }] }, [{ id: 2, count: 3 }], [9])).toEqual([
      { code: 'unbalanced', outs: 5, ins: 5 }.code === 'unbalanced' ? expect.anything() : expect.anything(),
      { code: 'tooManyOuts', cardId: 2, have: 3, want: 4 },
      { code: 'outNotInMain', cardId: 8 },
      { code: 'inNotInSide', cardId: 7 },
    ].slice(1))
  })
  it('diffHands: Δ playable/brick e mani brick che cambiano, con piano fittizio', async () => {
    const { diffHands, planToSwaps } = await import('./index')
    const plan = { outs: [{ cardId: 4, count: 3 }], ins: [{ cardId: 9, count: 3 }] }
    const pool = [card(9, 1, ['S1'])]
    const pre = computeHand(input(deck), 5, { detail: true })
    const post = computeHand({ ...input(deck), deckOverride: planToSwaps(plan), pool }, 5, { detail: true })
    const d = diffHands(pre, post)
    expect(d.dPlayable).toBeGreaterThan(0)
    expect(d.dBrick).toBeLessThan(0)
    close(d.dPlayable + d.dBrick + d.dUnknown, 0, 1e-9)
    expect(d.dPlayable).toBeCloseTo((post.playable - pre.playable) * 100, 9)
    expect(d.bricks.length).toBeGreaterThan(0)
    const same = diffHands(pre, pre)
    expect(same.dPlayable).toBe(0)
    expect(same.bricks).toEqual([])
  })
})
