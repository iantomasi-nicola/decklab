/**
 * Stato del turno derivato dai passi di una combo (riduttore puro, nessun motore).
 * Alimenta barra delle fasi, chip "Normal Summon fatta", contatori degli effetti "una volta per turno" e promemoria.
 * Spec: docs/COMBO_FORMAT.md §7; API di integrazione: docs/TURN-UI.md.
 *
 * Convenzioni:
 *  - indice di passo come `stateAt`: 0-based, -1 = stato iniziale (prima del primo passo).
 *  - fase iniziale di una combo = Main 1 (la mano è già pescata); dopo `endTurn` il turno successivo riparte da Main 1.
 *  - il documento non dice quali effetti siano "una volta per turno": per default lo sono gli effetti
 *    ignition/trigger/quick con `effect.index` noto (per copia: uid+indice). Il passo può precisare con `x.opt`:
 *    `false` (non OPT), `true`/`'card'` (OPT per copia), `'name'` (OPT per nome carta: tutte le copie con lo stesso passcode).
 */
import type { ActionKind, ComboDoc, EffectKind, Step, SummonMethod, Uid } from './types'
import { allStates, initialState, type GameState } from './state'

export type Phase = NonNullable<Step['phase']>
export const PHASES: readonly Phase[] = ['draw', 'standby', 'main1', 'battle', 'main2', 'end']
export const phaseIndex = (p: Phase): number => PHASES.indexOf(p)

export type TransitionKind = 'next' | 'skip'
export interface PhaseTransition { from: Phase; to: Phase; kind: TransitionKind }

/** Transizioni valide da una fase: la successiva ("next") e i salti ammessi ("skip"). Da End non si passa ad altre fasi (si termina il turno). */
export function legalTransitions(from: Phase): PhaseTransition[] {
  const t = (to: Phase, kind: TransitionKind): PhaseTransition => ({ from, to, kind })
  switch (from) {
    case 'draw': return [t('standby', 'next'), t('main1', 'skip')]
    case 'standby': return [t('main1', 'next')]
    case 'main1': return [t('battle', 'next'), t('main2', 'skip'), t('end', 'skip')]
    case 'battle': return [t('main2', 'next'), t('end', 'skip')]
    case 'main2': return [t('end', 'next')]
    case 'end': return []
  }
}
export const canTransition = (from: Phase, to: Phase): boolean => from === to || legalTransitions(from).some((x) => x.to === to)

export type EffectGroup = 'activation' | 'ignition' | 'trigger' | 'quick' | 'continuous' | 'other'
export const EFFECT_GROUPS: readonly EffectGroup[] = ['activation', 'ignition', 'quick', 'trigger', 'continuous', 'other']
export function effectGroup(kind: EffectKind | undefined): EffectGroup {
  switch (kind) {
    case 'activation': case 'ignition': case 'trigger': case 'quick': case 'continuous': return kind
    default: return 'other'
  }
}

export type OptScope = 'card' | 'name'
export interface EffectUse {
  /** Chiave di conteggio: `uid#indice` (per copia) o `nome:passcode#indice` (per nome carta). */
  key: string
  scope: OptScope
  /** Copie che hanno usato l'effetto (con scope 'name' possono essere più d'una). */
  uids: Uid[]
  code?: number
  /** Numero dell'effetto sulla carta (1-based); null se non noto. */
  index: number | null
  kind: EffectKind
  /** Quante volte è stato attivato in questo turno (> 1 = incoerenza con "una volta per turno"). */
  count: number
  stepIds: string[]
  firstStep: number
}

export type LogType = 'normalSummon' | 'tributeSummon' | 'setMonster' | 'flipSummon' | 'specialSummon' | 'pendulum' | 'effect' | 'attack' | 'phase' | 'turn'
export interface TurnLogEntry {
  type: LogType
  stepIndex: number
  stepId: string
  uid?: Uid
  code?: number
  kind?: EffectKind
  index?: number | null
  method?: SummonMethod
  phase?: Phase
  /** Solo per effetti: true se è un effetto "una volta per turno". */
  opt?: boolean
  /** Solo per effetti: true se è un secondo uso (violazione OPT). */
  repeat?: boolean
}

export interface PhaseLogEntry { from: Phase; to: Phase; stepIndex: number; stepId: string; valid: boolean; inferred: boolean }

export interface TurnState {
  /** Passo a cui si riferisce lo stato (-1 = iniziale). */
  stepIndex: number
  /** Numero del turno (1 = primo; +1 dopo ogni `endTurn`). */
  turn: number
  phase: Phase
  /** Transizioni di fase disponibili da qui (per i pulsanti della barra). */
  phaseTransitions: PhaseTransition[]
  /** Transizioni avvenute in questo turno. */
  phaseLog: PhaseLogEntry[]

  /** Diritto di Evocazione Normale/Posizione (Normale, Tributo e Calata condividono lo stesso diritto). */
  normalSummonUsed: boolean
  normalSummonsMax: number
  normalSummonsDone: number
  normalSummon?: { uid?: Uid; code?: number; stepIndex: number; type: 'normalSummon' | 'tributeSummon' | 'setMonster' }
  tributeSummonUsed: boolean
  setMonsterUsed: boolean
  flipSummons: number
  specialSummons: number
  specialByMethod: Partial<Record<SummonMethod, number>>
  pendulumSummonUsed: boolean

  /** Effetti "una volta per turno" usati (ordinati per primo uso). */
  optUses: EffectUse[]
  /** Quanti effetti OPT distinti sono stati usati. */
  optUsedCount: number
  /** Effetti OPT usati più di una volta (incoerenza da segnalare). */
  optOverused: EffectUse[]
  /** Tutte le attivazioni per tipo di effetto (OPT e non): numero di attivazioni e carte coinvolte. */
  activations: Record<EffectGroup, { count: number; uids: Uid[] }>

  /** Carte che hanno attaccato (ordine di primo attacco) e numero di attacchi per carta. */
  attacked: Uid[]
  attackCounts: Record<Uid, number>

  /** Segnalini sul campo in questo stato. */
  counters: GameState['counters']
  counterTotal: number

  /** Cosa è già stato fatto in questo turno, in ordine (per il promemoria). */
  log: TurnLogEntry[]
  /** True se l'ultimo passo è `endTurn`. */
  turnEnded: boolean
}

export interface TurnOptions {
  /** Fase iniziale della combo e di ogni turno successivo (default: main1). */
  startPhase?: Phase
}

type OptHint = boolean | OptScope | undefined

function optPolicy(step: Step): { opt: boolean; scope: OptScope } {
  const hint = (step.x as { opt?: OptHint } | undefined)?.opt
  if (hint === false) return { opt: false, scope: 'card' }
  if (hint === 'name') return { opt: true, scope: 'name' }
  if (hint === true || hint === 'card') return { opt: true, scope: 'card' }
  const k = step.effect?.kind
  const byKind = k === 'ignition' || k === 'trigger' || k === 'quick'
  return { opt: byKind && step.effect?.index !== undefined, scope: 'card' }
}

const emptyActivations = (): TurnState['activations'] =>
  Object.fromEntries(EFFECT_GROUPS.map((g) => [g, { count: 0, uids: [] as Uid[] }])) as TurnState['activations']

interface Acc {
  turn: number
  phase: Phase
  phaseLog: PhaseLogEntry[]
  normalDone: number
  normalMax: number
  normalSummon?: TurnState['normalSummon']
  tributeUsed: boolean
  setUsed: boolean
  flips: number
  specials: number
  specialByMethod: Partial<Record<SummonMethod, number>>
  pendulum: boolean
  uses: Map<string, EffectUse>
  activations: TurnState['activations']
  attacked: Uid[]
  attackCounts: Record<Uid, number>
  log: TurnLogEntry[]
  turnEnded: boolean
}

function freshAcc(turn: number, phase: Phase): Acc {
  return {
    turn, phase, phaseLog: [], normalDone: 0, normalMax: 1, tributeUsed: false, setUsed: false, flips: 0, specials: 0,
    specialByMethod: {}, pendulum: false, uses: new Map(), activations: emptyActivations(), attacked: [], attackCounts: {}, log: [], turnEnded: false,
  }
}

function moveTo(acc: Acc, to: Phase, i: number, step: Step, inferred: boolean) {
  if (to === acc.phase) return
  acc.phaseLog.push({ from: acc.phase, to, stepIndex: i, stepId: step.id, valid: canTransition(acc.phase, to), inferred })
  acc.log.push({ type: 'phase', stepIndex: i, stepId: step.id, phase: to })
  acc.phase = to
}

/** Applica un passo all'accumulatore (muta `acc`). `codeOf` risolve uid → passcode. */
function accStep(acc: Acc, step: Step, i: number, codeOf: (u: Uid) => number | undefined, opts: Required<TurnOptions>): Acc {
  let a = acc
  if (a.turnEnded) a = freshAcc(a.turn + 1, opts.startPhase)
  const code = step.card ? codeOf(step.card) : undefined

  // --- fase: esplicita (step.phase), oppure dedotta (enterPhase senza fase = successiva; attacco da Main = Battle)
  if (step.phase) moveTo(a, step.phase, i, step, false)
  else if (step.action === 'enterPhase') {
    const next = legalTransitions(a.phase).find((t) => t.kind === 'next')
    if (next) moveTo(a, next.to, i, step, true)
  } else if (step.action === 'attack' && phaseIndex(a.phase) < phaseIndex('battle')) moveTo(a, 'battle', i, step, true)

  const act: ActionKind = step.action
  const base = { stepIndex: i, stepId: step.id, ...(step.card ? { uid: step.card } : {}), ...(code !== undefined ? { code } : {}) }
  switch (act) {
    case 'normalSummon': case 'tributeSummon': case 'setMonster': {
      a.normalDone++
      if (act === 'tributeSummon') a.tributeUsed = true
      if (act === 'setMonster') a.setUsed = true
      a.normalSummon ??= { ...(step.card ? { uid: step.card } : {}), ...(code !== undefined ? { code } : {}), stepIndex: i, type: act }
      a.log.push({ type: act, ...base })
      break
    }
    case 'flipSummon': a.flips++; a.log.push({ type: act, ...base }); break
    case 'specialSummon': {
      a.specials++
      const m = step.method
      if (m) a.specialByMethod[m] = (a.specialByMethod[m] ?? 0) + 1
      if (m === 'pendulum') a.pendulum = true
      a.log.push({ type: m === 'pendulum' ? 'pendulum' : 'specialSummon', ...base, ...(m ? { method: m } : {}) })
      break
    }
    case 'attack': {
      if (step.card) {
        if (!a.attacked.includes(step.card)) a.attacked.push(step.card)
        a.attackCounts[step.card] = (a.attackCounts[step.card] ?? 0) + 1
      }
      a.log.push({ type: 'attack', ...base })
      break
    }
    case 'endTurn': a.turnEnded = true; a.log.push({ type: 'turn', ...base }); break
    case 'activate': case 'chainActivate': {
      if (step.card && step.effect) {
        const g = effectGroup(step.effect.kind)
        a.activations[g].count++
        if (!a.activations[g].uids.includes(step.card)) a.activations[g].uids.push(step.card)
        const { opt, scope } = optPolicy(step)
        const index = step.effect.index ?? null
        let repeat = false
        if (opt) {
          const key = scope === 'name' && code !== undefined ? `nome:${code}#${index ?? '?'}` : `${step.card}#${index ?? '?'}`
          const prev = a.uses.get(key)
          if (prev) {
            prev.count++
            prev.stepIds.push(step.id)
            if (!prev.uids.includes(step.card)) prev.uids.push(step.card)
            repeat = true
          } else {
            a.uses.set(key, { key, scope, uids: [step.card], ...(code !== undefined ? { code } : {}), index, kind: step.effect.kind, count: 1, stepIds: [step.id], firstStep: i })
          }
        }
        a.log.push({ type: 'effect', ...base, kind: step.effect.kind, index, opt, repeat })
      }
      break
    }
    default: break
  }
  const extra = (step.x as { extraNormalSummon?: number } | undefined)?.extraNormalSummon
  if (typeof extra === 'number' && extra > 0) a.normalMax += Math.floor(extra)
  return a
}

function snapshot(a: Acc, i: number, gs: GameState): TurnState {
  const optUses = [...a.uses.values()].sort((x, y) => x.firstStep - y.firstStep).map((u) => ({ ...u, uids: [...u.uids], stepIds: [...u.stepIds] }))
  let counterTotal = 0
  for (const c of Object.values(gs.counters)) for (const n of Object.values(c)) counterTotal += n
  const activations = Object.fromEntries(EFFECT_GROUPS.map((g) => [g, { count: a.activations[g].count, uids: [...a.activations[g].uids] }])) as TurnState['activations']
  return {
    stepIndex: i,
    turn: a.turn,
    phase: a.phase,
    phaseTransitions: a.turnEnded ? [] : legalTransitions(a.phase),
    phaseLog: [...a.phaseLog],
    normalSummonUsed: a.normalDone >= a.normalMax,
    normalSummonsMax: a.normalMax,
    normalSummonsDone: a.normalDone,
    ...(a.normalSummon ? { normalSummon: { ...a.normalSummon } } : {}),
    tributeSummonUsed: a.tributeUsed,
    setMonsterUsed: a.setUsed,
    flipSummons: a.flips,
    specialSummons: a.specials,
    specialByMethod: { ...a.specialByMethod },
    pendulumSummonUsed: a.pendulum,
    optUses,
    optUsedCount: optUses.length,
    optOverused: optUses.filter((u) => u.count > 1),
    activations,
    attacked: [...a.attacked],
    attackCounts: { ...a.attackCounts },
    counters: gs.counters,
    counterTotal,
    log: [...a.log],
    turnEnded: a.turnEnded,
  }
}

const withDefaults = (o?: TurnOptions): Required<TurnOptions> => ({ startPhase: o?.startPhase ?? 'main1' })

/** Tutti gli stati del turno della linea principale: `out[k]` = stato dopo k passi (`out[0]` = iniziale, quindi stepIndex = k - 1). */
export function turnTimeline(doc: ComboDoc, options?: TurnOptions, branchId?: string): TurnState[] {
  const opts = withDefaults(options)
  const codeOf = (u: Uid) => doc.cards[u]
  const states = allStates(doc)
  const mainStates = states.main
  let steps: Step[] = doc.steps
  let acc = freshAcc(1, opts.startPhase)
  const out: TurnState[] = []
  const gsAt = (arr: GameState[], k: number) => arr[Math.min(k, arr.length - 1)] ?? initialState(doc)
  if (branchId) {
    const b = doc.branches.find((x) => x.id === branchId)
    if (!b) throw new Error(`branch not found: ${branchId}`)
    const idx = doc.steps.findIndex((s) => s.id === b.condition.afterStep)
    // stato del turno al punto di diramazione, poi i passi del ramo
    for (let i = 0; i <= idx; i++) {
      acc = accStep(acc, doc.steps[i]!, i, codeOf, opts)
      if (i === idx) break
    }
    const bs = states.branches[branchId] ?? [mainStates[0]!]
    out.push(snapshot(acc, -1, gsAt(bs, 0)))
    steps = b.steps
    steps.forEach((s, i) => {
      acc = accStep(acc, s, i, codeOf, opts)
      out.push(snapshot(acc, i, gsAt(bs, i + 1)))
    })
    return out
  }
  out.push(snapshot(acc, -1, mainStates[0] ?? initialState(doc)))
  steps.forEach((s, i) => {
    acc = accStep(acc, s, i, codeOf, opts)
    out.push(snapshot(acc, i, gsAt(mainStates, i + 1)))
  })
  return out
}

/** Stato del turno dopo il passo `stepIndex` (0-based; -1 = iniziale). Indici fuori range vengono limitati. Con `branchId` indica il passo del ramo. */
export function turnStateAt(doc: ComboDoc, stepIndex: number, options?: TurnOptions, branchId?: string): TurnState {
  const tl = turnTimeline(doc, options, branchId)
  return tl[Math.min(Math.max(stepIndex + 1, 0), tl.length - 1)]!
}

/** Disponibilità di un effetto nello stato corrente (per il segno "usato/disponibile" sulla carta). */
export interface EffectAvailability { used: boolean; count: number; byName: boolean; use?: EffectUse }
export function effectAvailability(ts: TurnState, q: { uid: Uid; code?: number; index: number | null }): EffectAvailability {
  const use = ts.optUses.find((u) =>
    u.index === q.index && (u.scope === 'card' ? u.uids.includes(q.uid) : q.code !== undefined && u.code === q.code))
  return use ? { used: true, count: use.count, byName: use.scope === 'name', use } : { used: false, count: 0, byName: false }
}

/** Effetti OPT di una carta già usati (per la marcatura sulla carta). */
export function usesOfCard(ts: TurnState, uid: Uid, code?: number): EffectUse[] {
  return ts.optUses.filter((u) => (u.scope === 'card' ? u.uids.includes(uid) : code !== undefined && u.code === code))
}

export interface PhaseWarning { stepId: string; stepIndex: number; from: Phase; to: Phase }
/** Transizioni di fase non valide nella linea principale (es. Battle → Main 1): avvisi per la validazione. */
export function phaseWarnings(doc: ComboDoc, options?: TurnOptions): PhaseWarning[] {
  const tl = turnTimeline(doc, options)
  const seen = new Set<string>()
  const out: PhaseWarning[] = []
  for (const ts of tl) {
    for (const e of ts.phaseLog) {
      if (!e.valid && !seen.has(`${e.stepId}`)) {
        seen.add(e.stepId)
        out.push({ stepId: e.stepId, stepIndex: e.stepIndex, from: e.from, to: e.to })
      }
    }
  }
  return out
}
