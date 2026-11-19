import { useCallback, useEffect, useRef, useState } from 'react'
import { repos } from '@/data/repo'
import type { SidePlan, SidePlanData } from '@/domain/side'

const pick = (p: SidePlan | SidePlanData): SidePlanData => ({ matchup: p.matchup, outs: p.outs, ins: p.ins })
const sig = (p: SidePlanData) => JSON.stringify(pick(p))

const WRITE_DELAY_MS = 250

/**
 * Copia locale del piano: i tocchi si vedono subito (nessuna attesa del database) e la scrittura avviene
 * dopo una breve pausa, in coda a quelle di testo. Le modifiche arrivate da fuori (sync) sostituiscono la copia
 * solo se non ci sono modifiche locali in sospeso.
 */
export function usePlanDraft(record: SidePlan) {
  const [draft, setDraft] = useState<SidePlanData>(() => pick(record))
  const ref = useRef(draft)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const id = record.id

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    const d = ref.current
    void repos.sidePlans.update(id, { matchup: d.matchup, outs: d.outs, ins: d.ins })
  }, [id])

  useEffect(() => {
    if (dirty.current) return
    if (sig(record) !== sig(ref.current)) {
      ref.current = pick(record)
      setDraft(ref.current)
    }
  }, [record])

  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const update = useCallback(
    (fn: (d: SidePlanData) => SidePlanData) => {
      const next = fn(ref.current)
      if (next === ref.current) return
      ref.current = next
      dirty.current = true
      setDraft(next)
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, WRITE_DELAY_MS)
    },
    [flush],
  )

  /** Sostituisce l'intero piano (suggerimenti, copia da un altro piano, annulla) e scrive subito. */
  const replace = useCallback(
    (next: SidePlanData) => {
      ref.current = next
      dirty.current = true
      setDraft(next)
      flush()
    },
    [flush],
  )

  return { draft, update, replace, current: () => ref.current }
}
