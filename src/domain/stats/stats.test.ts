import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyze, atLeastOne, buildRules, comb, composition, computeHand, hypergeom, labelKey, mergeCards, parseDeckspace, poissonBinomial, roundPlan, sensitivity, serializeDeckspace, tournament } from './index'
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

/** Riferimento indipendente: enumera le mani come sottoinsiemi di carte fisiche. */
function brute(cards: StatsCard[], rules: number[][], total: number, h: number): number {
  const physical: number[] = []
  for (const c of cards) for (let i = 0; i < c.count; i++) physical.push(c.id)
  while (physical.length < total) physical.push(-1)
  let good = 0
  let all = 0
  const pick = (start: number, left: number, chosen: number[]) => {
    if (left === 0) {
      all++
      const ms = new Map<number, number>()
      for (const id of chosen) ms.set(id, (ms.get(id) ?? 0) + 1)
      if (rules.some((r) => { const need = new Map<number, number>(); for (const id of r) need.set(id, (need.get(id) ?? 0) + 1); return [...need].every(([id, n]) => (ms.get(id) ?? 0) >= n) })) good++
      return
    }
    for (let i = start; i <= physical.length - left; i++) pick(i + 1, left - 1, [...chosen, physical[i]!])
  }
  pick(0, h, [])
  return good / all
}

describe('mano iniziale: confronto con enumerazione bruta', () => {
  const cards = [
    card(1, 2, ['S1']),
    card(2, 2, ['C2'], { comboWith: [3, 2] }),
    card(3, 3, ['C2', 'C3'], { brickWith: [4] }),
    card(4, 1, ['C3']),
    card(5, 1, ['NE']),
  ]
  const labels: Record<string, Label> = { [labelKey([3, 3, 4])]: 'PLAYABLE', [labelKey([3, 4])]: 'BRICK', [labelKey([2, 4, 4])]: 'PLAYABLE' }
  for (const [h, n] of [[5, 12], [6, 13], [5, 15]] as const) {
    it(`mano ${h}, mazzo ${n}`, () => {
      const inp = input(cards, labels, n)
      const rules = buildRules(inp, h)
      close(computeHand(inp, h).playable, brute(mergeCards(cards), rules, n, h), 1e-12)
    })
  }
  it('con regole extra (mano richiesta di una combo)', () => {
    const inp = input([card(1, 2, ['C2']), card(2, 1, ['C3']), card(3, 3, [])], {}, 12, [[1, 2, 3]])
    close(computeHand(inp, 5).playable, brute(mergeCards(inp.cards), buildRules(inp, 5), 12, 5))
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
    const q = { ...p, labels: { ...p.labels, '1,2': 'PLAYABLE' as Label } }
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
