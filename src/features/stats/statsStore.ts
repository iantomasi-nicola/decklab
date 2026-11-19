/** Persistenza di ruoli, partner ed etichette: una impostazione (tabella `settings`, sincronizzata) per variante. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { repos } from '@/data/repo'
import { DEFAULT_SETTINGS, type Label, type StatsSettings, type TournamentPlan } from '@/domain/stats'

export interface Partners {
  combo: number[]
  brick: number[]
  forbidden: number[]
  draw: number[]
  garnet: number[]
}

export interface SavedStats {
  v: 1
  /** passcode della carta base → ruoli */
  tags: Record<string, string[]>
  partners: Record<string, Partners>
  labels: Record<string, Label>
  settings: StatsSettings
  /** Considera PLAYABLE anche le mani richieste dalle combo salvate. */
  useCombos: boolean
  tournament: { plan: TournamentPlan; k: number }
}

export const emptySaved = (): SavedStats => ({
  v: 1,
  tags: {},
  partners: {},
  labels: {},
  settings: { ...DEFAULT_SETTINGS },
  useCombos: true,
  tournament: { plan: 'mixed', k: 1 },
})

export const savedKey = (variantId: string) => `stats.v1.${variantId}`

/** Normalizza un valore letto dal DB (può venire da un'altra versione o da un altro dispositivo). */
export function normalizeSaved(raw: unknown): SavedStats {
  const base = emptySaved()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Partial<SavedStats>
  return {
    v: 1,
    tags: typeof r.tags === 'object' && r.tags ? r.tags : base.tags,
    partners: typeof r.partners === 'object' && r.partners ? r.partners : base.partners,
    labels: typeof r.labels === 'object' && r.labels ? r.labels : base.labels,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    useCombos: r.useCombos ?? true,
    tournament: { ...base.tournament, ...(r.tournament ?? {}) },
  }
}

/** Stato salvato della variante: lettura live, scrittura immediata (con aggiornamento ottimistico). */
export function useSavedStats(variantId: string | null): {
  saved: SavedStats
  loaded: boolean
  update: (fn: (s: SavedStats) => SavedStats) => void
} {
  const [saved, setSaved] = useState<SavedStats>(emptySaved)
  const [loaded, setLoaded] = useState(false)
  const lastWritten = useRef<string>('')
  const current = useRef(saved)
  current.current = saved

  useEffect(() => {
    setLoaded(false)
    setSaved(emptySaved())
    lastWritten.current = ''
    if (!variantId) return
    const sub = repos.settings.watch(savedKey(variantId)).subscribe({
      next: (value) => {
        const json = JSON.stringify(value ?? null)
        if (json === lastWritten.current) {
          setLoaded(true)
          return
        }
        lastWritten.current = json
        setSaved(normalizeSaved(value))
        setLoaded(true)
      },
      error: () => setLoaded(true),
    })
    return () => sub.unsubscribe()
  }, [variantId])

  const update = useCallback(
    (fn: (s: SavedStats) => SavedStats) => {
      if (!variantId) return
      const next = fn(current.current)
      current.current = next
      setSaved(next)
      lastWritten.current = JSON.stringify(next)
      void repos.settings.set(savedKey(variantId), next)
    },
    [variantId],
  )

  return { saved, loaded, update }
}
