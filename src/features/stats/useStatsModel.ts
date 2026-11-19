import { useEffect, useMemo, useRef, useState } from 'react'
import type { Variant } from '@/domain/types'
import { repos } from '@/data/repo'
import { comboToRule, type AnalyzeRequest, type HandInput, type HandResult, type SensitivityItem, type StatsCard } from '@/domain/stats'
import { useCards } from '@/features/decks/cardData'
import { useObservable } from '@/features/decks/useObservable'
import { runAnalysis } from './statsClient'
import { useSavedStats, type SavedStats } from './statsStore'

export interface DeckRow {
  id: number
  count: number
}

/** Main della variante raggruppato per carta base (alias → carta base), nell'ordine di prima comparsa. */
export function deckRows(variant: Variant | undefined, canonical: (id: number) => number): DeckRow[] {
  const rows = new Map<number, number>()
  for (const raw of variant?.deck.main ?? []) {
    const id = canonical(raw)
    rows.set(id, (rows.get(id) ?? 0) + 1)
  }
  return [...rows].map(([id, count]) => ({ id, count }))
}

export function buildInput(rows: DeckRow[], saved: SavedStats, extraRules: number[][]): HandInput {
  const cards: StatsCard[] = rows.map((r) => {
    const p = saved.partners[String(r.id)]
    return { id: r.id, count: r.count, tags: saved.tags[String(r.id)] ?? [], comboWith: p?.combo ?? [], brickWith: p?.brick ?? [] }
  })
  return {
    cards,
    labels: saved.labels,
    extraRules: saved.useCombos ? extraRules : [],
    assumedDeckSize: saved.settings.useAssumedDeckSize ? saved.settings.assumedDeckSize : null,
  }
}

export interface Analysis {
  hands: Record<number, HandResult> | null
  sensitivity: SensitivityItem[] | null
  progress: number
  running: boolean
  error: string | null
}

/** Esegue l'analisi nel worker (con debounce) ogni volta che cambia l'input. */
export function useAnalysis(input: HandInput | null, sensitivityHand: number, wantSensitivity: boolean): Analysis {
  const [state, setState] = useState<Analysis>({ hands: null, sensitivity: null, progress: 0, running: false, error: null })
  const key = useMemo(() => (input ? JSON.stringify({ input, sensitivityHand, wantSensitivity }) : ''), [input, sensitivityHand, wantSensitivity])
  const first = useRef(true)
  useEffect(() => {
    if (!input) {
      setState({ hands: null, sensitivity: null, progress: 0, running: false, error: null })
      return
    }
    const req: AnalyzeRequest = { input, handSizes: [5, 6], sensitivityHand: wantSensitivity ? sensitivityHand : null }
    setState((s) => ({ ...s, running: true, progress: 0, error: null, sensitivity: wantSensitivity ? null : s.sensitivity }))
    let cancel = () => {}
    const delay = first.current ? 0 : 200
    first.current = false
    const timer = setTimeout(() => {
      cancel = runAnalysis(req, {
        onProgress: (progress) => setState((s) => ({ ...s, progress })),
        onHands: (hands) => setState((s) => ({ ...s, hands })),
        onDone: (sensitivity) => setState((s) => ({ ...s, sensitivity: sensitivity ?? s.sensitivity, running: false, progress: 100 })),
        onError: (error) => setState((s) => ({ ...s, running: false, error })),
      })
    }, delay)
    return () => {
      clearTimeout(timer)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export function useStatsModel(variantId: string | null) {
  const cards = useCards()
  const variant = useObservable(() => repos.variants.watch(variantId ?? ''), [variantId])
  const combos = useObservable(() => repos.combos.watchByArchetype(variant.value?.archetypeId ?? ''), [variant.value?.archetypeId])
  const { saved, loaded, update } = useSavedStats(variantId)
  const canonical = cards.status === 'ready' ? cards.index.canonicalId : (id: number) => id
  const ready = cards.status === 'ready'

  const rows = useMemo(() => deckRows(variant.value, canonical), [variant.value, canonical])
  const extraRules = useMemo(() => {
    const out: number[][] = []
    for (const c of combos.value ?? []) {
      if (c.variantId !== null && c.variantId !== variantId) continue
      const r = comboToRule(c.payload, canonical)
      if (r) out.push(r)
    }
    return out
  }, [combos.value, variantId, canonical])
  const input = useMemo(() => (variant.value && loaded ? buildInput(rows, saved, extraRules) : null), [variant.value, loaded, rows, saved, extraRules])

  return { cards, ready, variant: variant.value, variantLoaded: variant.loaded, rows, saved, update, input, extraRuleCount: extraRules.length, canonical }
}
