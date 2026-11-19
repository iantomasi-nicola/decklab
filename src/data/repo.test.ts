import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DecklabDB } from './db'
import { createRepos, settingId, type Repos } from './repo'
import { createTestDb, fakeClock } from './testing'

const deck = { main: [1], extra: [], side: [] }
const variantInput = (archetypeId: string, n = 'V') => ({
  archetypeId,
  name: { it: n, en: n },
  deck,
  rules: 'TCG' as const,
  banlist: { format: 'TCG' as const, id: '2026.10' },
})

let db: DecklabDB
let r: Repos
let clock: ReturnType<typeof fakeClock>

beforeEach(() => {
  db = createTestDb()
  clock = fakeClock()
  r = createRepos(db, clock)
})

describe('repository', () => {
  it('create imposta meta e scrive la riga outbox nella stessa transazione', async () => {
    const a = await r.archetypes.create({ name: { it: 'Tenpai' }, keyCards: [], starters: [], extenders: [] })
    expect(a.updatedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(a.deletedAt).toBeNull()
    const ob = await db.syncOutbox.toArray()
    expect(ob).toHaveLength(1)
    expect(ob[0]).toMatchObject({ table: 'archetypes', entityId: a.id, rev: 1 })
  })

  it('una scrittura che fallisce non lascia righe outbox (atomicita)', async () => {
    await expect(r.archetypes.update('missing', { keyCards: [1] })).rejects.toThrow()
    expect(await db.syncOutbox.count()).toBe(0)
  })

  it('update coalesce l\'outbox, incrementa rev e rende updatedAt strettamente crescente', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const u = await r.archetypes.update(a.id, { keyCards: [5] })
    expect(u.updatedAt > a.updatedAt).toBe(true)
    const ob = await db.syncOutbox.toArray()
    expect(ob).toHaveLength(1)
    expect(ob[0]?.rev).toBe(2)
  })

  it('list esclude i cancellati e softDelete lascia il tombstone', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    await r.archetypes.softDelete(a.id)
    expect(await r.archetypes.list()).toHaveLength(0)
    expect((await r.archetypes.get(a.id))?.deletedAt).not.toBeNull()
    await r.archetypes.restore(a.id)
    expect(await r.archetypes.list()).toHaveLength(1)
  })

  it('softDelete di un archetipo propaga a varianti e combo; restore li ripristina', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    const c = await r.combos.create({ archetypeId: a.id, variantId: v.id, tagIds: [], payload: { x: 1 } })
    await r.archetypes.softDelete(a.id)
    expect(await r.variants.listByArchetype(a.id)).toHaveLength(0)
    expect(await r.combos.listByVariant(v.id)).toHaveLength(0)
    expect((await db.syncOutbox.toArray()).map((o) => o.entityId).sort()).toEqual([a.id, v.id, c.id].sort())
    await r.archetypes.restore(a.id)
    expect(await r.variants.listByArchetype(a.id)).toHaveLength(1)
    expect(await r.combos.listByVariant(v.id)).toHaveLength(1)
  })

  it('duplicate archetipo: nuovi UUID, relazioni rimappate, originale intatto', async () => {
    const a = await r.archetypes.create({ name: { it: 'Tenpai', en: 'Tenpai' }, keyCards: [1], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    await r.combos.create({ archetypeId: a.id, variantId: v.id, tagIds: [], payload: { p: [1, 2] } })
    await r.combos.create({ archetypeId: a.id, variantId: null, tagIds: [], payload: 'gen' })
    const copy = await r.archetypes.duplicate(a.id)
    expect(copy.id).not.toBe(a.id)
    expect(copy.name).toEqual({ it: 'Tenpai (copia)', en: 'Tenpai (copy)' })
    const vs = await r.variants.listByArchetype(copy.id)
    expect(vs).toHaveLength(1)
    expect(vs[0]!.id).not.toBe(v.id)
    const cs = await r.combos.listByArchetype(copy.id)
    expect(cs).toHaveLength(2)
    expect(cs.find((x) => x.variantId !== null)?.variantId).toBe(vs[0]!.id)
    expect(cs.find((x) => x.variantId === null)).toBeTruthy()
    expect(await r.variants.listByArchetype(a.id)).toHaveLength(1)
    expect(await r.combos.listByArchetype(a.id)).toHaveLength(2)
    // nessuna condivisione di riferimenti: modificare la copia non tocca l'originale
    await r.variants.update(vs[0]!.id, { deck: { main: [9], extra: [], side: [] } })
    expect((await r.variants.get(v.id))?.deck.main).toEqual([1])
  })

  it('duplicate variante (con combo) e combo', async () => {
    const a = await r.archetypes.create({ name: { it: 'A' }, keyCards: [], starters: [], extenders: [] })
    const v = await r.variants.create(variantInput(a.id))
    const c = await r.combos.create({ archetypeId: a.id, variantId: v.id, tagIds: ['t'], payload: 1 })
    const v2 = await r.variants.duplicate(v.id)
    expect(v2.id).not.toBe(v.id)
    const cs = await r.combos.listByVariant(v2.id)
    expect(cs).toHaveLength(1)
    expect(cs[0]!.id).not.toBe(c.id)
    const c2 = await r.combos.duplicate(c.id)
    expect(c2.id).not.toBe(c.id)
    expect(c2.variantId).toBe(v.id)
  })

  it('settings: id deterministico per chiave, set/get/remove', async () => {
    expect(settingId('lang')).toBe(settingId('lang'))
    expect(settingId('lang')).not.toBe(settingId('theme'))
    expect(settingId('lang')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    await r.settings.set('lang', 'it')
    await r.settings.set('lang', 'en')
    expect(await r.settings.get('lang')).toBe('en')
    expect(await db.settings.count()).toBe(1)
    await r.settings.remove('lang')
    expect(await r.settings.get('lang')).toBeUndefined()
  })

  it('watchList e\' live', async () => {
    const seen: number[] = []
    const sub = r.tags.watchList().subscribe((rows) => seen.push(rows.length))
    await vi.waitFor(() => expect(seen[0]).toBe(0))
    await r.tags.create({ name: 'x' })
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1))
    sub.unsubscribe()
  })
})
