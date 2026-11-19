import { db as defaultDb, SCHEMA_VERSION, SYNC_TABLES, type DecklabDB, type Entity, type SyncTable } from './db'
import { enqueue, nextUpdatedAt, systemClock, type Clock } from './outbox'

export const BACKUP_APP = 'decklab'

export interface BackupFile {
  app: typeof BACKUP_APP
  /** versione dello schema dati (SCHEMA_VERSION al momento dell'export) */
  schemaVersion: number
  exportedAt: string
  tables: { [T in SyncTable]: Entity<T>[] }
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  mode: ImportMode
  /** entita' scritte (nuove o sovrascritte) */
  written: number
  /** entita' del backup ignorate perche' quelle locali sono piu' recenti (solo merge) */
  skipped: number
  /** entita' locali cancellate logicamente perche' assenti nel backup (solo replace) */
  removed: number
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

/**
 * Migrazioni dei backup vecchi: `migrations[n]` porta un backup dalla versione n alla n+1.
 * Per ora esiste solo la v1.
 */
const migrations: Record<number, (b: BackupFile) => BackupFile> = {}

/** Esporta tutto (tombstone inclusi, cosi' l'import in "unisci" propaga le cancellazioni). Outbox e cursori sono esclusi. */
export async function exportBackup(db: DecklabDB = defaultDb, clock: Clock = systemClock): Promise<BackupFile> {
  return db.transaction('r', db.allSyncedTables, async () => {
    const tables = {} as Record<SyncTable, unknown[]>
    for (const t of SYNC_TABLES) tables[t] = await db.table(t).toArray()
    return {
      app: BACKUP_APP,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: clock.now().toISOString(),
      tables: tables as BackupFile['tables'],
    }
  })
}

export async function exportBackupJson(db: DecklabDB = defaultDb, clock: Clock = systemClock): Promise<string> {
  return JSON.stringify(await exportBackup(db, clock))
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Valida (e migra) un backup grezzo. Lancia BackupError se non utilizzabile. */
export function parseBackup(input: string | unknown): BackupFile {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input)
    } catch {
      throw new BackupError('Il file non e\' un JSON valido')
    }
  }
  if (!isObj(raw) || raw.app !== BACKUP_APP) throw new BackupError('Il file non e\' un backup di Decklab')
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new BackupError('Versione dello schema mancante o non valida')
  if (version > SCHEMA_VERSION) throw new BackupError(`Backup creato da una versione piu' recente (schema ${version} > ${SCHEMA_VERSION})`)
  if (!isObj(raw.tables)) throw new BackupError('Backup privo di tabelle')

  const tables = {} as Record<SyncTable, unknown[]>
  for (const t of SYNC_TABLES) {
    const rows = raw.tables[t] ?? []
    if (!Array.isArray(rows)) throw new BackupError(`Tabella ${t} non valida`)
    const seen = new Set<string>()
    for (const r of rows) {
      if (!isObj(r) || typeof r.id !== 'string' || typeof r.updatedAt !== 'string' || Number.isNaN(Date.parse(r.updatedAt))) {
        throw new BackupError(`Riga non valida in ${t}`)
      }
      if (!(r.deletedAt === null || r.deletedAt === undefined || typeof r.deletedAt === 'string')) throw new BackupError(`deletedAt non valido in ${t}`)
      if (seen.has(r.id)) throw new BackupError(`Id duplicato in ${t}: ${r.id}`)
      seen.add(r.id)
    }
    tables[t] = rows.map((r) => ({ ...(r as object), deletedAt: (r as { deletedAt?: string | null }).deletedAt ?? null }))
  }
  let backup: BackupFile = { app: BACKUP_APP, schemaVersion: version, exportedAt: String(raw.exportedAt ?? ''), tables: tables as BackupFile['tables'] }
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const m = migrations[v]
    if (!m) throw new BackupError(`Nessuna migrazione dalla versione ${v}`)
    backup = m(backup)
  }
  return { ...backup, schemaVersion: SCHEMA_VERSION }
}

/**
 * Importa un backup. Tutte le scritture accodano l'outbox, quindi il sync le propaga.
 * - merge: per ogni id vince l'`updatedAt` piu' recente (le cancellazioni logiche sono entita' come le altre).
 * - replace: lo stato locale diventa quello del backup; le entita' locali assenti nel backup vengono
 *   cancellate logicamente (non fisicamente) cosi' la cancellazione arriva anche agli altri dispositivi.
 * Tutto avviene in una sola transazione: se fallisce non cambia nulla.
 */
export async function importBackup(
  input: string | unknown,
  mode: ImportMode,
  db: DecklabDB = defaultDb,
  clock: Clock = systemClock,
): Promise<ImportResult> {
  const backup = parseBackup(input)
  const result: ImportResult = { mode, written: 0, skipped: 0, removed: 0 }
  await db.transaction('rw', [...db.allSyncedTables, db.syncOutbox], async () => {
    const now = clock.now()
    for (const table of SYNC_TABLES) {
      const t = db.table(table)
      const incoming = backup.tables[table] as Entity[]
      const incomingIds = new Set(incoming.map((e) => e.id))
      for (const e of incoming) {
        const local = (await t.get(e.id)) as Entity | undefined
        if (mode === 'merge' && local && Date.parse(local.updatedAt) >= Date.parse(e.updatedAt)) {
          result.skipped++
          continue
        }
        // In replace il backup deve vincere anche sul remoto: updatedAt provvisorio = ora.
        const updatedAt = mode === 'replace' ? nextUpdatedAt(now, local?.updatedAt) : e.updatedAt
        // un'impostazione con la stessa chiave ma id diverso violerebbe l'indice unico: la sostituisco
        if (table === 'settings') {
          const clash = await db.settings.where('key').equals((e as Entity<'settings'>).key).first()
          if (clash && clash.id !== e.id) await db.settings.delete(clash.id)
        }
        await t.put({ ...e, updatedAt })
        await enqueue(db, table, e.id, now)
        result.written++
      }
      if (mode === 'replace') {
        for (const local of (await t.toArray()) as Entity[]) {
          if (incomingIds.has(local.id) || local.deletedAt !== null) continue
          await t.put({ ...local, deletedAt: now.toISOString(), updatedAt: nextUpdatedAt(now, local.updatedAt) })
          await enqueue(db, table, local.id, now)
          result.removed++
        }
      }
    }
  })
  return result
}
