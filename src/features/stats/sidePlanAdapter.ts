/**
 * Adapter dei piani di side. La feature "Side plan" crea la tabella `sidePlans`; finché non esiste la lista è vuota.
 * `injectSidePlans` è un punto d'innesto per i test (e2e e unitari) che non richiede la tabella.
 */
import { liveQuery, type Observable } from 'dexie'
import { db } from '@/data/db'
import { normalizeSidePlan, type SidePlan } from '@/domain/stats'
import type { Lang } from '@/domain/types'

let injected: SidePlan[] | null = null
const listeners = new Set<() => void>()

/** Sostituisce i piani letti dal DB con quelli dati (null = ripristina). */
export function injectSidePlans(plans: SidePlan[] | null) {
  injected = plans
  for (const l of listeners) l()
}

export const hasSidePlansTable = (): boolean => db.tables.some((t) => t.name === 'sidePlans')

/** Piani della variante, live: tabella `sidePlans` se esiste, altrimenti lista vuota. */
export function watchSidePlans(variantId: string, lang: Lang): Observable<SidePlan[]> {
  const read = async (): Promise<SidePlan[]> => {
    if (injected) return injected.filter((p) => p.variantId === variantId)
    if (!hasSidePlansTable()) return []
    const rows = (await db.table('sidePlans').toArray()) as unknown[]
    return rows.map((r) => normalizeSidePlan(r, lang)).filter((p): p is SidePlan => p !== null && p.variantId === variantId)
  }
  return {
    subscribe(observer: { next?: (v: SidePlan[]) => void; error?: (e: unknown) => void } | ((v: SidePlan[]) => void)) {
      const next = typeof observer === 'function' ? observer : (observer.next ?? (() => {}))
      const error = typeof observer === 'function' ? undefined : observer.error
      const run = () => void read().then(next, error)
      listeners.add(run)
      const sub = hasSidePlansTable() ? liveQuery(read).subscribe({ next, error }) : null
      if (!sub) run()
      return {
        unsubscribe() {
          listeners.delete(run)
          sub?.unsubscribe()
        },
        closed: false,
      }
    },
  } as unknown as Observable<SidePlan[]>
}
