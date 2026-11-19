/**
 * Probabilità esatta della mano iniziale.
 *
 * Il mazzo è raggruppato per tipo di carta (stesso passcode): le carte "engine" (ruolo S1/C2/C3/GARNET o citate da un'etichetta/regola)
 * restano distinte, tutto il resto (non-engine, senza ruolo, carte vuote del mazzo ipotetico) è un unico gruppo di riempimento.
 * Si enumerano le composizioni (k_1..k_m) con somma ≤ mano; la probabilità di ognuna è ΠC(c_i,k_i)·C(F, h−Σk) / C(N,h)
 * (ipergeometrica multivariata). Una mano è PLAYABLE se contiene almeno un insieme PLAYABLE (vedi `buildRules`).
 */
import { comb, atLeastOne } from './math'
import { ENGINE_ROLES, type HandExample, type HandInput, type HandResult, type Label, type LabelState, type StatsCard } from './types'

export const labelKey = (ids: readonly number[]): string => [...ids].sort((a, b) => a - b).join(',')
export const parseLabelKey = (key: string): number[] => key.split(',').map(Number).filter((n) => Number.isFinite(n))

/** Unisce le righe con lo stesso passcode (somma copie, unione tag/partner) e scarta quelle senza copie. */
export function mergeCards(cards: readonly StatsCard[]): StatsCard[] {
  const byId = new Map<number, StatsCard>()
  for (const c of cards) {
    if (c.count <= 0) continue
    const cur = byId.get(c.id)
    if (!cur) {
      byId.set(c.id, { id: c.id, count: c.count, tags: [...new Set(c.tags)], comboWith: [...(c.comboWith ?? [])], brickWith: [...(c.brickWith ?? [])] })
    } else {
      cur.count += c.count
      cur.tags = [...new Set([...cur.tags, ...c.tags])]
      cur.comboWith = [...new Set([...(cur.comboWith ?? []), ...(c.comboWith ?? [])])]
      cur.brickWith = [...new Set([...(cur.brickWith ?? []), ...(c.brickWith ?? [])])]
    }
  }
  return [...byId.values()]
}

export function deckSize(input: Pick<HandInput, 'cards' | 'assumedDeckSize'>): { total: number; size: number; blanks: number } {
  const total = input.cards.reduce((a, c) => a + Math.max(0, c.count), 0)
  const size = input.assumedDeckSize && input.assumedDeckSize > total ? Math.floor(input.assumedDeckSize) : total
  return { total, size, blanks: size - total }
}

/** Tag di gruppo di compatibilità (C2-A, C2-B, …): carte dello stesso gruppo fanno combo tra loro. Implicano il ruolo C2. */
export const isGroupTag = (t: string): boolean => /^C2-.+/.test(t)
export const groupsOf = (c: StatsCard): string[] => c.tags.filter(isGroupTag)
export const isC2 = (c: StatsCard): boolean => c.tags.includes('C2') || c.tags.some(isGroupTag)
const isEngineTag = (c: StatsCard) => c.tags.some((t) => ENGINE_ROLES.includes(t) || isGroupTag(t))

/** Applica `deckOverride` (scambi di un piano di side): il Main diventa il mazzo dopo i cambi. Senza scambi restituisce l'input stesso. */
export function applyOverride(input: HandInput): HandInput {
  const swaps = input.deckOverride
  if (!swaps?.length) return input
  const map = new Map(mergeCards(input.cards).map((c) => [c.id, c]))
  for (const sw of swaps) {
    if (sw.out) {
      const c = map.get(sw.out)
      if (c && c.count > 0) c.count -= 1
    }
    if (sw.in) {
      const have = map.get(sw.in)
      if (have) have.count += 1
      else {
        const prof = input.pool?.find((c) => c.id === sw.in)
        map.set(sw.in, { id: sw.in, count: 1, tags: [...(prof?.tags ?? [])], comboWith: [...(prof?.comboWith ?? [])], brickWith: [...(prof?.brickWith ?? [])] })
      }
    }
  }
  return { ...input, cards: [...map.values()].filter((c) => c.count > 0), deckOverride: undefined }
}

/** Multiinsieme di passcode → conteggi per id. */
function multiset(ids: readonly number[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1)
  return m
}

const isSubMultiset = (small: Map<number, number>, big: Map<number, number>) => {
  for (const [id, n] of small) if ((big.get(id) ?? 0) < n) return false
  return true
}

/**
 * Regole PLAYABLE (insiemi di passcode), con le fonti in ordine di priorità:
 *  1. etichette manuali (applicate per ultime: PLAYABLE aggiunge, BRICK toglie quell'esatto insieme);
 *  2. per carta (Deckspace): coppia compatibile se i partner sono in `comboWith` (di una o dell'altra) e non in `brickWith`;
 *  3. combo salvate: le carte necessarie (`extraRules`) rendono compatibile quell'insieme;
 *  4. gruppi di compatibilità: carte con lo stesso tag C2-X fanno combo tra loro (salvo `brickWith`);
 *  la carta S1 è giocabile da sola. Due C2 qualsiasi NON sono compatibili per default: vedi `collectUnknownPairs`.
 */
export function collectRules(input: HandInput, handSize: number, applyLabels = true): Map<string, number[]> {
  const cards = mergeCards(input.cards)
  const count = new Map(cards.map((c) => [c.id, c.count]))
  const rules = new Map<string, number[]>()
  const feasible = (ids: number[]) => {
    if (ids.length === 0 || ids.length > handSize) return false
    for (const [id, n] of multiset(ids)) if ((count.get(id) ?? 0) < n) return false
    return true
  }
  const add = (ids: number[]) => {
    const s = [...ids].sort((a, b) => a - b)
    if (feasible(s)) rules.set(s.join(','), s)
  }
  const engine = cards.filter(isEngineTag)
  for (const c of engine) if (c.tags.includes('S1')) add([c.id])
  for (let i = 0; i < engine.length; i++) {
    for (let j = i; j < engine.length; j++) {
      const a = engine[i]!
      const b = engine[j]!
      const combo = (a.comboWith ?? []).includes(b.id) || (b.comboWith ?? []).includes(a.id)
      const brick = (a.brickWith ?? []).includes(b.id) || (b.brickWith ?? []).includes(a.id)
      // priorità delle fonti: combo/brick per carta (Deckspace) > gruppo di compatibilità; le combo salvate e le etichette si aggiungono dopo
      const group = groupsOf(a).some((g) => groupsOf(b).includes(g))
      if ((combo || group) && !brick) add(i === j ? [a.id, a.id] : [a.id, b.id])
    }
  }
  const brickPair = (x: number, y: number) => {
    const a = cards.find((c) => c.id === x)
    const b = cards.find((c) => c.id === y)
    return (a?.brickWith ?? []).includes(y) || (b?.brickWith ?? []).includes(x)
  }
  // una combo salvata (fonte 3) non scavalca il brick per carta (fonte 2) su una coppia
  for (const r of input.extraRules ?? []) if (!(r.length === 2 && brickPair(r[0]!, r[1]!))) add(r)
  if (applyLabels) {
    for (const [key, label] of Object.entries(input.labels)) {
      const ids = parseLabelKey(key)
      if (!ids.length) continue
      if (label === 'PLAYABLE') add(ids)
      else rules.delete(labelKey(ids))
    }
  }
  return rules
}

/**
 * Coppie C2 che nessuna fonte copre: né giocabili (partner, gruppo, combo salvata) né brick (`brickWith`).
 * Con `applyLabels` si escludono anche quelle già decise da un'etichetta manuale.
 */
export function collectUnknownPairs(input: HandInput, handSize: number, applyLabels = true): Map<string, number[]> {
  const cards = mergeCards(input.cards).filter(isC2)
  const derived = collectRules({ ...input, labels: {} }, handSize, false)
  const out = new Map<string, number[]>()
  if (handSize < 2) return out
  for (let i = 0; i < cards.length; i++) {
    for (let j = i; j < cards.length; j++) {
      const a = cards[i]!
      const b = cards[j]!
      if (i === j && a.count < 2) continue
      const key = labelKey([a.id, b.id])
      if (derived.has(key)) continue
      if ((a.brickWith ?? []).includes(b.id) || (b.brickWith ?? []).includes(a.id)) continue
      if (applyLabels && input.labels[key]) continue
      out.set(key, [a.id, b.id].sort((x, y) => x - y))
    }
  }
  return out
}

export function buildRules(input: HandInput, handSize: number): number[][] {
  // riduzione: toglie i superinsiemi di una regola già presente (non cambiano nulla)
  const all = [...collectRules(input, handSize).values()].sort((a, b) => a.length - b.length)
  const kept: { ids: number[]; ms: Map<number, number> }[] = []
  for (const ids of all) {
    const ms = multiset(ids)
    if (!kept.some((k) => k.ids.length < ids.length && isSubMultiset(k.ms, ms))) kept.push({ ids, ms })
  }
  return kept.map((k) => k.ids)
}

/**
 * Stato effettivo di un insieme di 1-3 carte engine (la mano contiene esattamente quelle carte engine, il resto è riempimento):
 * l'etichetta esplicita sull'insieme esatto vince; altrimenti PLAYABLE se lo dice una regola derivata o un suo sottoinsieme proprio;
 * altrimenti UNKNOWN (da confermare) se lo è la coppia stessa o un suo sottoinsieme; altrimenti BRICK.
 * Senza `unknown` nessun insieme è "da confermare" (comportamento a due stati).
 */
export function effectiveLabelFrom(
  derived: Map<string, number[]>,
  labels: Record<string, Label>,
  ids: readonly number[],
  unknown?: Map<string, number[]>,
): LabelState {
  const sorted = [...ids].sort((a, b) => a - b)
  const key = sorted.join(',')
  const explicit = labels[key]
  if (explicit) return explicit
  if (derived.has(key)) return 'PLAYABLE'
  let maybe = unknown?.has(key) ?? false
  if (sorted.length > 1) {
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] === sorted[i - 1]) continue
      const sub = sorted.filter((_, j) => j !== i)
      const st = effectiveLabelFrom(derived, labels, sub, unknown)
      if (st === 'PLAYABLE') return 'PLAYABLE'
      if (st === 'UNKNOWN') maybe = true
    }
  }
  return maybe ? 'UNKNOWN' : 'BRICK'
}

/** Passcode che devono restare distinti (engine): ruoli engine + carte citate da etichette/regole. */
export function engineIds(cards: StatsCard[], labels: Record<string, Label>, extraRules: number[][] | undefined): number[] {
  const inDeck = new Set(cards.map((c) => c.id))
  const ids = new Set<number>(cards.filter(isEngineTag).map((c) => c.id))
  for (const key of Object.keys(labels)) for (const id of parseLabelKey(key)) if (inDeck.has(id)) ids.add(id)
  for (const r of extraRules ?? []) for (const id of r) if (inDeck.has(id)) ids.add(id)
  return cards.filter((c) => ids.has(c.id)).map((c) => c.id)
}

const TOP = 8

export interface EnumOptions {
  /** Raccoglie anche istogramma engine e mani brick più probabili (più lento). */
  detail?: boolean
}

/** P(la mano contiene la coppia): almeno una copia di ciascuna (due copie se è la stessa carta). */
function pairOdds(size: number, h: number, ca: number, cb: number, same: boolean): number {
  const total = comb(size, h)
  if (same) return 1 - (comb(size - ca, h) + ca * comb(size - ca, h - 1)) / total
  return 1 - (comb(size - ca, h) + comb(size - cb, h) - comb(size - ca - cb, h)) / total
}

type Anchored = { idx: number[]; need: number[] }[][]

/** Cuore del calcolo: probabilità PLAYABLE / da confermare / BRICK per una mano di `handSize` carte. `deckOverride` si applica prima. */
export function computeHand(rawInput: HandInput, handSize: number, opts: EnumOptions = {}): HandResult {
  const input = applyOverride(rawInput)
  const cards = mergeCards(input.cards)
  const { size, blanks } = deckSize({ cards, assumedDeckSize: input.assumedDeckSize })
  const empty: HandResult = {
    handSize, deckSize: size, blanks, playable: 0, brick: 0, unknown: 0, unknownPairs: [], engineHist: new Array(handSize + 1).fill(0),
    topBricks: [], cardOdds: [], roleOdds: [], ruleCount: 0,
  }
  if (size < handSize || handSize <= 0) return empty

  const ids = engineIds(cards, input.labels, input.extraRules)
  const idx = new Map(ids.map((id, i) => [id, i]))
  const counts = ids.map((id) => cards.find((c) => c.id === id)!.count)
  const engineTotal = counts.reduce((a, b) => a + b, 0)
  const F = size - engineTotal
  const m = ids.length

  // regole → indice per anchor (il tipo con indice minore); `P` = giocabili, `O` = giocabili + coppie da confermare (caso ottimistico)
  const rules = buildRules(input, handSize)
  const unknownLabelled = collectUnknownPairs(input, handSize, true)
  const anchor = (list: number[][]): Anchored => {
    const out: Anchored = Array.from({ length: m }, () => [])
    for (const r of list) {
      const ms = multiset(r)
      const pairs = [...ms.entries()].map(([id, n]) => [idx.get(id), n] as const).filter((p): p is readonly [number, number] => p[0] !== undefined)
      if (pairs.length !== ms.size) continue // cita carte non engine: non può accadere (engineIds le include), difensivo
      pairs.sort((x, y) => x[0] - y[0])
      out[pairs[0]![0]]!.push({ idx: pairs.map((q) => q[0]), need: pairs.map((q) => q[1]) })
    }
    return out
  }
  const byAnchorP = anchor(rules)
  const hasUnknown = unknownLabelled.size > 0
  const byAnchorO = hasUnknown ? anchor([...rules, ...unknownLabelled.values()]) : byAnchorP

  // mani con al più 3 carte engine: stato effettivo dell'insieme esatto (codice numerico → 0 brick, 1 da confermare, 2 giocabile)
  const base = m + 1
  const derived = collectRules({ ...input, labels: {} }, handSize, false)
  const unknownAll = collectUnknownPairs(input, handSize, false)
  const small = new Map<number, number>()
  const addSmall = (is: number[]) => {
    const ms = new Map<number, number>()
    for (const i of is) ms.set(i, (ms.get(i) ?? 0) + 1)
    for (const [i, n] of ms) if (n > counts[i]!) return
    if (is.length > handSize) return
    const code = is.reduce((acc, i) => acc * base + i + 1, 0)
    const st = effectiveLabelFrom(derived, input.labels, is.map((i) => ids[i]!), unknownAll)
    small.set(code, st === 'PLAYABLE' ? 2 : st === 'UNKNOWN' ? 1 : 0)
  }
  for (let a = 0; a < m; a++) {
    addSmall([a])
    for (let b = a; b < m; b++) {
      addSmall([a, b])
      for (let c = b; c < m; c++) addSmall([a, b, c])
    }
  }

  const k = new Int8Array(m)
  const hist = new Array<number>(handSize + 1).fill(0)
  let playableW = 0
  let unknownW = 0
  let brickW = 0
  const tops: { w: number; k: number[]; fill: number }[] = []
  let topFloor = 0

  // tabella dei binomiali C(n, r), n ≤ dimensione del mazzo, r ≤ mano: evita ricalcoli nelle foglie
  const R = handSize + 1
  const ctab = new Float64Array((size + 1) * R)
  for (let n = 0; n <= size; n++) for (let r = 0; r <= handSize; r++) ctab[n * R + r] = comb(n, r)
  const cb = (n: number, r: number) => (r < 0 || r > handSize || n < 0 || n > size ? 0 : ctab[n * R + r]!)
  // carte ancora libere a partire dal tipo i (compreso il riempimento)
  const restFrom = new Array<number>(m + 1)
  restFrom[m] = F
  for (let i = m - 1; i >= 0; i--) restFrom[i] = restFrom[i + 1]! + counts[i]!

  const pres = new Int16Array(handSize + 1) // tipi presenti nella mano parziale
  let np = 0
  const satisfied = (by: Anchored): boolean => {
    for (let p = 0; p < np; p++) {
      const list = by[pres[p]!]!
      for (let r = 0; r < list.length; r++) {
        const { idx: ri, need } = list[r]!
        let ok = true
        for (let q = 0; q < ri.length; q++) if (k[ri[q]!]! < need[q]!) { ok = false; break }
        if (ok) return true
      }
    }
    return false
  }
  const prune = !opts.detail

  /**
   * Visita il nodo "mano con queste carte engine, il resto riempimento", poi i nodi con una carta engine in più (tipi di indice ≥ start).
   * Con almeno 4 carte engine vale solo "contiene una regola" (monotona): se è giocabile e non servono i dettagli, tutte le estensioni
   * del nodo lo sono e si assegnano in blocco (somma di Vandermonde w·C(carte libere, posti rimasti)).
   * Classe: 2 = giocabile, 1 = giocabile solo se una coppia da confermare è compatibile, 0 = brick.
   */
  const rec = (start: number, used: number, w: number, code: number) => {
    const rem = handSize - used
    const cls = used === 0 ? 0 : used <= 3 ? (small.get(code) ?? 0) : satisfied(byAnchorP) ? 2 : hasUnknown && satisfied(byAnchorO) ? 1 : 0
    if (prune && used >= 4 && cls === 2) {
      playableW += w * cb(restFrom[start]!, rem)
      return
    }
    if (rem <= F) {
      const wt = w * cb(F, rem)
      if (wt > 0) {
        if (cls === 2) playableW += wt
        else if (cls === 1) unknownW += wt
        else {
          brickW += wt
          if (opts.detail && wt > topFloor) {
            tops.push({ w: wt, k: Array.from(k), fill: rem })
            if (tops.length > TOP * 4) {
              tops.sort((x, y) => y.w - x.w)
              tops.length = TOP
              topFloor = tops[TOP - 1]!.w
            }
          }
        }
        if (opts.detail) hist[used] = hist[used]! + wt
      }
    }
    if (rem === 0) return
    for (let i = start; i < m; i++) {
      const maxx = Math.min(counts[i]!, rem)
      pres[np++] = i
      let cc = code
      for (let x = 1; x <= maxx; x++) {
        k[i] = x
        if (used + x <= 3) cc = cc * base + i + 1
        rec(i + 1, used + x, w * cb(counts[i]!, x), cc)
      }
      np--
      k[i] = 0
    }
  }
  rec(0, 0, 1, 0)

  const denom = comb(size, handSize)
  const res: HandResult = { ...empty, playable: playableW / denom, unknown: unknownW / denom, brick: brickW / denom, ruleCount: rules.length }
  if (!opts.detail) return res

  res.engineHist = hist.map((x) => x / denom)
  tops.sort((x, y) => y.w - x.w)
  res.topBricks = tops.slice(0, TOP).map<HandExample>((t) => ({
    cards: t.k.map((n, i) => ({ id: ids[i]!, n })).filter((c) => c.n > 0),
    fill: t.fill,
    p: t.w / denom,
  }))
  res.cardOdds = cards.map((c) => ({ id: c.id, count: c.count, p: atLeastOne(size, c.count, handSize) }))
  const roles = new Map<string, number>()
  for (const c of cards) for (const t of c.tags) roles.set(t, (roles.get(t) ?? 0) + c.count)
  res.roleOdds = [...roles.entries()].map(([role, copies]) => ({ role, copies, p: atLeastOne(size, copies, handSize) }))
  const cnt = new Map(cards.map((c) => [c.id, c.count]))
  res.unknownPairs = [...unknownLabelled.values()]
    .map((pair) => ({ ids: pair, p: pairOdds(size, handSize, cnt.get(pair[0]!)!, cnt.get(pair[1]!)!, pair[0] === pair[1]) }))
    .sort((x, y) => y.p - x.p)
  return res
}
