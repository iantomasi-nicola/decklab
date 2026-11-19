import type { SyncTable } from '@/data/db'
import type { RemoteRow, RemoteTransport, RemoteWrite } from './types'

type Listener = (table: SyncTable, row: RemoteRow) => void

/**
 * Server finto in memoria che imita Supabase: updated_at assegnato dal "server" (orologio logico che
 * avanza di 1 s a ogni scrittura), upsert idempotente per id, pull inclusivo ordinato, realtime.
 * Condiviso da piu' client (dispositivi) tramite `connect()`. Solo per test.
 */
export class MemoryServer {
  readonly tables = new Map<SyncTable, Map<string, RemoteRow>>()
  private clock = Date.parse('2026-06-01T00:00:00.000Z')
  private listeners = new Set<{ fn: Listener; ready?: () => void; owner: object }>()
  upsertCalls = 0

  private table(t: SyncTable) {
    let m = this.tables.get(t)
    if (!m) this.tables.set(t, (m = new Map()))
    return m
  }

  private stamp(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  /** Righe attualmente sul server (per le asserzioni). */
  rows(t: SyncTable): RemoteRow[] {
    return [...this.table(t).values()]
  }

  /** Un dispositivo: puo' essere messo offline indipendentemente dagli altri. */
  connect(): MemoryTransport {
    return new MemoryTransport(this)
  }

  /** @internal */
  _upsert(t: SyncTable, writes: RemoteWrite[]): RemoteRow[] {
    this.upsertCalls++
    const out: RemoteRow[] = []
    for (const w of writes) {
      const row: RemoteRow = { id: w.id, data: structuredClone(w.data), updated_at: this.stamp(), deleted_at: w.deleted_at }
      this.table(t).set(w.id, row)
      out.push(structuredClone(row))
      for (const l of this.listeners) l.fn(t, structuredClone(row))
    }
    return out
  }

  /** @internal */
  _pull(t: SyncTable, since: string | null, limit: number): RemoteRow[] {
    const s = since === null ? Number.NEGATIVE_INFINITY : Date.parse(since)
    return this.rows(t)
      .filter((r) => Date.parse(r.updated_at) >= s)
      .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }

  /** @internal */
  _subscribe(owner: MemoryTransport, fn: Listener, ready?: () => void) {
    const l = { fn, ready, owner }
    this.listeners.add(l)
    ready?.()
    return () => this.listeners.delete(l)
  }
}

export class MemoryTransport implements RemoteTransport {
  online = true
  /** se > 0, i prossimi N upsert falliscono (server instabile) */
  failUpserts = 0

  constructor(private server: MemoryServer) {}

  private guard() {
    if (!this.online) throw new Error('network offline')
  }

  async upsert(table: SyncTable, rows: RemoteWrite[]): Promise<RemoteRow[]> {
    this.guard()
    if (this.failUpserts > 0) {
      this.failUpserts--
      throw new Error('server 503')
    }
    return this.server._upsert(table, structuredClone(rows))
  }

  async pull(table: SyncTable, since: string | null, limit: number): Promise<RemoteRow[]> {
    this.guard()
    return this.server._pull(table, since, limit)
  }

  subscribe(onRow: (table: SyncTable, row: RemoteRow) => void, onReady?: () => void): () => void {
    // il realtime di un dispositivo offline non consegna nulla
    return this.server._subscribe(this, (t, r) => this.online && onRow(t, r), onReady)
  }
}
