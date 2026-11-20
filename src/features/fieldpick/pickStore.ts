/**
 * Stato condiviso della selezione sul campo: chi sceglie (richiesta del core o editor manuale) pubblica qui i candidati e le carte
 * scelte; il `Field` le legge per evidenziare sul posto (anello sui candidati, resto attenuato, numero d'ordine sulle scelte) e
 * i gestori dei tocchi inoltrano qui il tocco su una carta.
 */
import { create } from 'zustand'
import type { Uid } from '@/domain/combo/types'

export interface FieldPickSpec {
  candidates: ReadonlySet<Uid>
  chosen: ReadonlySet<Uid>
  /** posizione (1 = prima) delle carte scelte */
  order: ReadonlyMap<Uid, number>
  /** mostra il numero d'ordine (più di una scelta possibile) invece della spunta */
  numbered: boolean
  toggle: (uid: Uid) => void
}

export const usePickUi = create<{ spec: FieldPickSpec | null }>(() => ({ spec: null }))

/** Il tocco su una carta: true = c'è una selezione attiva e il tocco è stato gestito qui (anche se non era un candidato). */
export function pickClick(uid: Uid): boolean {
  const s = usePickUi.getState().spec
  if (!s) return false
  if (s.candidates.has(uid)) s.toggle(uid)
  return true
}

export const isPicking = (): boolean => usePickUi.getState().spec !== null
