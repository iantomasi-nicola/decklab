import type { SupabaseClient } from '@supabase/supabase-js'
import { SYNC_TABLES, type SyncTable } from '@/data/db'
import type { RemoteRow, RemoteTransport, RemoteWrite } from './types'

const COLUMNS = 'id, data, updated_at, deleted_at'

/** Implementazione di RemoteTransport su Supabase (PostgREST + Realtime). RLS filtra per utente. */
export function createSupabaseTransport(supabase: SupabaseClient): RemoteTransport {
  return {
    async upsert(table: SyncTable, rows: RemoteWrite[]): Promise<RemoteRow[]> {
      // user_id e updated_at li decide il server (default auth.uid() / trigger)
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'id' }).select(COLUMNS)
      if (error) throw new Error(error.message)
      return (data ?? []) as RemoteRow[]
    },

    async pull(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]> {
      let q = supabase.from(table).select(COLUMNS)
      if (since !== null) q = q.gte('updated_at', since)
      const { data, error } = await q.order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(limit)
      if (error) throw new Error(error.message)
      return (data ?? []) as RemoteRow[]
    },

    subscribe(onRow, onReady) {
      let first = true
      const channel = supabase.channel(`decklab-sync-${Math.random().toString(36).slice(2)}`)
      for (const table of SYNC_TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          const row = payload.new as Partial<RemoteRow> | undefined
          // i DELETE fisici non esistono nel nostro modello (solo soft delete)
          if (row && row.id && row.updated_at) onRow(table, row as RemoteRow)
        })
      }
      channel.subscribe((state) => {
        if (state !== 'SUBSCRIBED') return
        // alla prima connessione il motore sta gia' sincronizzando; alle riconnessioni recupera gli eventi persi
        if (first) first = false
        else onReady?.()
      })
      return () => {
        void supabase.removeChannel(channel)
      }
    },
  }
}
