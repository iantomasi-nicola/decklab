/** Operazioni pure sul documento combo usate dall'editor (nessun React, nessun I/O). */
import { applyStep, boardOf, deriveEndboard, DEFAULT_LP, initialState, ownerOfUid, type GameState } from '@/domain/combo/state'
import type { Board, ComboDoc, PlayerIdx, Step, Uid } from '@/domain/combo/types'
import type { DeckLists, Localized, Rules } from '@/domain/types'
import { nextStepId, type StepDraft } from './actions'
import { ALL_LOCS } from './zones'

export interface Draft {
  step: StepDraft
  /** istanze nate con questo passo (uid → passcode) */
  register?: Record<Uid, number>
  tokens?: Uid[]
  /** carta aggiunta da fuori mazzo (ricerca): entra nel Deck/Extra della combo, così le carte "necessarie" restano valide (V8) */
  deckAdd?: { code: number; extra: boolean }
}

export interface BlankOptions {
  id: string
  title: Localized
  archetype: { id?: string; name: Localized }
  variant: { id?: string; name: Localized } | null
  rules: Rules
  banlist: { format: string; id: string }
  deck: DeckLists
  now: string
}

export function createBlankDoc(o: BlankOptions): ComboDoc {
  return {
    format: 'combolab.combo',
    v: 1,
    meta: {
      id: o.id,
      title: o.title,
      scope: o.variant ? 'variant' : 'archetype',
      archetype: o.archetype,
      variant: o.variant,
      rules: o.rules,
      banlist: o.banlist,
      tags: [],
      noteLang: [],
      favorite: false,
      createdAt: o.now,
      updatedAt: o.now,
      source: 'manual',
    },
    deck: { main: [...o.deck.main], extra: [...o.deck.extra], side: [...o.deck.side] },
    cards: {},
    setup: {
      first: true,
      hand: { required: [], size: 5, fill: 'random' },
      own: { lp: DEFAULT_LP, places: [] },
      opponent: { board: { lp: DEFAULT_LP, places: [] }, interrupts: [] },
    },
    steps: [],
    branches: [],
  }
}

/** Prossimo uid libero ("u7" / "o3"), considerando anche quelli appena prenotati. */
export function nextUid(doc: ComboDoc, p: PlayerIdx, reserved: Iterable<Uid> = []): Uid {
  const prefix = p === 0 ? 'u' : 'o'
  let max = 0
  for (const uid of [...Object.keys(doc.cards), ...reserved]) {
    if (!uid.startsWith(prefix)) continue
    const n = Number(uid.slice(1))
    if (Number.isFinite(n)) max = Math.max(max, n)
  }
  return `${prefix}${max + 1}`
}

export const tokensOf = (doc: ComboDoc): Uid[] => {
  const t = doc.x?.tokens
  return Array.isArray(t) ? (t as Uid[]) : []
}

/** Carte del Deck/Extra proprio non ancora rivelate (passcode → copie). */
export function remainingPool(doc: ComboDoc): { main: Map<number, number>; extra: Map<number, number> } {
  const count = (list: number[]) => {
    const m = new Map<number, number>()
    for (const c of list) m.set(c, (m.get(c) ?? 0) + 1)
    return m
  }
  const main = count(doc.deck.main)
  const extra = count(doc.deck.extra)
  const tokens = new Set(tokensOf(doc))
  for (const [uid, code] of Object.entries(doc.cards)) {
    if (ownerOfUid(uid) !== 0 || tokens.has(uid)) continue
    if ((extra.get(code) ?? 0) > 0) extra.set(code, extra.get(code)! - 1)
    else if ((main.get(code) ?? 0) > 0) main.set(code, main.get(code)! - 1)
  }
  return { main, extra }
}

export const poolTotal = (m: Map<number, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

/** Riscrive `setup` a partire dallo stato iniziale modificato (mano = carte necessarie; il resto = board). */
export function setupFromState(doc: ComboDoc, state: GameState): ComboDoc {
  const own = boardOf(state, 0, ALL_LOCS)
  const handUids = own.places
    .filter((bp) => bp.place.loc === 'hand')
    .sort((a, b) => (a.place.seq ?? 1e9) - (b.place.seq ?? 1e9))
    .map((bp) => bp.uid)
  const ownBoard: Board = { ...own, places: own.places.filter((bp) => bp.place.loc !== 'hand') }
  const opp = boardOf(state, 1, ALL_LOCS)
  return {
    ...doc,
    setup: {
      ...doc.setup,
      hand: { ...doc.setup.hand, required: handUids, size: Math.max(doc.setup.hand.size, handUids.length) },
      own: ownBoard,
      opponent: { ...doc.setup.opponent, board: opp },
    },
  }
}

const withCards = (doc: ComboDoc, d: Draft): ComboDoc => {
  if (!d.register && !d.tokens?.length && !d.deckAdd) return doc
  const next: ComboDoc = { ...doc, cards: { ...doc.cards, ...d.register } }
  if (d.deckAdd) {
    const { ydke: _y, ...deck } = doc.deck // l'impronta ydke non coincide più (V6): si ricalcola in export
    void _y
    next.deck = d.deckAdd.extra ? { ...deck, extra: [...deck.extra, d.deckAdd.code] } : { ...deck, main: [...deck.main, d.deckAdd.code] }
  }
  if (d.tokens?.length) next.x = { ...doc.x, tokens: [...tokensOf(doc), ...d.tokens] }
  return next
}

/** Aggiunge un passo dopo `cursor` passi della linea principale. Ritorna il nuovo documento e il nuovo cursore. */
export function addStep(doc: ComboDoc, cursor: number, d: Draft): { doc: ComboDoc; cursor: number; stepId: string } {
  const base = withCards(doc, d)
  const ids = [...base.steps.map((s) => s.id), ...base.branches.flatMap((b) => b.steps.map((s) => s.id))]
  const id = nextStepId(ids)
  const step: Step = { id, ...d.step }
  const steps = [...base.steps]
  steps.splice(cursor, 0, step)
  return { doc: { ...base, steps }, cursor: cursor + 1, stepId: id }
}

/** Nella configurazione: applica la bozza come "stato iniziale modificato". */
export function applySetupDraft(doc: ComboDoc, d: Draft): ComboDoc {
  const base = withCards(doc, d)
  const next = applyStep(initialState(base), { id: '_', ...d.step })
  return setupFromState(base, next)
}

export function patchStep(doc: ComboDoc, id: string, patch: Partial<Step>): ComboDoc {
  return { ...doc, steps: doc.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) }
}

export function removeStep(doc: ComboDoc, id: string): ComboDoc {
  return { ...doc, steps: doc.steps.filter((s) => s.id !== id) }
}

/** I gruppi "ordine libero" devono restare contigui (V5): chi è rimasto isolato perde il gruppo. */
export function normalizeGroups(steps: Step[]): Step[] {
  const count = new Map<string, number>()
  for (const s of steps) if (s.group) count.set(s.group, (count.get(s.group) ?? 0) + 1)
  const seen = new Map<string, number>() // ultimo indice visto
  const broken = new Set<string>()
  steps.forEach((s, i) => {
    if (!s.group) return
    const last = seen.get(s.group)
    if (last !== undefined && last !== i - 1) broken.add(s.group)
    seen.set(s.group, i)
  })
  return steps.map((s) => {
    if (!s.group) return s
    if (broken.has(s.group) || (count.get(s.group) ?? 0) < 2) {
      const { group: _g, ...rest } = s
      void _g
      return rest
    }
    return s
  })
}

export function moveStep(doc: ComboDoc, id: string, dir: -1 | 1): ComboDoc {
  const i = doc.steps.findIndex((s) => s.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= doc.steps.length) return doc
  const steps = [...doc.steps]
  ;[steps[i], steps[j]] = [steps[j]!, steps[i]!]
  return { ...doc, steps: normalizeGroups(steps) }
}

/** Raggruppa il passo con il precedente ("ordine libero") o lo stacca dal gruppo. */
export function toggleGroup(doc: ComboDoc, id: string): ComboDoc {
  const i = doc.steps.findIndex((s) => s.id === id)
  const cur = doc.steps[i]
  if (!cur) return doc
  let steps = [...doc.steps]
  if (cur.group) {
    const { group: _g, ...rest } = cur
    void _g
    steps[i] = rest
  } else {
    const prev = doc.steps[i - 1]
    if (!prev) return doc
    const group = prev.group ?? nextGroupId(doc.steps)
    steps[i - 1] = { ...prev, group }
    steps[i] = { ...cur, group }
  }
  steps = normalizeGroups(steps)
  return { ...doc, steps }
}

const nextGroupId = (steps: Step[]): string => {
  let max = 0
  for (const s of steps) {
    const m = /^g(\d+)$/.exec(s.group ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `g${max + 1}`
}

/** Rimuove una carta dal documento (solo se nessun passo la usa). Ritorna null se non è possibile. */
export function removeCard(doc: ComboDoc, uid: Uid): ComboDoc | null {
  const used = doc.steps.some((s) => s.card === uid || s.moves.some((m) => m.uid === uid) || s.targets?.includes(uid) || s.searched?.includes(uid))
  if (used) return null
  const state = initialState(doc)
  const places = { ...state.places }
  delete places[uid]
  const cards = { ...doc.cards }
  delete cards[uid]
  const tokens = tokensOf(doc).filter((t) => t !== uid)
  const next = setupFromState({ ...doc, cards }, { ...state, places })
  if (doc.x?.tokens) next.x = { ...doc.x, tokens }
  return next
}

/** Prepara il documento per il salvataggio: lingue delle note, data, board finale ricalcolato. */
export function finalizeDoc(doc: ComboDoc, now: string): ComboDoc {
  const langs = new Set<string>()
  const scan = (l?: Localized) => {
    if (l?.it?.trim()) langs.add('it')
    if (l?.en?.trim()) langs.add('en')
  }
  scan(doc.meta.title)
  for (const s of doc.steps) scan(s.note)
  let state = initialState(doc)
  for (const s of doc.steps) state = applyStep(state, s)
  // ordine delle lingue: quello già scelto (la corrente per prima), senza quelle non più presenti
  const noteLang = [...doc.meta.noteLang.filter((l) => langs.has(l)), ...[...langs].filter((l) => !doc.meta.noteLang.includes(l))]
  return {
    ...doc,
    meta: { ...doc.meta, noteLang, updatedAt: now },
    endboard: { ...deriveEndboard(state), ...(doc.endboard?.summary ? { summary: doc.endboard.summary } : {}) },
  }
}

/** Testo da mostrare: lingua corrente, altrimenti la prima disponibile (ordine: `order`, poi it, en). */
export function pickText(l: Localized | undefined, lang: string, order: readonly string[] = []): string {
  if (!l) return ''
  const rec = l as Record<string, string | undefined>
  const own = rec[lang]
  if (own?.trim()) return own
  for (const k of [...order, 'it', 'en']) if (rec[k]?.trim()) return rec[k]!
  return ''
}

/** Scrive il testo nella lingua corrente (chiave vuota = rimossa). */
export function withText(l: Localized | undefined, lang: string, value: string): Localized {
  const next: Record<string, string | undefined> = { ...(l as Record<string, string | undefined>) }
  if (value) next[lang] = value
  else delete next[lang]
  return next as Localized
}

/** `noteLang` con la lingua corrente per prima (è la lingua in cui si sta annotando). */
export const withNoteLang = (noteLang: readonly string[], lang: string): string[] => [lang, ...noteLang.filter((x) => x !== lang)]

export const handSize = (first: boolean) => (first ? 5 : 6)

/** Uid citati da un passo (carta, mosse, bersagli, costi, cercate). */
export function uidsOfStep(s: Step): Uid[] {
  const out: Uid[] = []
  if (s.card) out.push(s.card)
  for (const m of s.moves) {
    out.push(m.uid)
    if (m.to.host) out.push(m.to.host)
    if (m.from?.host) out.push(m.from.host)
  }
  if (s.to?.host) out.push(s.to.host)
  out.push(...(s.targets ?? []), ...(s.searched ?? []))
  for (const c of s.costs ?? []) out.push(...c.cards)
  for (const c of s.counters ?? []) out.push(c.uid)
  return out
}

/**
 * Nuova combo che copia setup + passi fino a `stepIndex` (compreso se `inclusive`, altrimenti fino al precedente).
 * Il registro delle istanze tiene solo le carte ancora citate; `derivedFrom` punta alla madre.
 */
export function deriveDoc(mother: ComboDoc, stepIndex: number, inclusive: boolean, o: { id: string; title: Localized; now: string }): ComboDoc {
  const end = inclusive ? stepIndex + 1 : stepIndex
  const steps = structuredClone(mother.steps.slice(0, Math.max(0, end)))
  const ids = new Set(steps.map((s) => s.id))
  const used = new Set<Uid>()
  const st = mother.setup
  for (const uid of st.hand.required) used.add(uid)
  for (const b of [st.own, st.opponent?.board]) for (const bp of b?.places ?? []) used.add(bp.uid)
  for (const i of st.opponent?.interrupts ?? []) used.add(i.uid)
  for (const s of steps) for (const u of uidsOfStep(s)) used.add(u)
  const cards: Record<Uid, number> = {}
  for (const [uid, code] of Object.entries(mother.cards)) if (used.has(uid)) cards[uid] = code
  const lastId = steps[steps.length - 1]?.id ?? null
  const doc: ComboDoc = {
    ...structuredClone(mother),
    cards,
    steps,
    branches: structuredClone(mother.branches.filter((b) => ids.has(b.condition.afterStep) && (b.rejoin === null || ids.has(b.rejoin)))),
    meta: {
      ...structuredClone(mother.meta),
      id: o.id,
      title: o.title,
      favorite: false,
      createdAt: o.now,
      updatedAt: o.now,
      derivedFrom: { comboId: mother.meta.id, afterStep: lastId, title: structuredClone(mother.meta.title) },
    },
  }
  delete doc.endboard
  delete doc.engine
  const tokens = tokensOf(mother).filter((t) => used.has(t))
  if (mother.x) doc.x = { ...structuredClone(mother.x), ...(mother.x.tokens ? { tokens } : {}) }
  return finalizeDoc(doc, o.now)
}

// ------------------------------------------------------------------ mano di partenza
// Unica fonte di verità: `setup.hand` ({ required, size, fill }). "Esatta" = fill none; "mista" = necessarie + completamento
// casuale; "a caso" = nessuna carta necessaria + completamento casuale. Lo stesso modello vale per Setup, Avvia e creazione.

export type HandMode = 'exact' | 'mixed' | 'random'
export const MAX_HAND = 10

export const handModeOf = (h: ComboDoc['setup']['hand']): HandMode => (h.fill === 'none' ? 'exact' : h.required.length > 0 ? 'mixed' : 'random')

/** Passcode delle carte necessarie in mano, nell'ordine. */
export const handCodes = (doc: ComboDoc): number[] => doc.setup.hand.required.flatMap((u) => (doc.cards[u] !== undefined ? [doc.cards[u]!] : []))

/** Quante carte avrà davvero la mano iniziale (prima di un eventuale mazzo troppo corto). */
export const handTotal = (h: ComboDoc['setup']['hand']): number => (h.fill === 'none' ? h.required.length : Math.max(h.size, h.required.length))

/** Uid citati dai passi della linea principale e dei rami: non si possono togliere dalla mano iniziale. */
function stepUids(doc: ComboDoc): Set<Uid> {
  const s = new Set<Uid>()
  for (const st of [...doc.steps, ...doc.branches.flatMap((b) => b.steps)]) for (const u of uidsOfStep(st)) s.add(u)
  return s
}

/**
 * Imposta la mano di partenza. Gli uid già esistenti con lo stesso passcode vengono riusati (i passi restano validi);
 * le carte tolte che i passi usano ancora NON si tolgono e sono ritornate in `blocked` (mai una perdita silenziosa).
 */
export function setHand(doc: ComboDoc, o: { codes: readonly number[]; mode: HandMode; size?: number }): { doc: ComboDoc; blocked: Uid[] } {
  const hand = doc.setup.hand
  const codes = o.mode === 'random' ? [] : o.codes.slice(0, MAX_HAND)
  const pool = new Map<number, Uid[]>()
  const orphan: Uid[] = []
  for (const u of hand.required) {
    const c = doc.cards[u]
    if (c === undefined) orphan.push(u)
    else pool.set(c, [...(pool.get(c) ?? []), u])
  }
  const required: Uid[] = []
  const register: Record<Uid, number> = {}
  const reserved: Uid[] = []
  for (const c of codes) {
    const reuse = pool.get(c)?.shift()
    if (reuse) required.push(reuse)
    else {
      const u = nextUid(doc, 0, reserved)
      reserved.push(u)
      register[u] = c
      required.push(u)
    }
  }
  const leftover = [...[...pool.values()].flat(), ...orphan]
  const used = stepUids(doc)
  const blocked = leftover.filter((u) => used.has(u))
  const dropped = leftover.filter((u) => !used.has(u))
  const elsewhere = new Set<Uid>([...(doc.setup.own?.places ?? []).map((p) => p.uid), ...(doc.setup.opponent?.board?.places ?? []).map((p) => p.uid), ...(doc.setup.opponent?.interrupts ?? []).map((i) => i.uid)])
  const cards = { ...doc.cards, ...register }
  for (const u of dropped) if (!elsewhere.has(u)) delete cards[u]
  const all = [...required, ...blocked]
  const size = Math.min(MAX_HAND, Math.max(o.size ?? hand.size, all.length, 1))
  return {
    doc: { ...doc, cards, setup: { ...doc.setup, hand: { required: all, size, fill: o.mode === 'exact' ? 'none' : 'random' } } },
    blocked,
  }
}

export interface HandIssue {
  code: 'notInDeck' | 'emptyExact' | 'unknownCard'
  uid?: Uid
  card?: number
}

/** Cose della mano che il motore non potrà rispettare: si mostrano PRIMA di avviare. */
export function handIssues(doc: ComboDoc): HandIssue[] {
  const out: HandIssue[] = []
  const h = doc.setup.hand
  const left = new Map<number, number>()
  for (const c of doc.deck.main) left.set(c, (left.get(c) ?? 0) + 1)
  for (const u of h.required) {
    const c = doc.cards[u]
    if (c === undefined) {
      out.push({ code: 'unknownCard', uid: u })
      continue
    }
    const n = left.get(c) ?? 0
    if (n <= 0) out.push({ code: 'notInDeck', uid: u, card: c })
    else left.set(c, n - 1)
  }
  if (h.fill === 'none' && h.required.length === 0) out.push({ code: 'emptyExact' })
  return out
}

/** Una bozza che porta una carta NUOVA (da Deck o aggiunta) nella mano del giocatore: è una carta di setup, non un effetto. */
export function isOwnHandAdd(d: Draft): boolean {
  const reg = d.register
  if (!reg || d.tokens?.length) return false
  return d.step.moves.some((m) => m.to.loc === 'hand' && (m.to.p ?? 0) === 0 && reg[m.uid] !== undefined)
}
