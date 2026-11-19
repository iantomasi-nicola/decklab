import { computeHand } from './hand'
import { sensitivity, sensitivitySteps } from './sensitivity'
import type { HandInput, HandResult, SensitivityItem } from './types'

export interface AnalyzeRequest {
  input: HandInput
  /** Dimensioni di mano da calcolare con tutti i dettagli (di solito 5 e 6). */
  handSizes: number[]
  /** Se presente, calcola anche la sensibilità per questa mano. */
  sensitivityHand?: number | null
}

export interface AnalyzeCallbacks {
  onHands?: (hands: Record<number, HandResult>) => void
  /** 0..100 */
  onProgress?: (pct: number) => void
}

export interface AnalyzeResult {
  hands: Record<number, HandResult>
  sensitivity: SensitivityItem[] | null
}

/** Calcolo completo, sincrono (gira nel Web Worker). `onHands` arriva appena pronte le mani, prima della sensibilità. */
export function analyze(req: AnalyzeRequest, cb: AnalyzeCallbacks = {}): AnalyzeResult {
  const sens = req.sensitivityHand ?? null
  const total = req.handSizes.length + (sens ? sensitivitySteps(req.input) : 0)
  let done = 0
  const tick = () => {
    done++
    cb.onProgress?.(Math.min(100, Math.round((done / total) * 100)))
  }
  const hands: Record<number, HandResult> = {}
  for (const h of req.handSizes) {
    hands[h] = computeHand(req.input, h, { detail: true })
    tick()
  }
  cb.onHands?.(hands)
  const sensitivityResult = sens ? sensitivity(req.input, sens, tick) : null
  cb.onProgress?.(100)
  return { hands, sensitivity: sensitivityResult }
}
