/** Modello puro del replay: fotogrammi (stato dopo ogni passo), catena/carta attiva, riduttore del lettore. Nessun React. */
import { allStates, type GameState } from '@/domain/combo/state'
import { buildOutline } from '@/features/guide/guideModel'
import type { ComboDoc, Step, Uid } from '@/domain/combo/types'

export interface Frame {
  /** stato dopo questo fotogramma (0 = stato iniziale) */
  state: GameState
  /** passo che porta a questo stato (assente per il fotogramma 0) */
  step?: Step
  /** appartiene a un ramo (altrimenti linea principale) */
  inBranch: boolean
  /** numero del passo nella linea principale (1-based) o lettera/indice nel ramo (1-based) */
  label: number
  /** carta protagonista del passo, se presente nello stato */
  active?: Uid
  /** carte degli anelli di catena (in ordine di anello) fino a questo fotogramma */
  chain: Uid[]
}

export interface Timeline {
  frames: Frame[]
  /** indice del primo fotogramma del ramo (frames.length se non c'è ramo) */
  branchStart: number
}

/** Passi esposti in ordine di timeline (linea principale fino a `afterStep`, poi il ramo) e relativi stati. */
export function buildTimeline(doc: ComboDoc, branchId?: string | null): Timeline {
  const all = allStates(doc)
  const branch = branchId ? doc.branches.find((b) => b.id === branchId) : undefined
  const bStates = branch ? all.branches[branch.id] : undefined
  let mainSteps = doc.steps
  let mainStates = all.main
  let branchSteps: Step[] = []
  let branchStates: GameState[] = []
  if (branch && bStates) {
    const idx = doc.steps.findIndex((s) => s.id === branch.condition.afterStep)
    mainSteps = doc.steps.slice(0, idx + 1)
    mainStates = all.main.slice(0, idx + 2)
    branchSteps = branch.steps
    branchStates = bStates.slice(1)
  }
  const steps = [...mainSteps, ...branchSteps]
  const states = [...mainStates, ...branchStates]
  const frames: Frame[] = [{ state: states[0]!, inBranch: false, label: 0, chain: [] }]
  steps.forEach((step, i) => {
    const inBranch = i >= mainSteps.length
    const state = states[i + 1]!
    const chain = chainUpTo(steps, i)
    frames.push({
      state,
      step,
      inBranch,
      label: inBranch ? i - mainSteps.length + 1 : i + 1,
      ...(step.card && state.places[step.card] ? { active: step.card } : {}),
      chain: chain.filter((u) => !!state.places[u]),
    })
  })
  return { frames, branchStart: branch && bStates ? mainSteps.length + 1 : frames.length }
}

/** Id della catena a cui il passo appartiene (anche via `ref` dei passi `resolve`). */
function chainIdOf(steps: Step[], s: Step): string | undefined {
  if (s.chain) return s.chain.id
  if (s.action === 'resolve' && s.ref) return steps.find((x) => x.id === s.ref)?.chain?.id
  return undefined
}

/** Carte (anelli) della catena del passo `i`, fino al passo `i` compreso, in ordine di anello. */
export function chainUpTo(steps: Step[], i: number): Uid[] {
  const id = chainIdOf(steps, steps[i]!)
  if (!id) return []
  const links: { link: number; uid: Uid }[] = []
  for (let k = 0; k <= i; k++) {
    const s = steps[k]!
    if (s.chain?.id === id && s.card) links.push({ link: s.chain.link, uid: s.card })
  }
  const seen = new Set<Uid>()
  return links
    .sort((a, b) => a.link - b.link)
    .map((l) => l.uid)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
}

/* ------------------------------------------------------------------ lettore */
export const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3] as const
export type Speed = (typeof SPEEDS)[number]
/** Durata di un passo a velocità 1× (ms). */
export const BASE_INTERVAL = 1400
export const intervalFor = (speed: number) => Math.round(BASE_INTERVAL / speed)

export interface PlayerState { index: number; playing: boolean; speed: Speed }
export type PlayerAction =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; index: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'tick' }
  | { type: 'speed'; speed: Speed }
  | { type: 'cycleSpeed' }
  | { type: 'reset' }

export const initialPlayer: PlayerState = { index: 0, playing: false, speed: 1 }

/** `last` = indice dell'ultimo fotogramma. Giocare dall'ultimo fotogramma riparte dall'inizio; alla fine si ferma da solo. */
export function playerReducer(s: PlayerState, a: PlayerAction, last: number): PlayerState {
  const clamp = (n: number) => Math.min(Math.max(n, 0), last)
  switch (a.type) {
    case 'next': return { ...s, index: clamp(s.index + 1), playing: false }
    case 'prev': return { ...s, index: clamp(s.index - 1), playing: false }
    case 'seek': return { ...s, index: clamp(a.index) }
    case 'play': return s.index >= last ? { ...s, index: 0, playing: last > 0 } : { ...s, playing: true }
    case 'pause': return { ...s, playing: false }
    case 'toggle': return playerReducer(s, { type: s.playing ? 'pause' : 'play' }, last)
    case 'tick': {
      const index = clamp(s.index + 1)
      return { ...s, index, playing: s.playing && index < last }
    }
    case 'speed': return { ...s, speed: a.speed }
    case 'cycleSpeed': return { ...s, speed: SPEEDS[(SPEEDS.indexOf(s.speed) + 1) % SPEEDS.length]! }
    case 'reset': return { ...s, index: 0, playing: false }
  }
}

/** Dedotto da `emphasis`: insieme immutabile per Field. */
export const chainSet = (f: Frame): ReadonlySet<Uid> => new Set(f.chain.length > 1 ? f.chain : [])

/* ------------------------------------------------------------------ combo lunghe: gruppi di fotogrammi */
export interface FrameBlock {
  kind: 'steps' | 'chain' | 'group'
  /** primo e ultimo fotogramma del blocco (indici in `frames`) */
  from: number
  to: number
  uid?: Uid
  links?: number
}
export interface FrameSection {
  id: string
  phase?: NonNullable<Step['phase']>
  branch: boolean
  from: number
  to: number
  blocks: FrameBlock[]
}

/** Sezioni per fase (o per gruppi di 10 passi) e blocchi di catena / ordine libero / passi della timeline; il ramo è una sezione a parte. */
export function frameSections(tl: Timeline): FrameSection[] {
  const main = tl.frames.slice(1, tl.branchStart).map((f) => f.step!)
  const branch = tl.frames.slice(tl.branchStart).map((f) => f.step!)
  const conv = (steps: Step[], offset: number, isBranch: boolean): FrameSection[] =>
    buildOutline({ steps }).map((s, i) => ({
      id: `${isBranch ? 'b' : 'm'}${i}`,
      ...(s.phase ? { phase: s.phase } : {}),
      branch: isBranch,
      from: s.from + offset,
      to: s.to + offset,
      blocks: s.blocks.map((b) => ({ kind: b.kind, from: b.from + offset, to: b.to + offset, ...(b.uid ? { uid: b.uid } : {}), ...(b.links ? { links: b.links } : {}) })),
    }))
  const out = conv(main, 0, false)
  if (branch.length) {
    const sec = conv(branch, tl.branchStart - 1, true)
    // il ramo è un'unica sezione, senza suddivisione per fase
    out.push({ id: 'b', branch: true, from: tl.branchStart, to: tl.frames.length - 1, blocks: sec.flatMap((s) => s.blocks) })
  }
  return out
}

/** Fotogrammi da cui inizia un blocco (più la partenza): servono a PagSu/PagGiù. */
export function blockStarts(sections: readonly FrameSection[]): number[] {
  return [0, ...sections.flatMap((s) => s.blocks.map((b) => b.from))]
}

/** Prossimo (dir 1) o precedente (dir -1) inizio di blocco rispetto a `index`. */
export function stepBlock(starts: readonly number[], index: number, dir: 1 | -1): number {
  if (dir === 1) return starts.find((s) => s > index) ?? starts[starts.length - 1] ?? index
  for (let i = starts.length - 1; i >= 0; i--) if (starts[i]! < index) return starts[i]!
  return 0
}
