/**
 * Probabilità esatta della mano iniziale.
 *
 * Il mazzo è raggruppato per tipo di carta (stesso passcode): le carte "engine" (ruolo S1/C2/C3/GARNET o citate da un'etichetta/regola)
 * restano distinte, tutto il resto (non-engine, senza ruolo, carte vuote del mazzo ipotetico) è un unico gruppo di riempimento.
 * Si enumerano le composizioni (k_1..k_m) con somma ≤ mano; la probabilità di ognuna è ΠC(c_i,k_i)·C(F, h−Σk) / C(N,h)
 * (ipergeometrica multivariata). Una mano è PLAYABLE se contiene almeno un insieme PLAYABLE (vedi `buildRules`).
 */
import { comb, atLeastOne } from './math'
import { ENGINE_ROLES, type HandExample, type HandInput, type HandResult, type Label, type StatsCard } from './types'

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

const isEngineTag = (c: StatsCard) => c.tags.some((t) => ENGINE_ROLES.includes(t))

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
 * Regole PLAYABLE minimali (insiemi di passcode). Derivate dai ruoli:
 *  - singola: carta S1;
 *  - coppia: i partner sono in `comboWith` (di una o dell'altra) e non in `brickWith`;
 *  - extraRules: mani "richieste" delle combo salvate;
 * poi le etichette esplicite vincono: PLAYABLE aggiunge, BRICK toglie quell'esatto insieme.
 * I tris non hanno derivazione: restano BRICK finché l'utente (o la combo) non li dichiara PLAYABLE.
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
      if (combo && !brick) add(i === j ? [a.id, a.id] : [a.id, b.id])
    }
  }
  for (const r of input.extraRules ?? []) add(r)
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
 * Etichetta effettiva di un insieme di 1-3 carte engine (la mano contiene esattamente quelle carte engine, il resto è riempimento):
 * l'etichetta esplicita sull'insieme esatto vince; altrimenti è PLAYABLE se lo dice una regola derivata (S1, partner, combo salvate)
 * o se lo è un suo sottoinsieme proprio; altrimenti BRICK.
 */
export function effectiveLabelFrom(derived: Map<string, number[]>, labels: Record<string, Label>, ids: readonly number[]): Label {
  const sorted = [...ids].sort((a, b) => a - b)
  const key = sorted.join(',')
  const explicit = labels[key]
  if (explicit) return explicit
  if (derived.has(key)) return 'PLAYABLE'
  if (sorted.length > 1) {
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] === sorted[i - 1]) continue
      const sub = sorted.filter((_, j) => j !== i)
      if (effectiveLabelFrom(derived, labels, sub) === 'PLAYABLE') return 'PLAYABLE'
    }
  }
  return 'BRICK'
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

/** Cuore del calcolo: probabilità PLAYABLE/BRICK per una mano di `handSize` carte. */
export function computeHand(input: HandInput, handSize: number, opts: EnumOptions = {}): HandResult {
  const cards = mergeCards(input.cards)
  const { size, blanks } = deckSize({ cards, assumedDeckSize: input.assumedDeckSize })
  const empty: HandResult = {
    handSize, deckSize: size, blanks, playable: 0, brick: 0, engineHist: new Array(handSize + 1).fill(0),
    topBricks: [], cardOdds: [], roleOdds: [], ruleCount: 0,
  }
  if (size < handSize || handSize <= 0) return empty

  const ids = engineIds(cards, input.labels, input.extraRules)
  const idx = new Map(ids.map((id, i) => [id, i]))
  const counts = ids.map((id) => cards.find((c) => c.id === id)!.count)
  const engineTotal = counts.reduce((a, b) => a + b, 0)
  const F = size - engineTotal
  const m = ids.length

  // regole → indice per anchor (il tipo con indice minore)
  const rules = buildRules(input, handSize)
  type R = { idx: number[]; need: number[] }
  const byAnchor: R[][] = Array.from({ length: m }, () => [])
  for (const r of rules) {
    const ms = multiset(r)
    const pairs = [...ms.entries()].map(([id, n]) => [idx.get(id), n] as const).filter((p): p is readonly [number, number] => p[0] !== undefined)
    if (pairs.length !== ms.size) continue // cita carte non engine: non può accadere (engineIds le include), difensivo
    pairs.sort((a, b) => a[0] - b[0])
    byAnchor[pairs[0]![0]]!.push({ idx: pairs.map((p) => p[0]), need: pairs.map((p) => p[1]) })
  }

  // mani con al più 3 carte engine: etichetta effettiva dell'insieme esatto (codice numerico → giocabile)
  const base = m + 1
  const derived = collectRules({ ...input, labels: {} }, handSize, false)
  const small = new Map<number, boolean>()
  const addSmall = (is: number[]) => {
    const ms = new Map<number, number>()
    for (const i of is) ms.set(i, (ms.get(i) ?? 0) + 1)
    for (const [i, n] of ms) if (n > counts[i]!) return
    if (is.length > handSize) return
    const code = is.reduce((a, i) => a * base + i + 1, 0)
    small.set(code, effectiveLabelFrom(derived, input.labels, is.map((i) => ids[i]!)) === 'PLAYABLE')
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
  /** Con almeno 4 carte engine in mano vale solo "contiene una regola PLAYABLE" (monotona): niente etichette sull'insieme esatto. */
  const ruleSatisfied = (): boolean => {
    for (let p = 0; p < np; p++) {
      const list = byAnchor[pres[p]!]!
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
   * Ogni composizione si visita una sola volta e senza scorrere i tipi assenti. Senza dettagli, un nodo giocabile con ≥4 carte engine
   * assegna in blocco tutte le sue estensioni (sono tutte giocabili): somma Vandermonde w·C(carte libere, posti rimasti).
   */
  const rec = (start: number, used: number, w: number, code: number) => {
    const rem = handSize - used
    const playable = used === 0 ? false : used <= 3 ? small.get(code) === true : ruleSatisfied()
    if (prune && used >= 4 && playable) {
      playableW += w * cb(restFrom[start]!, rem)
      return
    }
    if (rem <= F) {
      const wt = w * cb(F, rem)
      if (wt > 0) {
        if (playable) playableW += wt
        else {
          brickW += wt
          if (opts.detail && wt > topFloor) {
            tops.push({ w: wt, k: Array.from(k), fill: rem })
            if (tops.length > TOP * 4) {
              tops.sort((a, b) => b.w - a.w)
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
  const res: HandResult = { ...empty, playable: playableW / denom, brick: brickW / denom, ruleCount: rules.length }
  if (!opts.detail) return res

  res.engineHist = hist.map((x) => x / denom)
  tops.sort((a, b) => b.w - a.w)
  res.topBricks = tops.slice(0, TOP).map<HandExample>((t) => ({
    cards: t.k.map((n, i) => ({ id: ids[i]!, n })).filter((c) => c.n > 0),
    fill: t.fill,
    p: t.w / denom,
  }))
  res.cardOdds = cards.map((c) => ({ id: c.id, count: c.count, p: atLeastOne(size, c.count, handSize) }))
  const roles = new Map<string, number>()
  for (const c of cards) for (const t of c.tags) roles.set(t, (roles.get(t) ?? 0) + c.count)
  res.roleOdds = [...roles.entries()].map(([role, copies]) => ({ role, copies, p: atLeastOne(size, copies, handSize) }))
  return res
}
