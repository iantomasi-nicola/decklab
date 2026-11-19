import { beforeEach, describe, expect, it } from 'vitest'
import type { DecklabDB } from './db'
import { createRepos, type Repos } from './repo'
import { createTestDb, fakeClock } from './testing'
import { listSidePlans } from './sidePlans'
import { exportBackup, importBackup } from './backup'

let db: DecklabDB
let r: Repos
let clock: ReturnType<typeof fakeClock>

const planInput = (variantId: string, name = 'Snake-Eye') => ({
  variantId,
  matchup: { name, note: '', turn: 'first' as const },
  outs: [{ cardId: 1, count: 2 }],
  ins: [{ cardId: 9, count: 2 }],
})
const variantInput = (archetypeId: string) => ({
  archetypeId,
  name: { it: 'V' },
  deck: { main: [1], extra: [], side: [9] },
  rules: 'TCG' as const,
  banlist: { format: 'TCG' as const, id: '2026.10' },
})

beforeEach(() => {
  db = createTestDb()
  clock = fakeClock()
  r = createRepos(db, clock)
})

describe('sidePlans', () => {
  it('create/list per variante, ordinati per nome e turno; entra nell\'outbox', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    const w = await r.variants.create(variantInput(a.id))
    await r.sidePlans.create(planInput(v.id, 'Zeta'))
    await r.sidePlans.create({ ...planInput(v.id, 'Alfa'), matchup: { name: 'Alfa', note: '', turn: 'second' } })
    await r.sidePlans.create({ ...planInput(v.id, 'Alfa') })
    await r.sidePlans.create(planInput(w.id))
    const list = await listSidePlans(v.id, r)
    expect(list.map((p) => `${p.matchup.name}/${p.matchup.turn}`)).toEqual(['Alfa/first', 'Alfa/second', 'Zeta/first'])
    expect((await db.syncOutbox.toArray()).filter((o) => o.table === 'sidePlans')).toHaveLength(4)
  })

  it('duplicate: nuovo id, turno e nome sovrascrivibili', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    const p = await r.sidePlans.create(planInput(v.id))
    const c = await r.sidePlans.duplicate(p.id, { name: 'Snake-Eye (copia)', turn: 'second' })
    expect(c.id).not.toBe(p.id)
    expect(c.matchup).toMatchObject({ name: 'Snake-Eye (copia)', turn: 'second' })
    expect(c.outs).toEqual(p.outs)
  })

  it('soft delete della variante propaga ai piani e il restore li riporta', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    const gone = await r.sidePlans.create(planInput(v.id, 'Gia cancellato'))
    await r.sidePlans.softDelete(gone.id)
    clock.advance(5000)
    await r.sidePlans.create(planInput(v.id, 'Vivo'))
    await r.variants.softDelete(v.id)
    expect(await listSidePlans(v.id, r)).toHaveLength(0)
    await r.variants.restore(v.id)
    expect((await listSidePlans(v.id, r)).map((p) => p.matchup.name)).toEqual(['Vivo'])
  })

  it('duplicare variante e archetipo copia anche i piani', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    await r.sidePlans.create(planInput(v.id))
    const v2 = await r.variants.duplicate(v.id)
    expect(await listSidePlans(v2.id, r)).toHaveLength(1)
    const a2 = await r.archetypes.duplicate(a.id)
    const vs = await r.variants.listByArchetype(a2.id)
    expect(vs).toHaveLength(2)
    for (const x of vs) expect(await listSidePlans(x.id, r)).toHaveLength(1)
  })

  it('il backup include i piani e un backup v1 (senza sidePlans) si importa', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    await r.sidePlans.create(planInput(v.id))
    const b = await exportBackup(db)
    expect(b.schemaVersion).toBe(2)
    expect(b.tables.sidePlans).toHaveLength(1)
    const old = { ...b, schemaVersion: 1, tables: { ...b.tables, sidePlans: undefined } }
    const db2 = createTestDb('other')
    const res = await importBackup(JSON.parse(JSON.stringify(old)), 'merge', db2)
    expect(res.written).toBe(2)
    expect(await db2.sidePlans.count()).toBe(0)
  })
})
