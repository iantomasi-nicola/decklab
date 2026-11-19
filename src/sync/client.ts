import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true se le variabili d'ambiente sono presenti: altrimenti l'app e' 100% locale e il sync resta disabilitato. */
export const isSyncConfigured = Boolean(url && anonKey)

let client: SupabaseClient | null = null

/** Client Supabase (creato una sola volta) o null se non configurato. Non lancia mai. */
export function getSupabase(): SupabaseClient | null {
  if (!isSyncConfigured) return null
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}
