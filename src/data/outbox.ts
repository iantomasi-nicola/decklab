import type { Meta } from '@/domain/types'
import type { DecklabDB, Entity, EntityMap, OutboxRow, SyncTable } from './db'

export interface Clock {
  now(): Date
  uuid(): string
}

export const systemClock: Clock = {
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
}

export const outboxKey = (table: SyncTable, id: string) => `${table}:${id}`

/**
 * Timestamp provvisorio locale (il server lo riassegna al push). Strettamente crescente per entita'
 * cosi' le scritture ravvicinate sullo stesso record restano ordinate anche se l'orologio non avanza.
 */
export function nextUpdatedAt(now: Date, prev?: string): string {
  const t = now.getTime()
  const p = prev ? new Date(prev).getTime() : Number.NEGATIVE_INFINITY
  return new Date(Math.max(t, p + 1)).toISOString()
}

/** Accoda (o aggiorna, coalescendo) la riga outbox. DEVE essere chiamata dentro la transazione della scrittura. */
export async function enqueue(db: DecklabDB, table: SyncTable, id: string, now: Date): Promise<void> {
  const key = outboxKey(table, id)
  const prev = await db.syncOutbox.get(key)
  const row: OutboxRow = { key, table, entityId: id, rev: (prev?.rev ?? 0) + 1, queuedAt: now.toISOString() }
  await db.syncOutbox.put(row)
}

/**
 * Scrive entita' + outbox. Chiamare dentro `db.transaction('rw', tabella, db.syncOutbox, ...)`.
 * Imposta updatedAt (provvisorio) e restituisce le entita' scritte.
 */
export async function writeEntities<T extends SyncTable>(
  db: DecklabDB,
  table: T,
  entities: Entity<T>[],
  now: Date,
): Promise<Entity<T>[]> {
  const t = db.entities(table)
  const out: Entity<T>[] = []
  for (const e of entities) {
    const existing = (await t.get(e.id)) as (Meta & EntityMap[T]) | undefined
    const stamped = { ...e, updatedAt: nextUpdatedAt(now, existing?.updatedAt ?? e.updatedAt) } as Entity<T>
    await t.put(stamped as never)
    await enqueue(db, table, e.id, now)
    out.push(stamped)
  }
  return out
}
