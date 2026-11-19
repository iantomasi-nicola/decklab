import { liveQuery } from 'dexie'
import { SYNC_TABLES, type DecklabDB, type Entity, type SyncTable } from '@/data/db'
import { enqueue, outboxKey } from '@/data/outbox'
import { createBrowserNetwork, type NetworkMonitor } from './network'
import { useSyncStatus, type SyncStatusStore } from './status'
import type { RemoteRow, RemoteTransport, RemoteWrite } from './types'

export interface BackoffOptions {
  baseMs: number
  maxMs: number
}

/** Backoff esponenziale con jitter +-20% (`random` iniettabile per i test). */
export function computeBackoff(attempt: number, { baseMs, maxMs }: BackoffOptions, random: () => number = Math.random): number {
  const raw = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1))
  return Math.round(raw * (0.8 + 0.4 * random()))
}

export interface SyncEngineOptions {
  db: DecklabDB
  transport: RemoteTransport
  /** utente corrente: se cambia, il pull riparte da zero e le entita' locali non ancora remote vengono inviate */
  userId?: string | null
  network?: NetworkMonitor
  /** store di stato (default: useSyncStatus) */
  status?: Pick<SyncStatusStore, 'set'>
  /** righe outbox per upsert (default 50) */
  batchSize?: number
  /** righe per pagina di pull (default 500) */
  pullLimit?: number
  /** finestra di sovrapposizione del cursore: recupera righe committate "in ritardo" (default 10 s) */
  pullOverlapMs?: number
  backoff?: BackoffOptions
  /** attesa prima di sincronizzare dopo una scrittura locale (default 300 ms) */
  debounceMs?: number
  /** osserva l'outbox e sincronizza automaticamente (default true) */
  watchLocal?: boolean
  /** usa il canale realtime (default true) */
  realtime?: boolean
  random?: () => number
}

export interface SyncEngine {
  start(): void
  stop(): void
  /** Esegue (o accoda dietro al ciclo in corso) un ciclo push+pull. Non rifiuta mai: gli errori finiscono nello stato. */
  syncNow(): Promise<void>
}

const iso = (s: string) => new Date(s).toISOString()

type ApplyResult = 'applied' | 'pending' | 'same' | 'local-newer'

/**
 * Applica una riga remota allo store locale (idempotente, last-write-wins per entita' su updatedAt).
 * - se l'entita' ha una modifica locale in outbox non tocca nulla: il push successivo vincera' (il server
 *   le assegnera' un updated_at piu' recente: vince chi sincronizza per ultimo);
 * - altrimenti sostituisce l'entita' solo se la versione remota e' piu' recente.
 */
export async function applyRemoteRow(db: DecklabDB, table: SyncTable, row: RemoteRow): Promise<ApplyResult> {
  return db.transaction('rw', [db.table(table), db.syncOutbox], async () => {
    if (await db.syncOutbox.get(outboxKey(table, row.id))) return 'pending'
    const t = db.table(table)
    const local = (await t.get(row.id)) as { updatedAt: string } | undefined
    const updatedAt = iso(row.updated_at)
    if (local) {
      const diff = Date.parse(local.updatedAt) - Date.parse(updatedAt)
      if (diff === 0) return 'same'
      if (diff > 0) return 'local-newer'
    }
    const entity = { ...row.data, id: row.id, updatedAt, deletedAt: row.deleted_at ? iso(row.deleted_at) : null }
    if (table === 'settings') {
      const clash = await db.settings.where('key').equals(String(row.data.key)).first()
      if (clash && clash.id !== row.id) await db.settings.delete(clash.id)
    }
    await t.put(entity)
    return 'applied'
  })
}

export function createSyncEngine(opts: SyncEngineOptions): SyncEngine {
  const {
    db,
    transport,
    userId = null,
    network = createBrowserNetwork(),
    batchSize = 50,
    pullLimit = 500,
    pullOverlapMs = 10_000,
    backoff = { baseMs: 2_000, maxMs: 60_000 },
    debounceMs = 300,
    watchLocal = true,
    realtime = true,
    random = Math.random,
  } = opts
  const setStatus = (patch: Partial<Omit<SyncStatusStore, 'set'>>) => (opts.status ? opts.status.set(patch) : useSyncStatus.getState().set(patch))

  let started = false
  let inflight: Promise<void> | null = null
  let again = false
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const cleanups: Array<() => void> = []

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  }

  // ---------- push ----------
  async function push(): Promise<void> {
    for (;;) {
      const batch = await db.syncOutbox.orderBy('queuedAt').limit(batchSize).toArray()
      if (batch.length === 0) return
      const byTable = new Map<SyncTable, typeof batch>()
      for (const o of batch) byTable.set(o.table, [...(byTable.get(o.table) ?? []), o])

      for (const [table, items] of byTable) {
        const writes: RemoteWrite[] = []
        const sent = new Map<string, number>() // id -> rev inviata
        for (const o of items) {
          const ent = (await db.table(table).get(o.entityId)) as Entity | undefined
          if (!ent) {
            // entita' sparita localmente (purge): niente da inviare
            await db.syncOutbox.where('key').equals(o.key).and((r) => r.rev === o.rev).delete()
            continue
          }
          const { id, updatedAt: _u, deletedAt, ...data } = ent as Entity & Record<string, unknown>
          void _u
          writes.push({ id, data, deleted_at: deletedAt })
          sent.set(id, o.rev)
        }
        if (writes.length === 0) continue
        const saved = await transport.upsert(table, writes) // se fallisce: l'outbox resta intatta
        await db.transaction('rw', [db.table(table), db.syncOutbox], async () => {
          for (const row of saved) {
            const rev = sent.get(row.id)
            if (rev === undefined) continue
            const cur = await db.syncOutbox.get(outboxKey(table, row.id))
            if (!cur || cur.rev !== rev) continue // modificata di nuovo durante il push: resta in coda
            await db.syncOutbox.delete(cur.key)
            const local = (await db.table(table).get(row.id)) as Record<string, unknown> | undefined
            // da ora l'updatedAt locale e' quello del server (cosi' pull e realtime riconoscono l'eco)
            if (local) await db.table(table).put({ ...local, updatedAt: iso(row.updated_at) })
          }
        })
      }
    }
  }

  // ---------- pull ----------
  async function pullTable(table: SyncTable): Promise<void> {
    const cur = await db.syncCursor.get(table)
    const validCursor = cur && cur.userId === userId ? cur.cursor : null
    const initial = validCursor === null
    let cursorMs = validCursor ? Date.parse(validCursor) : Number.NEGATIVE_INFINITY
    let since: string | null = validCursor ? new Date(cursorMs - pullOverlapMs).toISOString() : null
    const seen = new Set<string>()

    for (;;) {
      const rows = await transport.pull(table, since, pullLimit)
      let pageMax = Number.NEGATIVE_INFINITY
      for (const row of rows) {
        seen.add(row.id)
        const res = await applyRemoteRow(db, table, row)
        if (initial && res === 'local-newer') {
          // pull iniziale: la versione locale (offline) e' piu' recente, va inviata
          await db.transaction('rw', db.syncOutbox, () => enqueue(db, table, row.id, new Date()))
        }
        pageMax = Math.max(pageMax, Date.parse(row.updated_at))
      }
      if (rows.length > 0 && pageMax > cursorMs) {
        cursorMs = pageMax
        await db.syncCursor.put({ table, cursor: new Date(cursorMs).toISOString(), userId })
      }
      if (rows.length < pullLimit) break
      const next = new Date(pageMax).toISOString()
      if (next === since) break // pagina intera con lo stesso timestamp: nessun progresso possibile
      since = next
    }

    if (initial) {
      // entita' locali mai viste dal server (create offline prima del primo sync): vanno inviate
      await db.transaction('rw', [db.table(table), db.syncOutbox], async () => {
        const ids = (await db.table(table).toCollection().primaryKeys()) as string[]
        for (const id of ids) {
          if (seen.has(id) || (await db.syncOutbox.get(outboxKey(table, id)))) continue
          await enqueue(db, table, id, new Date())
        }
      })
      if (!(await db.syncCursor.get(table))) {
        // server vuoto: segna comunque il pull iniziale come fatto per questo utente
        await db.syncCursor.put({ table, cursor: new Date(0).toISOString(), userId })
      }
    }
  }

  async function pull(): Promise<void> {
    for (const t of SYNC_TABLES) await pullTable(t)
  }

  // ---------- ciclo ----------
  async function runCycle(): Promise<boolean> {
    if (!network.isOnline()) {
      setStatus({ status: 'offline' })
      return false
    }
    setStatus({ status: 'syncing', lastError: null })
    try {
      await push()
      await pull()
      await push() // invia quanto il pull iniziale ha accodato
      attempt = 0
      clearRetry()
      setStatus({ status: 'synced', lastSyncedAt: new Date().toISOString(), lastError: null, pending: await db.syncOutbox.count() })
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const pending = await db.syncOutbox.count().catch(() => 0)
      if (!network.isOnline()) {
        setStatus({ status: 'offline', pending })
        return false
      }
      attempt += 1
      setStatus({ status: 'error', lastError: message, pending })
      clearRetry()
      if (started) retryTimer = setTimeout(() => void syncNow(), computeBackoff(attempt, backoff, random))
      return false
    }
  }

  function syncNow(): Promise<void> {
    if (!started) return Promise.resolve()
    if (inflight) {
      again = true
      return inflight
    }
    inflight = (async () => {
      try {
        do {
          again = false
          const ok = await runCycle()
          if (!ok) break
        } while (again && started)
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  function scheduleSoon() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void syncNow(), debounceMs)
  }

  return {
    syncNow,
    start() {
      if (started) return
      started = true
      if (!opts.status) useSyncStatus.setState({ retry: () => void syncNow() })
      cleanups.push(
        network.subscribe((online) => {
          if (online) {
            clearRetry()
            attempt = 0
            void syncNow()
          } else {
            setStatus({ status: 'offline' })
          }
        }),
      )
      if (realtime) {
        cleanups.push(
          transport.subscribe(
            (table, row) => {
              void applyRemoteRow(db, table, row).catch(() => {})
            },
            () => void syncNow(),
          ),
        )
      }
      if (watchLocal) {
        const sub = liveQuery(() => db.syncOutbox.count()).subscribe({
          next: (n) => {
            setStatus({ pending: n })
            if (n > 0) scheduleSoon()
          },
          error: () => {},
        })
        cleanups.push(() => sub.unsubscribe())
      }
      void syncNow()
    },
    stop() {
      started = false
      clearRetry()
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = null
      cleanups.splice(0).forEach((fn) => fn())
    },
  }
}
