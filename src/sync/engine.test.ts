import { describe, expect, it, vi } from 'vitest'
import { createTestDb, fakeClock } from '@/data/testing'
import { createRepos, type Repos } from '@/data/repo'
import type { DecklabDB } from '@/data/db'
import { computeBackoff, createSyncEngine, type SyncEngine } from './engine'
import { MemoryServer, type MemoryTransport } from './memoryTransport'
import { createManualNetwork } from './network'
import type { SyncState } from './types'

interface Device {
  db: DecklabDB
  repos: Repos
  transport: MemoryTransport
  network: ReturnType<typeof createManualNetwork>
  engine: SyncEngine
  statuses: SyncState[]
  last: () => { status: SyncState; lastError: string | null; pending: number }
}

function device(server: MemoryServer, name: string, opts: { realtime?: boolean } = {}): Device {
  const db = createTestDb(name)
  const clock = fakeClock('2026-01-01T00:00:00.000Z', name)
  const repos = createRepos(db, clock)
  const transport = server.connect()
  const network = createManualNetwork(true)
  const statuses: SyncState[] = []
  let state = { status: 'disabled' as SyncState, lastError: null as string | null, pending: 0 }
  const engine = createSyncEngine({
    db,
    transport,
    network,
    userId: 'u1',
    watchLocal: false,
    realtime: opts.realtime ?? false,
    backoff: { baseMs: 5, maxMs: 20 },
    status: {
      set: (p) => {
        state = { ...state, ...p }
        if (p.status) statuses.push(p.status)
      },
    },
  })
  engine.start()
  return { db, repos, transport, network, engine, statuses, last: () => state }
}

const arch = (n: string) => ({ name: { it: n }, keyCards: [], starters: [], extenders: [] })
const names = async (d: Device) => (await d.repos.archetypes.list()).map((a) => a.name.it).sort()

describe('sync engine', () => {
  it('offline -> online: accumula in outbox offline e svuota al ritorno della rete', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    await a.engine.syncNow()
    a.network.set(false)
    a.transport.online = false
    await a.repos.archetypes.create(arch('Offline 1'))
    await a.repos.archetypes.create(arch('Offline 2'))
    await a.engine.syncNow()
    expect(a.last().status).toBe('offline')
    expect(server.rows('archetypes')).toHaveLength(0)
    expect(await a.db.syncOutbox.count()).toBe(2)

    a.transport.online = true
    a.network.set(true) // evento "online" -> sync automatico
    await vi.waitFor(() => expect(a.last().status).toBe('synced'))
    expect(server.rows('archetypes')).toHaveLength(2)
    expect(await a.db.syncOutbox.count()).toBe(0)
    expect(a.last().pending).toBe(0)
  })

  it('errori del server: stato error, retry con backoff, poi recupero', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    await a.engine.syncNow()
    a.transport.failUpserts = 2
    await a.repos.archetypes.create(arch('X'))
    await a.engine.syncNow()
    expect(a.last().status).toBe('error')
    expect(a.last().lastError).toMatch(/503/)
    await vi.waitFor(() => expect(a.last().status).toBe('synced'), { timeout: 2000 })
    expect(server.rows('archetypes')).toHaveLength(1)
    expect(await a.db.syncOutbox.count()).toBe(0)
  })

  it('due dispositivi convergono (pull dalla propria cache vuota)', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const b = device(server, 'b')
    await a.repos.archetypes.create(arch('Dal telefono'))
    await a.engine.syncNow()
    await b.engine.syncNow()
    expect(await names(b)).toEqual(['Dal telefono'])
  })

  it('conflitto LWW: vince chi sincronizza per ultimo, per entita\'', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const b = device(server, 'b')
    const x = await a.repos.archetypes.create(arch('Base'))
    await a.engine.syncNow()
    await b.engine.syncNow()

    // entrambi modificano offline la stessa entita'; B ha l'orologio locale PIU' INDIETRO ma sincronizza dopo
    await a.repos.archetypes.update(x.id, { name: { it: 'Versione A' } })
    await b.repos.archetypes.update(x.id, { name: { it: 'Versione B' } })
    await a.engine.syncNow() // A per prima
    await b.engine.syncNow() // B per ultima: vince (updated_at deciso dal server)
    await a.engine.syncNow()
    expect(server.rows('archetypes')[0]!.data.name).toEqual({ it: 'Versione B' })
    expect((await a.repos.archetypes.get(x.id))?.name.it).toBe('Versione B')
    expect((await b.repos.archetypes.get(x.id))?.name.it).toBe('Versione B')
    expect(await a.db.syncOutbox.count()).toBe(0)
    expect(await b.db.syncOutbox.count()).toBe(0)
  })

  it('una modifica remota non sovrascrive una locale in attesa (outbox)', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const b = device(server, 'b')
    const x = await a.repos.archetypes.create(arch('Base'))
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.repos.archetypes.update(x.id, { name: { it: 'A' } })
    await a.engine.syncNow()
    b.transport.online = false
    await b.repos.archetypes.update(x.id, { name: { it: 'B offline' } })
    b.transport.online = true
    // il pull di B porterebbe 'A' ma la modifica locale e' ancora in coda: non va persa
    await b.engine.syncNow()
    expect(server.rows('archetypes')[0]!.data.name).toEqual({ it: 'B offline' })
  })

  it('soft delete propagata (e non risuscita dal pull)', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const b = device(server, 'b')
    const x = await a.repos.archetypes.create(arch('Da cancellare'))
    await a.engine.syncNow()
    await b.engine.syncNow()
    expect(await names(b)).toEqual(['Da cancellare'])

    await a.repos.archetypes.softDelete(x.id)
    await a.engine.syncNow()
    expect(server.rows('archetypes')[0]!.deleted_at).not.toBeNull() // tombstone, non DELETE fisico
    await b.engine.syncNow()
    expect(await b.repos.archetypes.list()).toHaveLength(0)
    expect((await b.repos.archetypes.get(x.id))?.deletedAt).not.toBeNull()
    await a.engine.syncNow()
    expect(await a.repos.archetypes.list()).toHaveLength(0)
  })

  it('nessuna perdita: modifiche offline a entita\' diverse su due dispositivi si fondono', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const b = device(server, 'b')
    const a1 = await a.repos.archetypes.create(arch('A1'))
    await a.engine.syncNow()
    await b.engine.syncNow()

    const v = { archetypeId: a1.id, name: { it: 'V' }, deck: { main: [1], extra: [], side: [] }, rules: 'TCG' as const, banlist: { format: 'TCG' as const, id: '2026.10' } }
    await a.repos.archetypes.create(arch('A2'))
    const va = await a.repos.variants.create(v)
    await a.repos.combos.create({ archetypeId: a1.id, variantId: va.id, tagIds: [], payload: { n: 1 } })
    await a.repos.settings.set('lang', 'it')
    await b.repos.archetypes.create(arch('B1'))
    await b.repos.tags.create({ name: 'tag-b' })
    await b.repos.boards.create({ name: { it: 'Board' }, payload: [] })
    await a.repos.sidePlans.create({ variantId: va.id, matchup: { name: 'Snake-Eye', note: '', turn: 'first' }, outs: [{ cardId: 1, count: 1 }], ins: [{ cardId: 2, count: 1 }] })
    await b.repos.archetypes.update(a1.id, { keyCards: [42] })

    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.engine.syncNow()

    for (const d of [a, b]) {
      expect(await names(d)).toEqual(['A1', 'A2', 'B1'])
      expect(await d.repos.variants.list()).toHaveLength(1)
      expect(await d.repos.combos.list()).toHaveLength(1)
      expect(await d.repos.tags.list()).toHaveLength(1)
      expect(await d.repos.boards.list()).toHaveLength(1)
      expect(await d.repos.sidePlans.list()).toHaveLength(1)
      expect(await d.repos.settings.get('lang')).toBe('it')
      expect((await d.repos.archetypes.get(a1.id))?.keyCards).toEqual([42])
    }
  })

  it('idempotenza: ripetere sync non cambia nulla e il re-push non duplica', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    const x = await a.repos.archetypes.create(arch('Uno'))
    await a.engine.syncNow()
    const snapshot = JSON.stringify(await a.db.archetypes.toArray())
    const calls = server.upsertCalls
    await a.engine.syncNow()
    await a.engine.syncNow()
    expect(server.upsertCalls).toBe(calls) // outbox vuota: nessun push
    expect(JSON.stringify(await a.db.archetypes.toArray())).toBe(snapshot)

    // push ripetuto della stessa entita' (es. ack perso): una sola riga sul server
    await a.db.transaction('rw', a.db.syncOutbox, () => a.db.syncOutbox.put({ key: `archetypes:${x.id}`, table: 'archetypes', entityId: x.id, rev: 99, queuedAt: new Date().toISOString() }))
    await a.engine.syncNow()
    expect(server.rows('archetypes')).toHaveLength(1)
    expect(await a.repos.archetypes.list()).toHaveLength(1)
    // ... e un altro dispositivo vede comunque una sola entita'
    const b = device(server, 'b')
    await b.engine.syncNow()
    await b.engine.syncNow()
    expect(await b.repos.archetypes.list()).toHaveLength(1)
  })

  it('primo sync: i dati creati offline prima del login arrivano al server senza perdere quelli remoti', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    await a.repos.archetypes.create(arch('Remoto'))
    await a.engine.syncNow()

    // dispositivo con dati locali preesistenti (outbox ignorata/vuota: simulo import da vecchia versione)
    const b = device(server, 'b')
    await b.db.archetypes.put({ id: 'legacy-1', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, name: { it: 'Locale vecchio' }, keyCards: [], starters: [], extenders: [] })
    await b.engine.syncNow()
    expect(await names(b)).toEqual(['Locale vecchio', 'Remoto'])
    expect(server.rows('archetypes')).toHaveLength(2)
    await a.engine.syncNow()
    expect(await names(a)).toEqual(['Locale vecchio', 'Remoto'])
  })

  it('realtime: la modifica di un altro dispositivo arriva senza pull', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a', { realtime: true })
    const b = device(server, 'b', { realtime: true })
    await a.engine.syncNow()
    await b.engine.syncNow()
    await a.repos.archetypes.create(arch('Live'))
    await a.engine.syncNow()
    await vi.waitFor(async () => expect(await names(b)).toEqual(['Live']))
    a.engine.stop()
    b.engine.stop()
  })

  it('pull paginato con cursore: riprende da dove era arrivato', async () => {
    const server = new MemoryServer()
    const a = device(server, 'a')
    for (let i = 0; i < 7; i++) await a.repos.tags.create({ name: `t${i}` })
    await a.engine.syncNow()
    const db = createTestDb('b')
    const small = createSyncEngine({ db, transport: server.connect(), network: createManualNetwork(true), userId: 'u1', watchLocal: false, realtime: false, pullLimit: 3, status: { set: () => {} } })
    small.start()
    await small.syncNow()
    expect(await db.tags.count()).toBe(7)
    const cur = await db.syncCursor.get('tags')
    expect(cur?.cursor).toBeTruthy()
    small.stop()
  })

  it('computeBackoff cresce esponenzialmente fino al massimo', () => {
    const o = { baseMs: 1000, maxMs: 8000 }
    const mid = () => 0.5
    expect([1, 2, 3, 4, 5, 9].map((n) => computeBackoff(n, o, mid))).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
  })
})
