import type { Session, User } from '@supabase/supabase-js'
import { create } from 'zustand'
import { getSupabase } from './client'

export interface AuthStore {
  session: Session | null
  user: User | null
  /** true finche' non e' nota la sessione iniziale */
  loading: boolean
}

export const useAuth = create<AuthStore>(() => ({ session: null, user: null, loading: true }))

export class SyncDisabledError extends Error {
  constructor() {
    super('Sync non configurato (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti)')
    this.name = 'SyncDisabledError'
  }
}

function client() {
  const c = getSupabase()
  if (!c) throw new SyncDisabledError()
  return c
}

/** Invia il magic link all'email. */
export async function signInWithOtp(email: string): Promise<void> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  })
  if (error) throw error
}

/** Avvia il login Google (redirect). */
export async function signInWithOAuth(provider: 'google' = 'google'): Promise<void> {
  const { error } = await client().auth.signInWithOAuth({
    provider,
    options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  const { error } = await client().auth.signOut()
  if (error) throw error
}

export async function getSession(): Promise<Session | null> {
  const c = getSupabase()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return data.session
}

/**
 * Inizializza lo store `useAuth` e ascolta i cambi di sessione. Ritorna la disiscrizione.
 * Senza configurazione: sessione null, loading false, nessun errore.
 */
export function initAuth(onChange?: (session: Session | null) => void): () => void {
  const c = getSupabase()
  if (!c) {
    useAuth.setState({ session: null, user: null, loading: false })
    return () => {}
  }
  const apply = (session: Session | null) => {
    useAuth.setState({ session, user: session?.user ?? null, loading: false })
    onChange?.(session)
  }
  void c.auth.getSession().then(({ data }) => apply(data.session)).catch(() => apply(null))
  const { data } = c.auth.onAuthStateChange((_event, session) => apply(session))
  return () => data.subscription.unsubscribe()
}
