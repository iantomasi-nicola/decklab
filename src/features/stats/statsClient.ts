/**
 * Client del Web Worker dello Stats Lab. Due canali indipendenti (mani e sensibilità), ognuno con il suo worker e un solo calcolo alla volta:
 * se ne parte uno nuovo mentre l'altro gira, il worker viene terminato e ricreato (l'enumerazione è sincrona e non si può interrompere
 * altrimenti). Senza Worker (test) gira sul thread corrente.
 */
import { analyze, type AnalyzeRequest, type HandResult, type SensitivityItem } from '@/domain/stats'
import type { StatsWorkerIn, StatsWorkerOut } from '@/workers/stats.worker'

export interface AnalysisHandlers {
  onProgress?: (pct: number) => void
  onHands?: (hands: Record<number, HandResult>) => void
  /** Una voce di sensibilità appena pronta. */
  onItem?: (item: SensitivityItem) => void
  onDone?: (sensitivity: SensitivityItem[] | null) => void
  onError?: (message: string) => void
}

export type Channel = 'hands' | 'sens'

interface Slot {
  worker: Worker | null
  active: { id: number; handlers: AnalysisHandlers } | null
}
const slots: Record<Channel, Slot> = { hands: { worker: null, active: null }, sens: { worker: null, active: null } }
let seq = 0

function spawn(slot: Slot): Worker {
  const w = new Worker(new URL('../../workers/stats.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<StatsWorkerOut>) => {
    const m = e.data
    const a = slot.active
    if (!a || a.id !== m.id) return
    const h = a.handlers
    if (m.type === 'progress') h.onProgress?.(m.pct)
    else if (m.type === 'hands') h.onHands?.(m.hands)
    else if (m.type === 'item') h.onItem?.(m.item)
    else if (m.type === 'done') {
      slot.active = null
      h.onDone?.(m.sensitivity)
    } else {
      slot.active = null
      h.onError?.(m.error)
    }
  }
  w.onerror = (ev) => {
    const h = slot.active?.handlers
    slot.active = null
    h?.onError?.(ev.message || 'worker')
  }
  return w
}

/** Avvia un calcolo sul canale; restituisce la funzione per annullarlo. */
export function runAnalysis(req: AnalyzeRequest, handlers: AnalysisHandlers, channel: Channel = 'hands'): () => void {
  const id = ++seq
  if (typeof Worker === 'undefined') {
    let cancelled = false
    setTimeout(() => {
      if (cancelled) return
      try {
        const out = analyze(req, { onProgress: handlers.onProgress, onHands: handlers.onHands, onSensitivityItem: handlers.onItem })
        if (!cancelled) handlers.onDone?.(out.sensitivity)
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e.message : String(e))
      }
    }, 0)
    return () => {
      cancelled = true
    }
  }
  const slot = slots[channel]
  if (slot.active && slot.worker) {
    slot.worker.terminate() // il calcolo precedente è superato
    slot.worker = null
  }
  slot.worker ??= spawn(slot)
  slot.active = { id, handlers }
  slot.worker.postMessage({ id, req } satisfies StatsWorkerIn)
  return () => {
    if (slot.active?.id === id) {
      slot.active = null
      slot.worker?.terminate()
      slot.worker = null
    }
  }
}
