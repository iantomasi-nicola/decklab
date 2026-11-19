/**
 * Client del Web Worker dello Stats Lab. Un solo calcolo alla volta: se ne parte uno nuovo mentre l'altro gira, il worker viene
 * terminato e ricreato (l'enumerazione è sincrona e non si può interrompere altrimenti). Senza Worker (test) gira sul thread corrente.
 */
import { analyze, type AnalyzeRequest, type HandResult, type SensitivityItem } from '@/domain/stats'
import type { StatsWorkerIn, StatsWorkerOut } from '@/workers/stats.worker'

export interface AnalysisHandlers {
  onProgress?: (pct: number) => void
  onHands?: (hands: Record<number, HandResult>) => void
  onDone?: (sensitivity: SensitivityItem[] | null) => void
  onError?: (message: string) => void
}

let worker: Worker | null = null
let seq = 0
let active: { id: number; handlers: AnalysisHandlers } | null = null

function spawn(): Worker {
  const w = new Worker(new URL('../../workers/stats.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<StatsWorkerOut>) => {
    const m = e.data
    if (!active || active.id !== m.id) return
    const h = active.handlers
    if (m.type === 'progress') h.onProgress?.(m.pct)
    else if (m.type === 'hands') h.onHands?.(m.hands)
    else if (m.type === 'done') {
      active = null
      h.onDone?.(m.sensitivity)
    } else {
      active = null
      h.onError?.(m.error)
    }
  }
  w.onerror = (ev) => {
    const h = active?.handlers
    active = null
    h?.onError?.(ev.message || 'worker')
  }
  return w
}

/** Avvia un calcolo; restituisce la funzione per annullarlo. */
export function runAnalysis(req: AnalyzeRequest, handlers: AnalysisHandlers): () => void {
  const id = ++seq
  if (typeof Worker === 'undefined') {
    let cancelled = false
    setTimeout(() => {
      if (cancelled) return
      try {
        const out = analyze(req, { onProgress: handlers.onProgress, onHands: handlers.onHands })
        if (!cancelled) handlers.onDone?.(out.sensitivity)
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e.message : String(e))
      }
    }, 0)
    return () => {
      cancelled = true
    }
  }
  if (active && worker) {
    worker.terminate() // il calcolo precedente è superato
    worker = null
  }
  worker ??= spawn()
  active = { id, handlers }
  worker.postMessage({ id, req } satisfies StatsWorkerIn)
  return () => {
    if (active?.id === id) {
      active = null
      worker?.terminate()
      worker = null
    }
  }
}
