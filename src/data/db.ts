import Dexie, { type EntityTable, type Table } from 'dexie'
import type { Archetype, Localized, Meta, Variant } from '@/domain/types'
import type { SidePlan } from '@/domain/side/types'

/** Tabelle sincronizzate con Supabase (stesso nome locale e remoto). */
export const SYNC_TABLES = ['archetypes', 'variants', 'combos', 'boards', 'tags', 'settings', 'sidePlans'] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Combo: il payload e' generico finche' il formato combo non e' definito (domain/combo). */
export interface ComboRecord extends Meta {
  archetypeId: string
  /** null = combo "generale" dell'archetipo */
  variantId: string | null
  name?: Localized
  tagIds: string[]
  payload: unknown
}

/** Preset avversario (board). */
export interface BoardRecord extends Meta {
  name: Localized
  payload: unknown
}

export interface TagRecord extends Meta {
  name: string
  color?: string
}

/** Impostazione sincronizzata: l'id e' derivato dalla chiave (vedi settingId in repo.ts). */
export interface SettingRecord extends Meta {
  key: string
  value: unknown
}

export type EntityMap = {
  archetypes: Archetype
  variants: Variant
  combos: ComboRecord
  boards: BoardRecord
  tags: TagRecord
  settings: SettingRecord
  sidePlans: SidePlan
}
export type Entity<T extends SyncTable = SyncTable> = EntityMap[T]

/** Una riga per entita' modificata ancora da inviare (chiave `${table}:${entityId}`, coalescente). */
export interface OutboxRow {
  key: string
  table: SyncTable
  entityId: string
  /** incrementata a ogni scrittura: l'ack del push cancella la riga solo se la rev non e' cambiata */
  rev: number
  queuedAt: string
}

export interface SyncCursorRow {
  table: SyncTable
  /** ISO UTC dell'ultimo updated_at remoto visto; null = pull iniziale non ancora fatto */
  cursor: string | null
  userId: string | null
}

export const SCHEMA_VERSION = 2

export class DecklabDB extends Dexie {
  archetypes!: EntityTable<Archetype, 'id'>
  variants!: EntityTable<Variant, 'id'>
  combos!: EntityTable<ComboRecord, 'id'>
  boards!: EntityTable<BoardRecord, 'id'>
  tags!: EntityTable<TagRecord, 'id'>
  settings!: EntityTable<SettingRecord, 'id'>
  sidePlans!: EntityTable<SidePlan, 'id'>
  syncOutbox!: EntityTable<OutboxRow, 'key'>
  syncCursor!: EntityTable<SyncCursorRow, 'table'>

  constructor(name = 'decklab', options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options)
    // NB: IndexedDB non indicizza i valori null, quindi `deletedAt` (null = vivo) serve solo per le
    // query sui tombstone (`where('deletedAt').below(...)`); i vivi si filtrano in memoria.
    this.version(1).stores({
      archetypes: 'id, updatedAt, deletedAt',
      variants: 'id, archetypeId, updatedAt, deletedAt',
      combos: 'id, archetypeId, variantId, updatedAt, deletedAt',
      boards: 'id, updatedAt, deletedAt',
      tags: 'id, updatedAt, deletedAt',
      settings: 'id, &key, updatedAt, deletedAt',
      syncOutbox: 'key, table, queuedAt',
      syncCursor: 'table',
    })
    // v2: piani di side per matchup (tabella sincronizzata). Solo una tabella nuova: nessun dato da migrare.
    this.version(2).stores({ sidePlans: 'id, variantId, updatedAt, deletedAt' })
  }

  /** Accesso tipizzato per nome tabella (usato da repo, sync e backup). */
  entities<T extends SyncTable>(table: T): Table<EntityMap[T], string> {
    return this.table(table) as unknown as Table<EntityMap[T], string>
  }

  get allSyncedTables() {
    return SYNC_TABLES.map((t) => this.table(t))
  }
}

export function createDb(name?: string, options?: ConstructorParameters<typeof Dexie>[1]): DecklabDB {
  return new DecklabDB(name, options)
}

/** Istanza dell'app (non apre nulla finche' non viene usata). */
export const db = createDb()
