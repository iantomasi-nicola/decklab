/** Validazioni V1–V9 di docs/COMBO_FORMAT.md §11. Errori = bloccanti (import rifiutato), avvisi = import consentito. */
import { serializeYdke } from '../deck/ydke'
import { comboSchema, SUPPORTED_VERSION } from './schema'
import { allStates, endboardsEqual, boardOf, moveMismatch, FIELD_LOCS } from './state'
import type { Branch, ComboDoc, Endboard, Step } from './types'

export type IssueRule = 'schema' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8' | 'V9'

/** `code` è una chiave i18n (es. `combo.validation.duplicateStepId`), `params` i valori da interpolare. */
export interface Issue {
  rule: IssueRule
  severity: 'error' | 'warning'
  code: string
  path: (string | number)[]
  params?: Record<string, string | number>
}

export interface ValidationResult {
  ok: boolean // nessun errore bloccante
  errors: Issue[]
  warnings: Issue[]
  /** v > versione supportata: aprire in sola lettura */
  readOnly: boolean
}

const P = 'combo.validation.'

export function validateCombo(input: unknown): ValidationResult {
  const errors: Issue[] = []
  const warnings: Issue[] = []
  let readOnly = false
  const add = (rule: IssueRule, severity: Issue['severity'], code: string, path: Issue['path'], params?: Issue['params']) =>
    (severity === 'error' ? errors : warnings).push({ rule, severity, code: P + code, path, ...(params ? { params } : {}) })
  const done = (): ValidationResult => ({ ok: errors.length === 0, errors, warnings, readOnly })

  // V1
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    add('V1', 'error', 'notObject', [])
    return done()
  }
  const raw = input as Record<string, unknown>
  if (raw.format !== 'combolab.combo') add('V1', 'error', 'badFormat', ['format'])
  if (typeof raw.v !== 'number' || !Number.isInteger(raw.v) || raw.v < 1) add('V1', 'error', 'badVersion', ['v'])
  if (errors.length) return done()
  if ((raw.v as number) > SUPPORTED_VERSION) {
    readOnly = true
    add('V1', 'warning', 'readOnlyNewerVersion', ['v'], { v: raw.v as number, supported: SUPPORTED_VERSION })
    return done()
  }

  const parsed = comboSchema.safeParse(input)
  if (!parsed.success) {
    for (const i of parsed.error.issues) add('schema', 'error', 'schema', i.path.map((x) => (typeof x === 'symbol' ? String(x) : x)), { message: i.message })
    return done()
  }
  const doc = input as ComboDoc

  const lines: { path: (string | number)[]; steps: Step[]; branch?: Branch }[] = [{ path: ['steps'], steps: doc.steps }]
  doc.branches.forEach((b, bi) => lines.push({ path: ['branches', bi, 'steps'], steps: b.steps, branch: b }))

  // V2 id passi unici
  const seen = new Set<string>()
  for (const l of lines)
    l.steps.forEach((s, i) => {
      if (seen.has(s.id)) add('V2', 'error', 'duplicateStepId', [...l.path, i, 'id'], { id: s.id })
      seen.add(s.id)
    })
  const branchIds = new Set<string>()
  doc.branches.forEach((b, i) => {
    if (branchIds.has(b.id)) add('V2', 'error', 'duplicateBranchId', ['branches', i, 'id'], { id: b.id })
    branchIds.add(b.id)
  })

  // V3 uid esistenti in cards
  const known = (u: string, path: Issue['path']) => {
    if (!(u in doc.cards)) add('V3', 'error', 'unknownUid', path, { uid: u })
  }
  const checkBoard = (b: { places: { uid: string; place: { host?: string } }[]; counters?: Record<string, unknown> } | undefined, path: Issue['path']) => {
    b?.places.forEach((bp, i) => {
      known(bp.uid, [...path, 'places', i, 'uid'])
      if (bp.place.host) known(bp.place.host, [...path, 'places', i, 'place', 'host'])
    })
    for (const u of Object.keys(b?.counters ?? {})) known(u, [...path, 'counters', u])
  }
  const checkEndboard = (e: Endboard | null | undefined, path: Issue['path']) => {
    if (!e) return
    checkBoard(e.own, [...path, 'own'])
    checkBoard(e.opponent, [...path, 'opponent'])
  }
  for (const l of lines)
    l.steps.forEach((s, i) => {
      const p = [...l.path, i]
      if (s.card) known(s.card, [...p, 'card'])
      s.targets?.forEach((u, j) => known(u, [...p, 'targets', j]))
      s.searched?.forEach((u, j) => known(u, [...p, 'searched', j]))
      s.costs?.forEach((c, j) => c.cards.forEach((u, k) => known(u, [...p, 'costs', j, 'cards', k])))
      s.counters?.forEach((c, j) => known(c.uid, [...p, 'counters', j, 'uid']))
      for (const pl of [s.from, s.to]) if (pl?.host) known(pl.host, [...p, 'host'])
      s.moves.forEach((m, j) => {
        known(m.uid, [...p, 'moves', j, 'uid'])
        if (m.to.host) known(m.to.host, [...p, 'moves', j, 'to', 'host'])
        if (m.from?.host) known(m.from.host, [...p, 'moves', j, 'from', 'host'])
      })
    })
  doc.setup.hand.required.forEach((u, i) => known(u, ['setup', 'hand', 'required', i]))
  checkBoard(doc.setup.own, ['setup', 'own'])
  checkBoard(doc.setup.opponent?.board, ['setup', 'opponent', 'board'])
  doc.setup.opponent?.interrupts?.forEach((it, i) => known(it.uid, ['setup', 'opponent', 'interrupts', i, 'uid']))
  checkEndboard(doc.endboard, ['endboard'])
  doc.branches.forEach((b, i) => checkEndboard(b.endboard, ['branches', i, 'endboard']))

  // V4 rami: afterStep / rejoin
  const mainIdx = new Map(doc.steps.map((s, i) => [s.id, i]))
  doc.branches.forEach((b, i) => {
    const a = mainIdx.get(b.condition.afterStep)
    if (a === undefined) add('V4', 'error', 'afterStepMissing', ['branches', i, 'condition', 'afterStep'], { id: b.condition.afterStep })
    if (b.rejoin !== null) {
      const r = mainIdx.get(b.rejoin)
      if (r === undefined) add('V4', 'error', 'rejoinMissing', ['branches', i, 'rejoin'], { id: b.rejoin })
      else if (a !== undefined && r <= a) add('V4', 'error', 'rejoinNotAfter', ['branches', i, 'rejoin'], { id: b.rejoin })
    }
  })

  // V5 gruppi contigui
  for (const l of lines) {
    const closed = new Set<string>()
    let cur: string | undefined
    l.steps.forEach((s, i) => {
      if (s.group !== cur) {
        if (cur !== undefined) closed.add(cur)
        cur = s.group
        if (cur !== undefined && closed.has(cur)) add('V5', 'error', 'groupNotContiguous', [...l.path, i, 'group'], { group: cur })
      }
    })
  }

  // V6 ydke
  if (doc.deck.ydke !== undefined && doc.deck.ydke !== serializeYdke(doc.deck))
    add('V6', 'error', 'ydkeMismatch', ['deck', 'ydke'])

  // V8 mano richiesta presente nel deck
  const req = doc.setup.hand.required
  if (req.length > doc.setup.hand.size) add('V8', 'error', 'handTooLarge', ['setup', 'hand', 'required'], { required: req.length, size: doc.setup.hand.size })
  const need = new Map<number, number>()
  for (const u of req) {
    const code = doc.cards[u]
    if (code !== undefined) need.set(code, (need.get(code) ?? 0) + 1)
  }
  for (const [code, n] of need) {
    const have = doc.deck.main.filter((c) => c === code).length
    if (have < n) add('V8', 'error', 'handCardNotInDeck', ['setup', 'hand', 'required'], { code, needed: n, inDeck: have })
  }

  // V7 / V9 con la simulazione
  const all = allStates(doc)
  const checkLine = (path: Issue['path'], steps: Step[], states: ReturnType<typeof allStates>['main']) =>
    steps.forEach((s, i) => {
      const before = states[i]!
      s.moves.forEach((m, j) => {
        const r = moveMismatch(before, m)
        const p = [...path, i, 'moves', j]
        if (r === 'mismatch') add('V9', 'error', 'moveFromMismatch', p, { uid: m.uid, step: s.id })
        else if (r === 'unknown') add('V9', 'warning', 'moveUnknownCard', p, { uid: m.uid, step: s.id })
      })
    })
  checkLine(['steps'], doc.steps, all.main)
  doc.branches.forEach((b, i) => checkLine(['branches', i, 'steps'], b.steps, all.branches[b.id]!))
  // overlay con host non presente sul campo (dopo ogni passo)
  const last = all.main[all.main.length - 1]!
  for (const [u, pl] of Object.entries(last.places)) {
    if (pl.loc === 'overlay' && (!pl.host || !FIELD_LOCS.includes(last.places[pl.host]?.loc ?? 'deck') || last.places[pl.host]?.loc === 'overlay'))
      add('V9', 'warning', 'overlayHostInvalid', ['steps'], { uid: u, host: pl.host ?? '' })
  }
  if (doc.endboard) {
    const fin = all.main[all.main.length - 1]!
    const derived = { own: boardOf(fin, 0), opponent: boardOf(fin, 1) }
    if (!endboardsEqual(doc.endboard, derived)) add('V7', 'warning', 'endboardDrift', ['endboard'])
  }
  doc.branches.forEach((b, i) => {
    if (!b.endboard) return
    const st = all.branches[b.id]!
    const fin = st[st.length - 1]!
    if (!endboardsEqual(b.endboard, { own: boardOf(fin, 0), opponent: boardOf(fin, 1) })) add('V7', 'warning', 'endboardDrift', ['branches', i, 'endboard'])
  })

  return done()
}
