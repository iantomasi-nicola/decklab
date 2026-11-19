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

/* ------------------------------------------------------------------ combo lunghe: fasi, blocchi e sommario */
export type PhaseKey = NonNullable<Step['phase']>
export const PHASES: readonly PhaseKey[] = ['draw', 'standby', 'main1', 'battle', 'main2', 'end']

/** Id della catena a cui il passo appartiene (anche via `ref` dei passi `resolve`). */
export function chainIdOf(steps: readonly Step[], s: Step): string | undefined {
  if (s.chain) return s.chain.id
  if (s.action === 'resolve' && s.ref) return steps.find((x) => x.id === s.ref)?.chain?.id
  return undefined
}

/** Fase di ogni passo: quella dichiarata, altrimenti quella del passo precedente (undefined finché nessuna è dichiarata). */
export function phasesOf(steps: readonly Step[]): (PhaseKey | undefined)[] {
  let cur: PhaseKey | undefined
  return steps.map((s) => (cur = s.phase ?? cur))
}

export type ListItem =
  | { kind: 'phase'; phase: PhaseKey }
  | { kind: 'chain'; id: string; from: number; to: number; links: number; collapsed: boolean }
  | { kind: 'step'; gs: GuideStep; inChain: boolean }

/** Righe della lista passi: passi, intestazioni di fase e di catena comprimibile. `only` = filtro per numero di passo (ricerca): niente intestazioni. */
export function buildListItems(doc: ComboDoc, collapsed: ReadonlySet<string>, only?: ReadonlySet<number> | null): ListItem[] {
  const steps = buildSteps(doc)
  if (only) return steps.filter((gs) => only.has(gs.number)).map((gs) => ({ kind: 'step', gs, inChain: false }))
  const phases = phasesOf(doc.steps)
  const cids = doc.steps.map((s) => chainIdOf(doc.steps, s))
  const out: ListItem[] = []
  let prevPhase: PhaseKey | undefined
  let i = 0
  while (i < steps.length) {
    const ph = phases[i]
    if (ph !== prevPhase) {
      if (ph) out.push({ kind: 'phase', phase: ph })
      prevPhase = ph
    }
    const cid = cids[i]
    let j = i
    if (cid) while (j + 1 < steps.length && cids[j + 1] === cid && phases[j + 1] === ph) j++
    if (cid && j > i) {
      const isCollapsed = collapsed.has(cid)
      const links = new Set(doc.steps.slice(i, j + 1).filter((s) => s.chain).map((s) => s.chain!.link)).size
      out.push({ kind: 'chain', id: cid, from: i + 1, to: j + 1, links, collapsed: isCollapsed })
      for (let k = i; k <= j; k++) if (!isCollapsed) out.push({ kind: 'step', gs: steps[k]!, inChain: true })
      // fasi che cambiano dentro un blocco non esistono: il blocco si ferma al cambio di fase
    } else {
      out.push({ kind: 'step', gs: steps[i]!, inChain: false })
      j = i
    }
    i = j + 1
  }
  return out
}

export interface OutlineBlock {
  kind: 'steps' | 'chain' | 'group'
  from: number
  to: number
  /** carta del primo passo (uid), per l'etichetta */
  uid?: Uid
  /** anelli (solo catene) */
  links?: number
  chainId?: string
}
export interface OutlineSection { phase?: PhaseKey; from: number; to: number; blocks: OutlineBlock[] }

const MAX_PLAIN_RUN = 6
const CHUNK = 10

/**
 * Sommario: sezioni per fase (se i passi ne dichiarano) o a gruppi di 10 passi, con dentro blocchi di catena,
 * gruppi "ordine libero" e serie di passi semplici (al massimo 6 per riga). Numeri 1-based della linea principale.
 */
export function buildOutline(doc: Pick<ComboDoc, 'steps'>): OutlineSection[] {
  const steps = doc.steps
  if (steps.length === 0) return []
  const phases = phasesOf(steps)
  const hasPhases = phases.some(Boolean)
  const sections: OutlineSection[] = []
  const secKey = (i: number) => (hasPhases ? `${phases[i] ?? ''}` : `${Math.floor(i / CHUNK)}`)
  const cids = steps.map((s) => chainIdOf(steps, s))
  let i = 0
  while (i < steps.length) {
    const key = secKey(i)
    let e = i
    while (e + 1 < steps.length && secKey(e + 1) === key) e++
    const sec: OutlineSection = { ...(hasPhases && phases[i] ? { phase: phases[i]! } : {}), from: i + 1, to: e + 1, blocks: [] }
    let k = i
    while (k <= e) {
      const s = steps[k]!
      const cid = cids[k]
      let m = k
      let kind: OutlineBlock['kind'] = 'steps'
      if (cid) {
        kind = 'chain'
        while (m + 1 <= e && cids[m + 1] === cid) m++
      } else if (s.group) {
        kind = 'group'
        while (m + 1 <= e && steps[m + 1]!.group === s.group) m++
      } else {
        while (m + 1 <= e && m - k + 1 < MAX_PLAIN_RUN && !cids[m + 1] && !steps[m + 1]!.group) m++
      }
      const block: OutlineBlock = { kind, from: k + 1, to: m + 1, ...(s.card ? { uid: s.card } : {}) }
      if (kind === 'chain') {
        block.chainId = cid!
        block.links = new Set(steps.slice(k, m + 1).filter((x) => x.chain).map((x) => x.chain!.link)).size
      }
      sec.blocks.push(block)
      k = m + 1
    }
    sections.push(sec)
    i = e + 1
  }
  return sections
}

/** Testo ricercabile di un passo (minuscolo, senza accenti), riga per riga. */
export function matchSteps(haystacks: readonly string[], query: string, normalize: (s: string) => string): Set<number> | null {
  const q = normalize(query)
  if (!q) return null
  const out = new Set<number>()
  const num = /^\d+$/.test(q) ? Number(q) : 0
  haystacks.forEach((h, i) => {
    if (h.includes(q) || (num > 0 && i + 1 === num)) out.add(i + 1)
  })
  return out
}
