import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

/** Passcode reali del dataset. */
export const K = {
  ash: 14558127,
  tengu: 10028593,
  rooklord: 10060427,
  xyz: 10000030,
  spell: 10065487,
  trap: 10045474,
  pend: 10024317,
  forbidden: 1041278, // Proibita nella banlist TCG attuale
}
const FILLER = [1003028, 1003840, 1005587, 1006081, 1033312, 1036974, 1045143, 1050186, 1050355, 1050684, 1061200, 1073952, 1082946, 1102515, 1118137, 1127737, 1142880, 1149109, 1151281, 1154611, 1157683, 1187243, 1197847, 1200843, 1218214, 1224927, 1225009, 1248895, 1264319, 1274455, 1278431, 1287123, 1295111, 1295442]

const mz = (seq: number, pos = 'FACEUP_ATK') => ({ loc: 'mzone', seq, pos })

/** Combo di prova: 7 passi con catena, un ramo contro Ash Blossom, Xyz finale. */
export function sampleDoc(opts: { id: string; archetypeId: string; legal: boolean; derivedFrom?: { comboId: string; afterStep: string | null }; title?: { it: string; en: string }; now: string }) {
  const main = [K.tengu, K.spell, K.trap, K.pend, K.rooklord, ...FILLER].slice(0, 39)
  main.push(opts.legal ? K.ash : K.forbidden)
  return {
    format: 'combolab.combo',
    v: 1,
    meta: {
      id: opts.id,
      title: opts.title ?? { it: 'Apertura con Xyz e Impermanenza', en: 'Xyz opener with Impermanence' },
      scope: 'archetype',
      archetype: { id: opts.archetypeId, name: { it: 'Prova', en: 'Test' } },
      variant: null,
      rules: 'TCG',
      banlist: { format: 'TCG', id: '2026.10' },
      tags: [],
      noteLang: ['it', 'en'],
      favorite: false,
      createdAt: opts.now,
      updatedAt: opts.now,
      source: 'manual',
      ...(opts.derivedFrom ? { derivedFrom: opts.derivedFrom } : {}),
    },
    deck: { main, extra: [K.xyz], side: [] },
    cards: { u1: K.tengu, u2: K.spell, u3: K.trap, u5: K.pend, u6: K.xyz, o1: K.ash, o2: K.rooklord },
    setup: {
      first: true,
      hand: { required: ['u1', 'u2'], size: 5, fill: 'random' },
      own: { lp: 8000, places: [{ uid: 'u3', place: { loc: 'szone', seq: 3, pos: 'FACEDOWN' } }] },
      opponent: {
        board: {
          lp: 8000,
          places: [
            { uid: 'o1', place: { p: 1, loc: 'hand' } },
            { uid: 'o2', place: { p: 1, loc: 'mzone', seq: 2, pos: 'FACEUP_ATK' } },
          ],
        },
        interrupts: [],
      },
    },
    steps: [
      { id: 's1', action: 'normalSummon', card: 'u1', to: mz(2), moves: [{ uid: 'u1', to: mz(2), why: 'summon' }], note: { it: 'Evoca @u1 come apertura.', en: 'Normal Summon @u1 to start.' } },
      {
        id: 's2', action: 'activate', card: 'u2', effect: { kind: 'activation', index: 1 }, chain: { id: 'c1', link: 1 }, searched: ['u5'],
        moves: [{ uid: 'u2', to: { loc: 'szone', seq: 1, pos: 'FACEUP' }, why: 'other' }, { uid: 'u5', to: { loc: 'hand' }, why: 'search' }],
        note: { it: 'Cerca @Parametalfosi Melcaster. Se arriva @Ash Blossom, vai al ramo.', en: 'Search @Parametalfoes Melcaster. If @Ash Blossom arrives, follow the branch.' },
      },
      {
        id: 's3', action: 'chainActivate', card: 'u3', chain: { id: 'c1', link: 2 }, targets: ['o2'],
        moves: [{ uid: 'u3', to: { loc: 'szone', seq: 3, pos: 'FACEUP' }, why: 'other' }],
        note: { it: 'In risposta, @u3 sul mostro avversario.', en: 'In response, @u3 on the opponent monster.' },
      },
      { id: 's4', action: 'resolve', ref: 's3', moves: [{ uid: 'u3', to: { loc: 'gy' }, why: 'send' }, { uid: 'o2', to: { loc: 'gy' }, why: 'destroy' }] },
      { id: 's5', action: 'resolve', ref: 's2', moves: [{ uid: 'u2', to: { loc: 'gy' }, why: 'send' }] },
      { id: 's6', action: 'specialSummon', method: 'procedure', card: 'u5', moves: [{ uid: 'u5', to: mz(4), why: 'summon' }], optional: true, group: 'g1' },
      {
        id: 's7', action: 'specialSummon', method: 'xyz', card: 'u6',
        moves: [
          { uid: 'u1', to: { loc: 'overlay', seq: 0, host: 'u6' }, why: 'material' },
          { uid: 'u5', to: { loc: 'overlay', seq: 1, host: 'u6' }, why: 'material' },
          { uid: 'u6', to: { loc: 'emz', seq: 0, pos: 'FACEUP_ATK' }, why: 'summon' },
        ],
        note: { it: 'Xyz con i due mostri: finale della linea.', en: 'Xyz with both monsters: the end of the line.' },
      },
    ],
    branches: [
      {
        id: 'b1',
        title: { it: 'Ash sulla ricerca', en: 'Ash on the search' },
        condition: { afterStep: 's2', window: 'activation', opponent: { code: K.ash, effect: 1 } },
        steps: [
          { id: 'b1s1', action: 'chainActivate', card: 'u3', chain: { id: 'c2', link: 2 }, targets: ['o1'], moves: [{ uid: 'u3', to: { loc: 'szone', seq: 3, pos: 'FACEUP' }, why: 'other' }], note: { it: 'Rispondi con @u3 su @Ash.', en: 'Respond with @u3 on @Ash.' } },
          { id: 'b1s2', action: 'resolve', ref: 'b1s1', moves: [{ uid: 'u3', to: { loc: 'gy' }, why: 'send' }, { uid: 'o1', to: { loc: 'gy' }, why: 'destroy' }] },
        ],
        rejoin: 's5',
        note: { it: 'La ricerca va a buon fine comunque.', en: 'The search goes through anyway.' },
      },
    ],
  }
}

export interface Seeded { motherId: string; variantId: string; illegalId: string; emptyId: string }

/** Scrive in IndexedDB: combo madre (legale), variante derivata dal passo 3, combo con carta proibita e combo vuota. */
export const newIds = (): Seeded => ({ motherId: randomUUID(), variantId: randomUUID(), illegalId: randomUUID(), emptyId: randomUUID() })

export async function seedGuide(page: Page): Promise<Seeded> {
  const ids = newIds()
  await seedGuideWithIds(page, ids)
  return ids
}

/** Stessi documenti con id dati (ogni test Playwright ha un IndexedDB nuovo). */
export async function seedGuideWithIds(page: Page, ids: Seeded): Promise<void> {
  const now = new Date().toISOString()
  const archetypeId = randomUUID()
  const docs = [
    sampleDoc({ id: ids.motherId, archetypeId, legal: true, now }),
    sampleDoc({ id: ids.variantId, archetypeId, legal: true, now, derivedFrom: { comboId: ids.motherId, afterStep: 's3' }, title: { it: 'Variante senza Impermanenza', en: 'Variant without Impermanence' } }),
    sampleDoc({ id: ids.illegalId, archetypeId, legal: false, now, title: { it: 'Con carta proibita', en: 'With a forbidden card' } }),
    { ...sampleDoc({ id: ids.emptyId, archetypeId, legal: true, now, title: { it: 'Combo vuota', en: 'Empty combo' } }), steps: [], branches: [] },
  ]
  await page.goto('/combo')
  await page.getByTestId('new-combo').waitFor()
  await page.evaluate(
    async ({ docs, archetypeId, now }) => {
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open('decklab')
        r.onsuccess = () => res(r.result)
        r.onerror = () => rej(r.error)
      })
      await new Promise<void>((res, rej) => {
        const tx = db.transaction(['archetypes', 'combos'], 'readwrite')
        tx.objectStore('archetypes').put({ id: archetypeId, name: { it: 'Prova', en: 'Test' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
        for (const d of docs as { meta: { id: string; title: unknown } }[])
          tx.objectStore('combos').put({ id: d.meta.id, archetypeId, variantId: null, name: d.meta.title, tagIds: [], payload: d, updatedAt: now, deletedAt: null })
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      })
      db.close()
    },
    { docs, archetypeId, now },
  )
}
