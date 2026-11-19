import { useEffect, useMemo, useRef, useState } from 'react'
import { repos } from '@/data/repo'
import type { CardRole } from '@/domain/side'
import type { Lang } from '@/domain/types'
import { useTranslation } from 'react-i18next'

/** Lingua corrente come 'it' | 'en'. */
export function useLang(): Lang {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage === 'it' ? 'it' : 'en'
}

/** Larghezza del contenitore (non della finestra). `setEl` è un ref a callback: il nodo può comparire dopo il primo render. */
export function useContainerWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [el])
  return { width, setEl }
}

/** Chiave dell'impostazione dello Stats Lab (stessa di features/stats/statsStore.ts: ruoli per variante). */
const statsKey = (variantId: string) => `stats.v1.${variantId}`

interface SavedLike {
  tags?: Record<string, string[]>
  partners?: Record<string, { brick?: number[] }>
}

/** Ruoli/tag per passcode canonico, letti (live) da quello che l'utente ha assegnato nello Stats Lab. */
export function useRoles(variantId: string | null, canonical: (id: number) => number): Map<number, CardRole> {
  const [saved, setSaved] = useState<SavedLike | null>(null)
  useEffect(() => {
    setSaved(null)
    if (!variantId) return
    const sub = repos.settings.watch(statsKey(variantId)).subscribe({
      next: (v) => setSaved(typeof v === 'object' && v !== null ? (v as SavedLike) : null),
      error: () => setSaved(null),
    })
    return () => sub.unsubscribe()
  }, [variantId])
  const canonRef = useRef(canonical)
  canonRef.current = canonical
  return useMemo(() => {
    const out = new Map<number, CardRole>()
    if (!saved) return out
    const ids = new Set([...Object.keys(saved.tags ?? {}), ...Object.keys(saved.partners ?? {})])
    for (const key of ids) {
      const id = Number(key)
      if (!Number.isFinite(id)) continue
      const c = canonRef.current(id)
      const prev = out.get(c)
      const tags = [...(prev?.tags ?? []), ...(saved.tags?.[key] ?? [])]
      const selfBrick = prev?.selfBrick || (saved.partners?.[key]?.brick ?? []).some((p) => canonRef.current(p) === c)
      out.set(c, { tags: [...new Set(tags)], selfBrick })
    }
    return out
  }, [saved])
}
