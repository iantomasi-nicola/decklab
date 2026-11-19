import { liveQuery, type Observable } from 'dexie'
import type { Archetype, Localized, Meta, Variant } from '@/domain/types'
import {
  db as defaultDb,
  type BoardRecord,
  type ComboRecord,
  type DecklabDB,
  type Entity,
  type SettingRecord,
  type SyncTable,
  type TagRecord,
} from './db'
import { systemClock, writeEntities, type Clock } from './outbox'

/** Dati di creazione: tutto tranne i metadati gestiti dal repository (id opzionale). */
export type NewEntity<T extends SyncTable> = Omit<Entity<T>, keyof Meta> & { id?: string }
export type EntityPatch<T extends SyncTable> = Partial<Omit<Entity<T>, keyof Meta>>

export interface Repo<T extends SyncTable> {
  create(input: NewEntity<T>): Promise<Entity<T>>
  get(id: string): Promise<Entity<T> | undefined>
  update(id: string, patch: EntityPatch<T>): Promise<Entity<T>>
  /** Cancellazione logica (deletedAt = ora); propaga ai figli dove ha senso. */
  softDelete(id: string): Promise<void>
  restore(id: string): Promise<void>
  /** Entita' non cancellate. */
  list(): Promise<Entity<T>[]>
  /** Come `list` ma live (liveQuery): si riesegue a ogni modifica locale o proveniente dal sync. */
  watchList(): Observable<Entity<T>[]>
  watch(id: string): Observable<Entity<T> | undefined>
}

const alive = <E extends Meta>(rows: E[]) => rows.filter((r) => r.deletedAt === null)

/** Suffisso " (copia)"/" (copy)" per i nomi duplicati. */
export function copyName(name: Localized): Localized {
  const out: Localized = {}
  if (name.it !== undefined) out.it = `${name.it} (copia)`
  if (name.en !== undefined) out.en = `${name.en} (copy)`
  return out
}

/** UUID deterministico (formato v4) dalla chiave: due dispositivi ottengono lo stesso id per la stessa impostazione. */
export function settingId(key: string): string {
  const h = (seed: number) => {
    let x = seed >>> 0
    for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 0x01000193) >>> 0
    return x.toString(16).padStart(8, '0')
  }
  const hex = h(0x811c9dc5) + h(0x1b873593) + h(0xcc9e2d51) + h(0x85ebca6b)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export function createRepos(db: DecklabDB = defaultDb, clock: Clock = systemClock) {
  /** Esegue fn in una transazione rw su `tables` + outbox. */
  const tx = <R>(tables: SyncTable[], fn: () => Promise<R>): Promise<R> =>
    db.transaction('rw', [...tables.map((t) => db.table(t)), db.syncOutbox], fn)

  function base<T extends SyncTable>(table: T, extraTables: SyncTable[] = []) {
    const t = () => db.entities(table)

    async function create(input: NewEntity<T>): Promise<Entity<T>> {
      const entity = { ...input, id: input.id ?? clock.uuid(), updatedAt: '', deletedAt: null } as unknown as Entity<T>
      return tx([table], async () => (await writeEntities(db, table, [entity], clock.now()))[0]!)
    }

    async function update(id: string, patch: EntityPatch<T>): Promise<Entity<T>> {
      return tx([table], async () => {
        const cur = (await t().get(id)) as Entity<T> | undefined
        if (!cur) throw new Error(`${table}/${id} non trovato`)
        const next = { ...cur, ...patch, id, deletedAt: cur.deletedAt } as Entity<T>
        return (await writeEntities(db, table, [next], clock.now()))[0]!
      })
    }

    async function setDeleted(id: string, deleted: boolean, cascade?: (now: Date, deletedAt: string | null) => Promise<void>) {
      await tx([table, ...extraTables], async () => {
        const cur = (await t().get(id)) as Entity<T> | undefined
        if (!cur) return
        const now = clock.now()
        const deletedAt = deleted ? now.toISOString() : null
        await writeEntities(db, table, [{ ...cur, deletedAt } as Entity<T>], now)
        await cascade?.(now, deletedAt)
      })
    }

    const repo: Repo<T> = {
      create,
      update,
      get: async (id) => (await t().get(id)) as Entity<T> | undefined,
      softDelete: (id) => setDeleted(id, true),
      restore: (id) => setDeleted(id, false),
      list: async () => alive((await t().toArray()) as Meta[]) as Entity<T>[],
      watchList: () => liveQuery(async () => alive((await t().toArray()) as Meta[]) as Entity<T>[]),
      watch: (id) => liveQuery(async () => (await t().get(id)) as Entity<T> | undefined),
    }
    return { repo, setDeleted, t }
  }

  // ---------- archetypes (cascade su varianti e combo) ----------
  const a = base('archetypes', ['variants', 'combos'])
  const v = base('variants', ['combos'])
  const c = base('combos')

  /** Cancella/ripristina i combo di un insieme (per archetipo o variante); al restore ripristina solo i cancellati con lo stesso timestamp. */
  async function cascadeCombos(rows: ComboRecord[], now: Date, deletedAt: string | null, onlyDeletedAt?: string | null) {
    const targets = rows.filter((r) => (deletedAt ? r.deletedAt === null : r.deletedAt !== null && r.deletedAt === onlyDeletedAt))
    if (targets.length) await writeEntities(db, 'combos', targets.map((r) => ({ ...r, deletedAt })), now)
  }

  const archetypes = {
    ...a.repo,
    softDelete: (id: string) => softDeleteArchetype(id, true),
    restore: (id: string) => softDeleteArchetype(id, false),
    duplicate: duplicateArchetype,
  }

  async function softDeleteArchetype(id: string, deleted: boolean) {
    await tx(['archetypes', 'variants', 'combos'], async () => {
      const cur = await db.archetypes.get(id)
      if (!cur) return
      const now = clock.now()
      const stamp = deleted ? now.toISOString() : null
      const prevStamp = cur.deletedAt
      await writeEntities(db, 'archetypes', [{ ...cur, deletedAt: stamp }], now)
      const vs = await db.variants.where('archetypeId').equals(id).toArray()
      const vt = vs.filter((r) => (deleted ? r.deletedAt === null : r.deletedAt !== null && r.deletedAt === prevStamp))
      if (vt.length) await writeEntities(db, 'variants', vt.map((r) => ({ ...r, deletedAt: stamp })), now)
      await cascadeCombos(await db.combos.where('archetypeId').equals(id).toArray(), now, stamp, prevStamp)
    })
  }

  async function duplicateArchetype(id: string): Promise<Archetype> {
    return tx(['archetypes', 'variants', 'combos'], async () => {
      const src = await db.archetypes.get(id)
      if (!src || src.deletedAt !== null) throw new Error(`archetypes/${id} non trovato`)
      const now = clock.now()
      const newId = clock.uuid()
      const [copy] = await writeEntities(
        db,
        'archetypes',
        [{ ...structuredClone(src), id: newId, name: copyName(src.name), deletedAt: null }],
        now,
      )
      const variantIds = new Map<string, string>()
      const vs = alive(await db.variants.where('archetypeId').equals(id).toArray())
      const newVariants = vs.map((r) => {
        const nid = clock.uuid()
        variantIds.set(r.id, nid)
        return { ...structuredClone(r), id: nid, archetypeId: newId }
      })
      if (newVariants.length) await writeEntities(db, 'variants', newVariants, now)
      const cs = alive(await db.combos.where('archetypeId').equals(id).toArray())
      const newCombos = cs.map((r) => ({
        ...structuredClone(r),
        id: clock.uuid(),
        archetypeId: newId,
        variantId: r.variantId === null ? null : (variantIds.get(r.variantId) ?? null),
      }))
      if (newCombos.length) await writeEntities(db, 'combos', newCombos, now)
      return copy!
    })
  }

  // ---------- variants (cascade sui combo) ----------
  const variants = {
    ...v.repo,
    softDelete: (id: string) => softDeleteVariant(id, true),
    restore: (id: string) => softDeleteVariant(id, false),
    listByArchetype: async (archetypeId: string) => alive(await db.variants.where('archetypeId').equals(archetypeId).toArray()),
    watchByArchetype: (archetypeId: string) =>
      liveQuery(async () => alive(await db.variants.where('archetypeId').equals(archetypeId).toArray())),
    duplicate: duplicateVariant,
  }

  async function softDeleteVariant(id: string, deleted: boolean) {
    await tx(['variants', 'combos'], async () => {
      const cur = await db.variants.get(id)
      if (!cur) return
      const now = clock.now()
      const stamp = deleted ? now.toISOString() : null
      await writeEntities(db, 'variants', [{ ...cur, deletedAt: stamp }], now)
      await cascadeCombos(await db.combos.where('variantId').equals(id).toArray(), now, stamp, cur.deletedAt)
    })
  }

  /** Duplica una variante (e i suoi combo) nello stesso archetipo o in `targetArchetypeId`. */
  async function duplicateVariant(id: string, targetArchetypeId?: string): Promise<Variant> {
    return tx(['variants', 'combos'], async () => {
      const src = await db.variants.get(id)
      if (!src || src.deletedAt !== null) throw new Error(`variants/${id} non trovato`)
      const now = clock.now()
      const newId = clock.uuid()
      const archetypeId = targetArchetypeId ?? src.archetypeId
      const [copy] = await writeEntities(
        db,
        'variants',
        [{ ...structuredClone(src), id: newId, archetypeId, name: copyName(src.name), deletedAt: null }],
        now,
      )
      const cs = alive(await db.combos.where('variantId').equals(id).toArray())
      const newCombos = cs.map((r) => ({ ...structuredClone(r), id: clock.uuid(), archetypeId, variantId: newId }))
      if (newCombos.length) await writeEntities(db, 'combos', newCombos, now)
      return copy!
    })
  }

  // ---------- combos ----------
  const combos = {
    ...c.repo,
    listByArchetype: async (archetypeId: string) => alive(await db.combos.where('archetypeId').equals(archetypeId).toArray()),
    listByVariant: async (variantId: string) => alive(await db.combos.where('variantId').equals(variantId).toArray()),
    watchByArchetype: (archetypeId: string) =>
      liveQuery(async () => alive(await db.combos.where('archetypeId').equals(archetypeId).toArray())),
    watchByVariant: (variantId: string) =>
      liveQuery(async () => alive(await db.combos.where('variantId').equals(variantId).toArray())),
    /** Duplica un combo (nuovo UUID); opzionalmente lo sposta su un'altra variante. */
    duplicate: async (id: string, targetVariantId?: string | null): Promise<ComboRecord> =>
      tx(['combos'], async () => {
        const src = await db.combos.get(id)
        if (!src || src.deletedAt !== null) throw new Error(`combos/${id} non trovato`)
        const variantId = targetVariantId === undefined ? src.variantId : targetVariantId
        const name = src.name ? copyName(src.name) : undefined
        const copy = { ...structuredClone(src), id: clock.uuid(), variantId, deletedAt: null, ...(name ? { name } : {}) }
        return (await writeEntities(db, 'combos', [copy], clock.now()))[0]!
      }),
  }

  const boards = base('boards').repo
  const tags = base('tags').repo

  // ---------- settings (chiave -> valore, id deterministico) ----------
  const settingsBase = base('settings')
  const settings = {
    get: async (key: string): Promise<unknown> => {
      const row = await db.settings.where('key').equals(key).first()
      return row && row.deletedAt === null ? row.value : undefined
    },
    set: async (key: string, value: unknown): Promise<SettingRecord> =>
      tx(['settings'], async () => {
        const id = settingId(key)
        const cur = await db.settings.get(id)
        const next: SettingRecord = { id, key, value, updatedAt: cur?.updatedAt ?? '', deletedAt: null }
        return (await writeEntities(db, 'settings', [next], clock.now()))[0]!
      }),
    remove: (key: string) => settingsBase.repo.softDelete(settingId(key)),
    list: settingsBase.repo.list,
    watchList: settingsBase.repo.watchList,
    watch: (key: string) => liveQuery(async () => {
      const row = await db.settings.where('key').equals(key).first()
      return row && row.deletedAt === null ? row.value : undefined
    }),
  }

  return { archetypes, variants, combos, boards, tags, settings }
}

export type Repos = ReturnType<typeof createRepos>
export type { BoardRecord, ComboRecord, SettingRecord, TagRecord }

/** Repository dell'app (database di default). */
export const repos = createRepos()
