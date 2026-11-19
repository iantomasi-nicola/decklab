import { useSyncStatusPlaceholder, type SyncState } from './syncStatusPlaceholder'

/* Se src/sync/status.ts esiste e esporta `useSyncStatus`, lo usiamo; altrimenti il segnaposto. */
const real = import.meta.glob<Record<string, unknown>>('../sync/status.ts', { eager: true })
const realHook = Object.values(real)[0]?.useSyncStatus as undefined | (() => Record<string, unknown>)

const STATES: readonly SyncState[] = ['idle', 'syncing', 'offline', 'error', 'disabled']

function normalize(s: Record<string, unknown>): { state: SyncState; pending: number } {
  const raw = (s.state ?? s.status) as string | undefined
  const state = STATES.includes(raw as SyncState) ? (raw as SyncState) : 'idle'
  const pending = typeof s.pending === 'number' ? s.pending : typeof s.pendingCount === 'number' ? s.pendingCount : 0
  return { state, pending }
}

export function useSyncIndicator(): { state: SyncState; pending: number } {
  // La scelta è fissata al caricamento del modulo: l'ordine degli hook resta stabile.
  return realHook ? normalize(realHook()) : useSyncStatusPlaceholder()
}
