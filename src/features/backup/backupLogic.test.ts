import { describe, expect, it } from 'vitest'
import { exportBackup, importBackup } from '@/data/backup'
import { createRepos } from '@/data/repo'
import { createTestDb, fakeClock } from '@/data/testing'
import { backupFileName, summarizeBackup } from './backupLogic'

describe('backupLogic', () => {
  it('conta attivi e totali per tipo (tombstone esclusi dagli attivi)', async () => {
    const db = createTestDb('b1')
    const clock = fakeClock()
    const r = createRepos(db, clock)
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    await r.archetypes.create({ name: { it: 'B' }, keyCards: [], starters: [], extenders: [] })
    await r.combos.create({ archetypeId: a.id, variantId: null, tagIds: [], payload: {} })
    await r.tags.create({ name: 't' })
    await r.tags.softDelete((await r.tags.list())[0]!.id)
    const s = summarizeBackup(await exportBackup(db, clock))
    expect(s.archetypes).toEqual({ alive: 2, total: 2 })
    expect(s.combos.alive).toBe(1)
    expect(s.tags).toEqual({ alive: 0, total: 1 })
  })

  it("ripristino con istantanea: l'annullamento riporta lo stato precedente", async () => {
    const db = createTestDb('b2')
    const clock = fakeClock()
    const r = createRepos(db, clock)
    await r.archetypes.create({ name: { it: 'Locale' }, keyCards: [], starters: [], extenders: [] })
    const other = createTestDb('b3')
    const r2 = createRepos(other, fakeClock('2026-01-01T00:00:00.000Z', 'x'))
    await r2.archetypes.create({ name: { it: 'Remoto' }, keyCards: [], starters: [], extenders: [] })
    const backup = await exportBackup(other)
    const snapshot = JSON.stringify(await exportBackup(db, clock))
    clock.advance(1000)
    await importBackup(backup, 'replace', db, clock)
    expect((await r.archetypes.list()).map((a) => a.name.it)).toEqual(['Remoto'])
    clock.advance(1000)
    await importBackup(snapshot, 'replace', db, clock)
    expect((await r.archetypes.list()).map((a) => a.name.it)).toEqual(['Locale'])
  })

  it('nome file con la data', () => {
    expect(backupFileName(new Date('2026-11-19T10:00:00Z'))).toBe('decklab-backup-2026-11-19.json')
  })
})
