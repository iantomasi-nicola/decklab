import { create } from 'zustand'
import type { SyncState } from './types'

export interface SyncStatusStore {
  status: SyncState
  /** ISO dell'ultimo ciclo completato con successo */
  lastSyncedAt: string | null
  lastError: string | null
  /** modifiche locali in attesa di invio */
  pending: number
  /** Forza un nuovo ciclo (registrata dal motore; no-op se il sync e' disabilitato). */
  retry: () => void
  set: (patch: Partial<Omit<SyncStatusStore, 'set'>>) => void
}

/** Stato del sync per l'indicatore in UI: synced | syncing | offline | error | disabled. */
export const useSyncStatus = create<SyncStatusStore>((set) => ({
  status: 'disabled',
  lastSyncedAt: null,
  lastError: null,
  pending: 0,
  retry: () => {},
  set: (patch) => set(patch),
}))
