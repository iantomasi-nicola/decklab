/** Tipi puri del Side plan (nessuna dipendenza da React/DOM/Dexie). Le carte sono sempre identificate dal passcode canonico (alias → carta base). */
import type { Meta } from '../types'

export interface SideCount {
  /** Passcode canonico (carta base). */
  cardId: number
  count: number
}

/** `first` = piano per quando giochi per primo, `second` = per secondo. */
export type SideTurn = 'first' | 'second'

export interface SideMatchup {
  name: string
  /** Archetipo dell'avversario (testo libero, usato dai suggerimenti insieme ai tag). */
  archetype?: string
  note: string
  turn: SideTurn
}

/** Dati del piano senza i metadati di sync (quello che le funzioni pure leggono). */
export interface SidePlanData {
  matchup: SideMatchup
  outs: SideCount[]
  ins: SideCount[]
}

/** Record sincronizzato (tabella `sidePlans`). */
export interface SidePlan extends Meta, SidePlanData {
  variantId: string
}

export type SideIssueCode =
  | 'empty'
  | 'unbalanced'
  | 'out-unavailable'
  | 'in-unavailable'
  | 'main-size'
  | 'side-size'
  | 'too-many-copies'
  | 'legality'

export interface SideIssue {
  code: SideIssueCode
  severity: 'error' | 'warning'
  cardId?: number
  /** `unbalanced`: missing (quante carte mancano), side ('out' | 'in'); `legality`: legalityCode ecc. */
  params: Record<string, number | string>
}

export interface SideSummary {
  outCount: number
  inCount: number
  mainAfter: number
  sideAfter: number
  balanced: boolean
}

export interface SideValidation {
  issues: SideIssue[]
  summary: SideSummary
  /** Nessun errore e almeno uno scambio. */
  ok: boolean
}
