import { SYNC_TABLES, type SyncTable } from '@/data/db'
import type { BackupFile } from '@/data/backup'

export interface TableCount {
  /** entita' attive (non cancellate) */
  alive: number
  /** tutte le righe del file, tombstone comprese */
  total: number
}

/** Conteggi per tipo mostrati nell'anteprima del ripristino. */
export function summarizeBackup(b: BackupFile): Record<SyncTable, TableCount> {
  const out = {} as Record<SyncTable, TableCount>
  for (const t of SYNC_TABLES) {
    const rows = b.tables[t] as { deletedAt: string | null }[]
    out[t] = { alive: rows.filter((r) => r.deletedAt === null).length, total: rows.length }
  }
  return out
}

/** Tipi mostrati all'utente (le impostazioni non sono contenuto "suo": restano nell'elenco ma in coda). */
export const BACKUP_KINDS: readonly SyncTable[] = ['archetypes', 'variants', 'combos', 'boards', 'tags', 'settings']

export const BACKUP_MAX_BYTES = 50 * 1024 * 1024

/** decklab-backup-2026-11-19.json */
export function backupFileName(now: Date = new Date()): string {
  return `decklab-backup-${now.toISOString().slice(0, 10)}.json`
}
