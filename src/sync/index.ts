import { db } from '@/data/db'
import { initAuth } from './auth'
import { getSupabase } from './client'
import { createSyncEngine, type SyncEngine } from './engine'
import { useSyncStatus } from './status'
import { createSupabaseTransport } from './supabaseTransport'

export { useSyncStatus } from './status'
export { useAuth, signInWithOtp, signInWithOAuth, signOut, getSession, initAuth } from './auth'
export { isSyncConfigured } from './client'
export { createSyncEngine, computeBackoff, applyRemoteRow } from './engine'
export type { RemoteTransport, RemoteRow, RemoteWrite, SyncState } from './types'

/**
 * Avvia il sync dell'app: sincronizza quando c'e' una sessione, si ferma al logout.
 * Senza env Supabase imposta lo stato `disabled` e non fa nient'altro (app 100% locale).
 * Ritorna la funzione di arresto.
 */
export function startSync(): () => void {
  const supabase = getSupabase()
  if (!supabase) {
    useSyncStatus.getState().set({ status: 'disabled' })
    return () => {}
  }
  let engine: SyncEngine | null = null
  let userId: string | null = null
  const stopEngine = () => {
    engine?.stop()
    engine = null
  }
  const unsubAuth = initAuth((session) => {
    const next = session?.user.id ?? null
    if (next === userId && engine) return
    stopEngine()
    userId = next
    if (!next) {
      useSyncStatus.getState().set({ status: 'disabled' })
      return
    }
    engine = createSyncEngine({ db, transport: createSupabaseTransport(supabase), userId: next })
    engine.start()
  })
  return () => {
    unsubAuth()
    stopEngine()
  }
}
