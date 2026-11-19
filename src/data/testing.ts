import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { createDb, type DecklabDB } from './db'
import type { Clock } from './outbox'

/** Database isolato in memoria (una IDBFactory propria per ogni "dispositivo"). Solo per i test. */
export function createTestDb(name = 'test'): DecklabDB {
  return createDb(name, { indexedDB: new IDBFactory(), IDBKeyRange })
}

/** Orologio controllabile con uuid sequenziali (leggibili nei test). */
export function fakeClock(startIso = '2026-01-01T00:00:00.000Z', prefix = 'id'): Clock & { set(iso: string): void; advance(ms: number): void } {
  let t = new Date(startIso).getTime()
  let n = 0
  return {
    now: () => new Date(t),
    uuid: () => `${prefix}-${++n}`,
    set: (iso) => { t = new Date(iso).getTime() },
    advance: (ms) => { t += ms },
  }
}
