import { beforeEach, describe, expect, it } from 'vitest'
import { BackupError, exportBackup, exportBackupJson, importBackup, parseBackup } from './backup'
import type { DecklabDB } from './db'
import { createRepos, type Repos } from './repo'
import { createTestDb, fakeClock } from './testing'

let db: DecklabDB
let r: Repos
let clock: ReturnType<typeof fakeClock>

const arch = (n: string) => ({ name: { it: n }, keyCards: [], starters: [], extenders: [] })

beforeEach(() => {
  db = createTestDb('src')
  clock = fakeClock('2026-01-01T00:00:00.000Z', 'a')
  r = createRepos(db, clock)
})

describe('backup', () => {
  it('export/import roundtrip su db vuoto', async () => {
    const a = await r.archetypes.create(arch('A'))
    await r.combos.create({ archetypeId: a.id, variantId: null, tagIds: [], payload: { s: 1 } })
    await r.settings.set('lang', 'it')
    await r.tags.create({ name: 't' })
    const json = await exportBackupJson(db, clock)
    expect(JSON.parse(json).schemaVersion).toBe(2)

    const db2 = createTestDb('dst')
    const res = await importBackup(json, 'replace', db2, fakeClock('2026-02-01T00:00:00.000Z', 'b'))
    expect(res).toMatchObject({ written: 4, removed: 0 })
    const back = await exportBackup(db2)
    expect(back.tables.archetypes.map((x) => x.id)).toEqual([a.id])
    expect(back.tables.combos[0]?.payload).toEqual({ s: 1 })
    expect(await db2.syncOutbox.count()).toBe(4) // l'import viene sincronizzato
  })

  it('merge: vince updatedAt piu\' recente, non cancella le entita\' locali', async () => {
    const a = await r.archetypes.create(arch('A'))
    const snapshot = await exportBackup(db, clock)
    clock.advance(1000)
    await r.archetypes.update(a.id, { name: { it: 'A locale' } })
    const only = await r.archetypes.create(arch('Solo locale'))

    const res = await importBackup(snapshot, 'merge', db, clock)
    expect(res.skipped).toBe(1)
    expect(res.written).toBe(0)
    expect((await r.archetypes.get(a.id))?.name.it).toBe('A locale')
    expect(await r.archetypes.get(only.id)).toBeTruthy()

    // backup piu' recente della copia locale: vince il backup
    const newer = structuredClone(snapshot)
    newer.tables.archetypes[0]!.name = { it: 'A da backup' }
    newer.tables.archetypes[0]!.updatedAt = '2030-01-01T00:00:00.000Z'
    const res2 = await importBackup(newer, 'merge', db, clock)
    expect(res2.written).toBe(1)
    expect((await r.archetypes.get(a.id))?.name.it).toBe('A da backup')
  })

  it('replace: le entita\' locali assenti diventano tombstone (cosi\' si sincronizzano)', async () => {
    const a = await r.archetypes.create(arch('A'))
    const snapshot = await exportBackup(db, clock)
    const extra = await r.archetypes.create(arch('Extra'))
    clock.advance(5000)
    const res = await importBackup(snapshot, 'replace', db, clock)
    expect(res).toMatchObject({ written: 1, removed: 1 })
    expect((await r.archetypes.list()).map((x) => x.id)).toEqual([a.id])
    expect((await r.archetypes.get(extra.id))?.deletedAt).not.toBeNull()
    const keys = (await db.syncOutbox.toArray()).map((o) => o.entityId)
    expect(keys).toContain(extra.id)
  })

  it('merge propaga i tombstone presenti nel backup', async () => {
    const a = await r.archetypes.create(arch('A'))
    clock.advance(1000)
    await r.archetypes.softDelete(a.id)
    const snap = await exportBackup(db, clock)
    const db2 = createTestDb('dst')
    const r2 = createRepos(db2, fakeClock('2025-01-01T00:00:00.000Z', 'z'))
    await importBackup(await exportBackup(createTestDb('x')), 'merge', db2) // vuoto, no-op
    await db2.archetypes.put({ ...(await db.archetypes.get(a.id))!, deletedAt: null, updatedAt: '2025-01-01T00:00:00.000Z' })
    await importBackup(snap, 'merge', db2)
    expect(await r2.archetypes.list()).toHaveLength(0)
  })

  it('rifiuta file non validi, versioni future e id duplicati', async () => {
    expect(() => parseBackup('non json')).toThrow(BackupError)
    expect(() => parseBackup({ app: 'altro' })).toThrow(BackupError)
    const ok = await exportBackup(db, clock)
    expect(() => parseBackup({ ...ok, schemaVersion: 99 })).toThrow(/pi/)
    const a = await r.archetypes.create(arch('A'))
    const dup = await exportBackup(db, clock)
    dup.tables.archetypes.push(dup.tables.archetypes[0]!)
    expect(() => parseBackup(dup)).toThrow(/duplicato/)
    await expect(importBackup({ app: 'decklab', schemaVersion: 1, tables: { archetypes: [{ id: 1 }] } }, 'merge', db)).rejects.toThrow(BackupError)
    // un import fallito non cambia nulla
    expect((await r.archetypes.list()).map((x) => x.id)).toEqual([a.id])
  })
})
