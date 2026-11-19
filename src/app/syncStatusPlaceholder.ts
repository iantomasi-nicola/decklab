import { create } from 'zustand'

/**
 * Segnaposto finché non esiste `src/sync/status.ts`. Stessa forma minima che la UI legge:
 * { state, pending }. Quando lo store reale arriva, `useSyncIndicator` lo preferisce.
 */
export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'disabled'

interface PlaceholderState {
  state: SyncState
  pending: number
}

export const useSyncStatusPlaceholder = create<PlaceholderState>(() => ({
  state: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'disabled',
  pending: 0,
}))

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => useSyncStatusPlaceholder.setState({ state: 'offline' }))
  window.addEventListener('online', () => useSyncStatusPlaceholder.setState({ state: 'disabled' }))
}
