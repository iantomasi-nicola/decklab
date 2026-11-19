/** Logica pura della scelta dei bersagli (nessun DOM). Usata da `TargetPickerOverlay`; spec d'uso: docs/TURN-UI.md. */
import type { Uid } from './types'

export interface PickConfig {
  /** Carte tra cui scegliere (ordine = ordine di navigazione da tastiera). */
  candidates: readonly Uid[]
  /** Minimo da scegliere (default = max). */
  min?: number
  /** Massimo da scegliere (default 1). */
  max?: number
}

export interface PickState {
  readonly candidates: readonly Uid[]
  readonly min: number
  readonly max: number
  /** In ordine di selezione. */
  readonly selected: readonly Uid[]
}

export type PickToggleResult = { state: PickState; change: 'added' | 'removed' | 'replaced' | 'full' | 'ignored' }

export function normalizeLimits(cfg: PickConfig): { min: number; max: number } {
  const total = new Set(cfg.candidates).size
  const max = Math.max(1, Math.min(cfg.max ?? 1, Math.max(total, 1)))
  const min = Math.max(0, Math.min(cfg.min ?? max, max))
  return { min, max }
}

export function initPick(cfg: PickConfig, preselected: readonly Uid[] = []): PickState {
  const candidates = [...new Set(cfg.candidates)]
  const { min, max } = normalizeLimits({ ...cfg, candidates })
  const selected = preselected.filter((u, i) => candidates.includes(u) && preselected.indexOf(u) === i).slice(0, max)
  return { candidates, min, max, selected }
}

/**
 * Tocca una carta: se è scelta la toglie; se non lo è la aggiunge. Con max = 1 sostituisce la scelta precedente.
 * Con la selezione piena (max > 1) non aggiunge e restituisce `change: 'full'` (l'UI lo annuncia).
 */
export function togglePick(s: PickState, uid: Uid): PickToggleResult {
  if (!s.candidates.includes(uid)) return { state: s, change: 'ignored' }
  if (s.selected.includes(uid)) return { state: { ...s, selected: s.selected.filter((u) => u !== uid) }, change: 'removed' }
  if (s.max === 1) return { state: { ...s, selected: [uid] }, change: s.selected.length ? 'replaced' : 'added' }
  if (s.selected.length >= s.max) return { state: s, change: 'full' }
  return { state: { ...s, selected: [...s.selected, uid] }, change: 'added' }
}

/** Toglie l'ultima carta scelta (Backspace). */
export const undoPick = (s: PickState): PickState => (s.selected.length ? { ...s, selected: s.selected.slice(0, -1) } : s)
export const clearPick = (s: PickState): PickState => (s.selected.length ? { ...s, selected: [] } : s)
export const canConfirmPick = (s: PickState): boolean => s.selected.length >= s.min && s.selected.length <= s.max
/** Numero d'ordine (1-based) di una carta scelta, o 0 se non scelta. */
export const pickOrder = (s: PickState, uid: Uid): number => s.selected.indexOf(uid) + 1
/** Mancano ancora N scelte per il minimo (0 = ok). */
export const pickMissing = (s: PickState): number => Math.max(0, s.min - s.selected.length)

/** Descrizione del contatore "Scegli N di M" come dati (la lingua la applica l'UI). */
export interface PickCounter { min: number; max: number; total: number; chosen: number; range: boolean }
export const pickCounter = (s: PickState): PickCounter => ({
  min: s.min, max: s.max, total: s.candidates.length, chosen: s.selected.length, range: s.min !== s.max,
})

/** Candidato successivo/precedente (con avvolgimento) per la navigazione da tastiera. */
export function stepCandidate(s: PickState, from: Uid | undefined, dir: 1 | -1): Uid | undefined {
  const n = s.candidates.length
  if (!n) return undefined
  const i = from ? s.candidates.indexOf(from) : -1
  if (i < 0) return s.candidates[dir === 1 ? 0 : n - 1]
  return s.candidates[(i + dir + n) % n]
}
