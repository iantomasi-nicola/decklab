/** Controllo coerenza combo (logica pura). I codici sono chiavi i18n `smart.coherence.*`. */
import type { ComboDoc, Loc, Step, Uid } from '../combo/types'
import { applyStep, initialState, type GameState } from '../combo/state'

export type CoherenceCode =
  | 'smart.coherence.unknownUid'
  | 'smart.coherence.cardNotAvailable'
  | 'smart.coherence.materialNotOnField'
  | 'smart.coherence.targetMissing'
  | 'smart.coherence.wrongSource'
  | 'smart.coherence.oncePerTurn'
  | 'smart.coherence.afterEndTurn'
  | 'smart.coherence.branchMissingStep'

export interface CoherenceSuggestion {
  /** chiave i18n `smart.coherence.fix.*` */
  code: string
  params: Record<string, number | string>
}

export interface CoherenceIssue {
  code: CoherenceCode
  severity: 'error' | 'warning'
  /** id del passo (per `branchMissingStep`: id del ramo in `branchId`, stepId = afterStep mancante) */
  stepId: string
  branchId?: string
  params: Record<string, number | string>
  suggestion?: CoherenceSuggestion
}

const FIELD: readonly Loc[] = ['mzone', 'emz', 'szone', 'fzone']
const OPT_KINDS = new Set(['activation', 'ignition', 'trigger', 'quick'])
const USE_ACTIONS = new Set(['normalSummon', 'tributeSummon', 'setMonster', 'flipSummon', 'specialSummon', 'activate', 'setSpellTrap', 'chainActivate', 'attack', 'changePosition', 'equip', 'attach', 'detach'])

type NameOf = (code: number) => string

export function checkCoherence(doc: ComboDoc, nameOf?: NameOf): CoherenceIssue[] {
  const issues: CoherenceIssue[] = []
  const state0 = initialState(doc)
  const extraCodes = new Set(doc.deck.extra)
  const nm = (uid: Uid) => {
    const code = doc.cards[uid]
    return code === undefined ? uid : (nameOf?.(code) ?? String(code))
  }
  const cp = (uid: Uid): Record<string, number | string> => ({ uid, code: doc.cards[uid] ?? 0, name: nm(uid) })

  function run(steps: Step[], start: GameState, used0: Set<string>, branchId?: string): void {
    let state = start
    const used = new Set(used0)
    let ended = false
    for (const step of steps) {
      const add = (i: Omit<CoherenceIssue, 'stepId' | 'branchId'>) =>
        issues.push({ ...i, stepId: step.id, ...(branchId ? { branchId } : {}) })
      if (ended) {
        add({ code: 'smart.coherence.afterEndTurn', severity: 'error', params: { action: step.action }, suggestion: { code: 'smart.coherence.fix.removeStep', params: {} } })
      }
      const moved = new Set(step.moves.map((m) => m.uid))
      // carta protagonista disponibile
      if (step.card !== undefined && USE_ACTIONS.has(step.action)) {
        const uid = step.card
        if (doc.cards[uid] === undefined) {
          add({ code: 'smart.coherence.unknownUid', severity: 'error', params: { uid } })
        } else if (!uid.startsWith('o') && !state.places[uid] && !extraCodes.has(doc.cards[uid]!)) {
          add({ code: 'smart.coherence.cardNotAvailable', severity: 'error', params: cp(uid), suggestion: { code: 'smart.coherence.fix.addSearch', params: { name: nm(uid) } } })
        }
      }
      // bersagli
      for (const uid of step.targets ?? []) {
        if (doc.cards[uid] === undefined || (!state.places[uid] && !moved.has(uid)))
          add({ code: 'smart.coherence.targetMissing', severity: 'error', params: cp(uid) })
      }
      // movimenti
      for (const m of step.moves) {
        const cur = state.places[m.uid]
        if (m.why === 'material' || m.why === 'tribute') {
          const ok = cur && (FIELD.includes(cur.loc) || (cur.loc === 'hand' && step.method === 'ritual'))
          if (!ok) add({ code: 'smart.coherence.materialNotOnField', severity: 'error', params: { ...cp(m.uid), loc: cur?.loc ?? 'unrevealed' }, suggestion: { code: 'smart.coherence.fix.summonFirst', params: { name: nm(m.uid) } } })
          continue
        }
        if (m.from && cur && (m.from.loc !== cur.loc || (m.from.p ?? cur.p) !== cur.p))
          add({ code: 'smart.coherence.wrongSource', severity: 'error', params: { ...cp(m.uid), declared: m.from.loc, actual: cur.loc }, suggestion: { code: 'smart.coherence.fix.useActualSource', params: { loc: cur.loc } } })
      }
      // una volta per turno
      if (step.card && step.effect?.index !== undefined && OPT_KINDS.has(step.effect.kind) && (step.action === 'activate' || step.action === 'chainActivate')) {
        const code = doc.cards[step.card]
        if (code !== undefined && !step.card.startsWith('o')) {
          const key = `${code}:${step.effect.index}`
          if (used.has(key))
            add({ code: 'smart.coherence.oncePerTurn', severity: 'warning', params: { ...cp(step.card), index: step.effect.index }, suggestion: { code: 'smart.coherence.fix.checkEffectIndex', params: { index: step.effect.index } } })
          used.add(key)
        }
      }
      if (step.action === 'endTurn') ended = true
      state = applyStep(state, step)
    }
  }

  run(doc.steps, state0, new Set())
  for (const b of doc.branches) {
    const idx = doc.steps.findIndex((s) => s.id === b.condition.afterStep)
    if (idx < 0) {
      issues.push({ code: 'smart.coherence.branchMissingStep', severity: 'error', stepId: b.condition.afterStep, branchId: b.id, params: { branch: b.id, afterStep: b.condition.afterStep }, suggestion: { code: 'smart.coherence.fix.removeBranch', params: { branch: b.id } } })
      continue
    }
    let st = state0
    const used = new Set<string>()
    for (const s of doc.steps.slice(0, idx + 1)) {
      st = applyStep(st, s)
      if (s.card && s.effect?.index !== undefined && OPT_KINDS.has(s.effect.kind) && (s.action === 'activate' || s.action === 'chainActivate') && doc.cards[s.card] !== undefined)
        used.add(`${doc.cards[s.card]}:${s.effect.index}`)
    }
    run(b.steps, st, used, b.id)
  }
  return issues
}
