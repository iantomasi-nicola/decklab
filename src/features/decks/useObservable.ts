import { useEffect, useState } from 'react'
import type { Observable } from 'dexie'

/** Sottoscrive un Observable di Dexie (liveQuery). `loaded` diventa true alla prima emissione. */
export function useObservable<T>(make: () => Observable<T>, deps: readonly unknown[]): { value: T | undefined; loaded: boolean } {
  const [state, setState] = useState<{ value: T | undefined; loaded: boolean }>({ value: undefined, loaded: false })
  useEffect(() => {
    const sub = make().subscribe({
      next: (value) => setState({ value, loaded: true }),
      error: () => setState((s) => ({ ...s, loaded: true })),
    })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
