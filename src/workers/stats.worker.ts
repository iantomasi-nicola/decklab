/// <reference lib="webworker" />
/** Web Worker dello Stats Lab: enumerazione esatta delle mani e sensibilità, fuori dal thread della UI. */
import { analyze, type AnalyzeRequest, type HandResult, type SensitivityItem } from '@/domain/stats'

export type StatsWorkerIn = { id: number; req: AnalyzeRequest }
export type StatsWorkerOut =
  | { id: number; type: 'progress'; pct: number }
  | { id: number; type: 'hands'; hands: Record<number, HandResult> }
  | { id: number; type: 'item'; item: SensitivityItem }
  | { id: number; type: 'done'; sensitivity: SensitivityItem[] | null }
  | { id: number; type: 'error'; error: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<StatsWorkerIn>) => {
  const { id, req } = e.data
  try {
    const out = analyze(req, {
      onProgress: (pct) => ctx.postMessage({ id, type: 'progress', pct } satisfies StatsWorkerOut),
      onHands: (hands) => ctx.postMessage({ id, type: 'hands', hands } satisfies StatsWorkerOut),
      onSensitivityItem: (item) => ctx.postMessage({ id, type: 'item', item } satisfies StatsWorkerOut),
    })
    ctx.postMessage({ id, type: 'done', sensitivity: out.sensitivity } satisfies StatsWorkerOut)
  } catch (err) {
    ctx.postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) } satisfies StatsWorkerOut)
  }
}
