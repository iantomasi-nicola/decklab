/** Modello di vista della pagina guida (puro): mano iniziale, passi numerati con catene/gruppi, rami, board finale, varianti. */
import { allStates, FIELD_LOCS, normPlace, zoneCards, type GameState, type NPlace } from '@/domain/combo/state'
import type { Board, Branch, ComboDoc, Loc, PlayerIdx, Step, Uid } from '@/domain/combo/types'
import type { Lang, Localized } from '@/domain/types'

export const pickLoc = (t: Localized | undefined, lang: Lang): string | undefined => t?.[lang] ?? t?.[lang === 'it' ? 'en' : 'it']

export interface HandCard { uid: Uid; code: number }

/** Carte necessarie in mano; `random` = quante carte casuali completano la mano. */
export function handOf(doc: ComboDoc): { required: HandCard[]; random: number } {
  const required = doc.setup.hand.required.map((uid) => ({ uid, code: doc.cards[uid] ?? 0 }))
  const random = doc.setup.hand.fill === 'random' ? Math.max(0, doc.setup.hand.size - required.length) : 0
  return { required, random }
}

export interface GuideStep {
  step: Step
  /** numero visibile (1-based) nella linea principale */
  number: number
  /** il passo appartiene a una catena? posizione dentro il blocco */
  chain?: { id: string; link: number; first: boolean; last: boolean }
  /** passo in un gruppo "ordine libero" */
  group?: { id: string; first: boolean; last: boolean }
  /** rami che partono dopo questo passo */
  branches: Branch[]
}

/** Passi della linea principale con numerazione e informazioni di blocco. Rami agganciati al passo `afterStep` (se inesistente: al primo). */
export function buildSteps(doc: ComboDoc): GuideStep[] {
  const byAfter = new Map<string, Branch[]>()
  for (const b of doc.branches) byAfter.set(b.condition.afterStep, [...(byAfter.get(b.condition.afterStep) ?? []), b])
  return doc.steps.map((step, i) => {
    const prev = doc.steps[i - 1]
    const next = doc.steps[i + 1]
    const gs: GuideStep = { step, number: i + 1, branches: byAfter.get(step.id) ?? [] }
    if (step.chain) {
      const id = step.chain.id
      gs.chain = { id, link: step.chain.link, first: prev?.chain?.id !== id, last: next?.chain?.id !== id }
    }
    if (step.group) {
      const id = step.group
      gs.group = { id, first: prev?.group !== id, last: next?.group !== id }
    }
    return gs
  })
}

/** Numero (1-based) di un passo della linea principale, 0 se assente. */
export const stepNumber = (doc: Pick<ComboDoc, 'steps'>, id: string | null | undefined): number => (id ? doc.steps.findIndex((s) => s.id === id) + 1 : 0)

export interface BoardCard { uid: Uid; code: number; loc: Loc; seq: number; overlays: number }
export interface BoardView {
  monsters: BoardCard[]
  backrow: BoardCard[]
  field: BoardCard[]
  lp: number
}

/** Carte sul campo di un giocatore, raggruppate (mostri incl. EMZ, magie/trappole, terreno). */
export function boardView(state: GameState, p: 0 | 1, registry: Record<Uid, number>): BoardView {
  const mk = (loc: Loc): BoardCard[] =>
    zoneCards(state, p, loc).map((uid) => ({
      uid,
      code: registry[uid] ?? 0,
      loc,
      seq: state.places[uid]?.seq ?? 0,
      overlays: zoneCards(state, p, 'overlay', uid).length,
    }))
  return {
    monsters: [...mk('emz'), ...mk('mzone')],
    backrow: mk('szone'),
    field: mk('fzone'),
    lp: state.lp[p],
  }
}

export const boardIsEmpty = (b: BoardView) => b.monsters.length + b.backrow.length + b.field.length === 0

/** Stato finale della linea principale (o del ramo). */
export function finalState(doc: ComboDoc, branchId?: string): GameState {
  const all = allStates(doc)
  const arr = branchId ? (all.branches[branchId] ?? all.main) : all.main
  return arr[arr.length - 1]!
}

/** Stato del board finale: quello salvato nel documento (solo campo) se c'è, altrimenti lo stato finale ricalcolato. */
export function endboardState(doc: ComboDoc): GameState {
  const base = finalState(doc)
  const eb = doc.endboard
  if (!eb) return base
  const places: Record<Uid, NPlace> = {}
  for (const [uid, pl] of Object.entries(base.places)) if (!FIELD_LOCS.includes(pl.loc)) places[uid] = pl
  const put = (b: Board | undefined, p: PlayerIdx) => {
    for (const bp of b?.places ?? []) places[bp.uid] = normPlace(bp.place, p)
  }
  put(eb.own, 0)
  put(eb.opponent, 1)
  return { places, lp: [eb.own.lp, eb.opponent?.lp ?? base.lp[1]], counters: base.counters }
}

/** Il riepilogo testuale del board finale (se c'è). */
export const endSummary = (doc: ComboDoc, lang: Lang): string | undefined => pickLoc(doc.endboard?.summary, lang)

export interface VariantRow {
  id: string
  title: Localized | undefined
  /** passo della combo madre dopo il quale divergono (1-based); 0 = dall'inizio */
  afterStepNo: number
  afterStepId: string | null
}
interface RecordLike { id: string; name?: Localized; payload?: unknown }

const metaOf = (r: RecordLike): ComboDoc['meta'] | undefined => (r.payload as Partial<ComboDoc> | undefined)?.meta

/** Varianti derivate da `comboId` (con il passo di divergenza calcolato sui passi della madre), ordinate per passo e poi per titolo. */
export function variantsOf(doc: Pick<ComboDoc, 'steps'>, comboId: string, all: readonly RecordLike[]): VariantRow[] {
  const rows: VariantRow[] = []
  for (const r of all) {
    const d = metaOf(r)?.derivedFrom
    if (!d || d.comboId !== comboId || r.id === comboId) continue
    rows.push({ id: r.id, title: r.name ?? metaOf(r)?.title, afterStepNo: stepNumber(doc, d.afterStep), afterStepId: d.afterStep })
  }
  return rows.sort((a, b) => a.afterStepNo - b.afterStepNo || (a.title?.it ?? a.title?.en ?? '').localeCompare(b.title?.it ?? b.title?.en ?? '', 'it'))
}

/** Passo (1-based) della madre dopo cui questa combo diverge, se è una variante. */
export function motherDivergence(doc: ComboDoc, mother: RecordLike | undefined): { motherId: string; title: Localized | undefined; afterStepNo: number } | null {
  const d = doc.meta.derivedFrom
  if (!d) return null
  const motherDoc = mother?.payload as Partial<ComboDoc> | undefined
  return {
    motherId: d.comboId,
    title: mother?.name ?? motherDoc?.meta?.title ?? d.title,
    afterStepNo: motherDoc?.steps ? stepNumber({ steps: motherDoc.steps }, d.afterStep) : 0,
  }
}

/** Passi (id) che usano una carta, per marcare quelli interessati dalla banlist. */
export function stepsUsingCards(doc: ComboDoc, canonical: (code: number) => number, codes: ReadonlySet<number>): Set<string> {
  const out = new Set<string>()
  const uses = (s: Step) => {
    const uids = [s.card, ...(s.targets ?? []), ...(s.searched ?? []), ...s.moves.map((m) => m.uid)]
    return uids.some((u) => u && doc.cards[u] !== undefined && codes.has(canonical(doc.cards[u]!)))
  }
  for (const s of doc.steps) if (uses(s)) out.add(s.id)
  for (const b of doc.branches) for (const s of b.steps) if (uses(s)) out.add(s.id)
  return out
}

/** Dettagli di un passo da mostrare come righe etichettate (uid raggruppati per ruolo). */
export function stepDetails(s: Step): { kind: 'search' | 'targets' | 'costs' | 'materials'; label?: string; uids: Uid[] }[] {
  const out: { kind: 'search' | 'targets' | 'costs' | 'materials'; label?: string; uids: Uid[] }[] = []
  if (s.searched?.length) out.push({ kind: 'search', uids: s.searched })
  const mats = s.moves.filter((m) => m.why === 'material' || m.why === 'tribute').map((m) => m.uid)
  if (mats.length) out.push({ kind: 'materials', uids: mats })
  for (const c of s.costs ?? []) if (c.cards.length) out.push({ kind: 'costs', label: c.kind, uids: c.cards })
  if (s.targets?.length) out.push({ kind: 'targets', uids: s.targets })
  return out
}
