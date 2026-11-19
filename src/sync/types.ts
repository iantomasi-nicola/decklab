import type { SyncTable } from '@/data/db'

/** Riga cosi' come vive sul server (una tabella per entita', stesso nome di Dexie). */
export interface RemoteRow {
  id: string
  /** entita' di dominio completa (JSON) */
  data: Record<string, unknown>
  /** assegnato dal SERVER a ogni upsert (trigger); riferimento del last-write-wins e del cursore */
  updated_at: string
  deleted_at: string | null
}

/** Cio' che il client invia: updated_at non c'e' perche' lo decide il server. */
export interface RemoteWrite {
  id: string
  data: Record<string, unknown>
  deleted_at: string | null
}

/**
 * Confine con il backend. L'app usa SupabaseTransport; i test un server finto in memoria
 * (src/sync/memoryTransport.ts). Tutti i metodi rifiutano la promise se la rete/il server falliscono.
 */
export interface RemoteTransport {
  /** Upsert idempotente per id; ritorna le righe come salvate (con updated_at del server), in qualsiasi ordine. */
  upsert(table: SyncTable, rows: RemoteWrite[]): Promise<RemoteRow[]>
  /** Righe con updated_at >= since (inclusivo; null = tutte), ordinate per updated_at crescente, al massimo `limit`. */
  pull(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]>
  /**
   * Canale realtime: chiama `onRow` per ogni insert/update remoto, `onReady` a ogni (ri)connessione
   * riuscita (per recuperare gli eventi persi). Ritorna la funzione di disiscrizione.
   */
  subscribe(onRow: (table: SyncTable, row: RemoteRow) => void, onReady?: () => void): () => void
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'disabled'
