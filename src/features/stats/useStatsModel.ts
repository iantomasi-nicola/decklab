import { useEffect, useMemo, useRef, useState } from 'react'
import type { Variant } from '@/domain/types'
import { repos } from '@/data/repo'
import { comboToRule, sortByImpact, type HandInput, type HandResult, type SensitivityItem, type StatsCard } from '@/domain/stats'
import { useCards } from '@/features/decks/cardData'
import { useObservable } from '@/features/decks/useObservable'
import { runAnalysis, type Channel } from './statsClient'
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

/** Carte del Side raggruppate per carta base. */
export function sideRowsOf(variant: Variant | undefined, canonical: (id: number) => number): DeckRow[] {
  const rows = new Map<number, number>()
  for (const raw of variant?.deck.side ?? []) {
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
  progress: number
  running: boolean
  error: string | null
}

/** Mani 5 e 6 con tutti i dettagli, nel worker (con debounce), a ogni cambio dell'input. */
export function useAnalysis(input: HandInput | null, channel: Channel = 'hands'): Analysis {
  const [state, setState] = useState<Analysis>({ hands: null, progress: 0, running: false, error: null })
  const key = useMemo(() => (input ? JSON.stringify(input) : ''), [input])
  const first = useRef(true)
  useEffect(() => {
    if (!input) {
      setState({ hands: null, progress: 0, running: false, error: null })
      return
    }
    setState((s) => ({ ...s, running: true, progress: 0, error: null }))
    let cancel = () => {}
    const delay = first.current ? 0 : 150
    first.current = false
    const timer = setTimeout(() => {
      cancel = runAnalysis(
        { input, handSizes: [5, 6], sensitivityHand: null },
        {
          onProgress: (progress) => setState((s) => ({ ...s, progress })),
          onHands: (hands) => setState((s) => ({ ...s, hands })),
          onDone: () => setState((s) => ({ ...s, running: false, progress: 100 })),
          onError: (error) => setState((s) => ({ ...s, running: false, error })),
        },
        channel,
      )
    }, delay)
    return () => {
      clearTimeout(timer)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export interface SensitivityState {
  /** Voci già pronte, ordinate per impatto (arrivano man mano). */
  items: SensitivityItem[]
  /** Voci attese in totale (carte engine + riempimento), per l'avanzamento. */
  progress: number
  running: boolean
  /** Interrotto dall'utente: `items` è parziale. */
  cancelled: boolean
  error: string | null
  cancel: () => void
  restart: () => void
}

const cache = new Map<string, SensitivityItem[]>()
const CACHE_MAX = 8

/** Sensibilità in un worker a parte: risultati parziali, annullabile, con cache per (mazzo, mano). */
export function useSensitivity(input: HandInput | null, handSize: number, enabled: boolean): SensitivityState {
  const [items, setItems] = useState<SensitivityItem[]>([])
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const cancelRef = useRef<() => void>(() => {})
  const force = useRef(false)
  const key = useMemo(() => (input && enabled ? JSON.stringify({ input, handSize }) : ''), [input, handSize, enabled])

  useEffect(() => {
    if (!input || !key) return
    const hit = cache.get(key)
    const forced = force.current
    force.current = false
    if (hit && !forced) {
      setItems(hit)
      setProgress(100)
      setRunning(false)
      setCancelled(false)
      setError(null)
      return
    }
    setItems([])
    setProgress(0)
    setRunning(true)
    setCancelled(false)
    setError(null)
    let stopped = false
    let cancel = () => {}
    const timer = setTimeout(() => {
      const partial: SensitivityItem[] = []
      cancel = runAnalysis(
        { input, handSizes: [], sensitivityHand: handSize },
        {
          onProgress: setProgress,
          onItem: (item) => {
            partial.push(item)
            setItems(sortByImpact(partial))
          },
          onDone: (final) => {
            if (stopped || !final) return
            setItems(final)
            setRunning(false)
            cache.set(key, final)
            if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
          },
          onError: (e) => {
            setError(e)
            setRunning(false)
          },
        },
        'sens',
      )
      cancelRef.current = () => {
        stopped = true
        cancel()
        setRunning(false)
        setCancelled(true)
      }
    }, 200)
    return () => {
      stopped = true
      clearTimeout(timer)
      cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  return {
    items,
    progress,
    running,
    cancelled,
    error,
    cancel: () => cancelRef.current(),
    restart: () => {
      force.current = true
      setNonce((n) => n + 1)
    },
  }
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

  const sideRows = useMemo(() => sideRowsOf(variant.value, canonical), [variant.value, canonical])

  return { cards, ready, variant: variant.value, variantLoaded: variant.loaded, rows, sideRows, saved, update, input, extraRuleCount: extraRules.length, canonical }
}
