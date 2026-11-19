import type { Locator, Page } from '@playwright/test'

/** Passcode reali del dataset (verificati su public/data). */
export const C = {
  ash: 14558127, // Mostro Lv3
  tengu: 10028593, // Reborn Tengu, Lv4
  rooklord: 10060427, // Lv7 (servono tributi)
  xyz: 10000030, // Xyz
  link: 10019086, // Link
  spell: 10065487, // Magia Normale
  trap: 10045474, // Trappola
  field: 10080320, // Magia Terreno
  equip: 10004783, // Magia Equipaggiamento
  pendulum: 10024317, // Mostro Pendulum
}

type Pl = { loc: string; seq?: number; pos?: string; p?: 0 | 1; host?: string }
export interface SeedCombo {
  /** uid → passcode */
  cards: Record<string, number>
  hand?: string[]
  own?: { uid: string; place: Pl }[]
  opp?: { uid: string; place: Pl }[]
  deck?: { main: number[]; extra: number[] }
  counters?: Record<string, Record<string, number>>
}

/** Scrive direttamente in IndexedDB (schema Dexie) un archetipo e una combo pronta; ritorna l'id della combo. */
export async function seedCombo(page: Page, s: SeedCombo): Promise<string> {
  await page.goto('/combo')
  await page.getByTestId('new-combo').waitFor()
  const id = await page.evaluate(async (s) => {
    const now = new Date().toISOString()
    const comboId = crypto.randomUUID()
    const archetypeId = crypto.randomUUID()
    const doc = {
      format: 'combolab.combo',
      v: 1,
      meta: {
        id: comboId,
        title: { it: 'Prova', en: 'Test' },
        scope: 'archetype',
        archetype: { id: archetypeId, name: { it: 'Prova', en: 'Test' } },
        variant: null,
        rules: 'TCG',
        banlist: { format: 'TCG', id: '' },
        tags: [],
        noteLang: [],
        favorite: false,
        createdAt: now,
        updatedAt: now,
        source: 'manual',
      },
      deck: { main: s.deck?.main ?? [], extra: s.deck?.extra ?? [], side: [] },
      cards: s.cards,
      setup: {
        first: true,
        hand: { required: s.hand ?? [], size: Math.max(5, (s.hand ?? []).length), fill: 'none' },
        own: { lp: 8000, places: s.own ?? [], ...(s.counters ? { counters: s.counters } : {}) },
        opponent: { board: { lp: 8000, places: (s.opp ?? []).map((o) => ({ ...o, place: { p: 1, ...o.place } })) }, interrupts: [] },
      },
      steps: [],
      branches: [],
    }
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('decklab')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['archetypes', 'combos'], 'readwrite')
      tx.objectStore('archetypes').put({ id: archetypeId, name: { it: 'Prova', en: 'Test' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
      tx.objectStore('combos').put({ id: comboId, archetypeId, variantId: null, name: doc.meta.title, tagIds: [], payload: doc, updatedAt: now, deletedAt: null })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    return comboId
  }, s)
  return id
}

export async function openCombo(page: Page, id: string, lang: 'it' | 'en' = 'en', theme: 'dark' | 'light' = 'dark') {
  await page.addInitScript(([l, t]) => {
    localStorage.setItem('combolab.lang', l!)
    localStorage.setItem('combolab.theme', t!)
  }, [lang, theme])
  await page.goto(`/combo/${id}`)
  await page.waitForSelector('[data-field]')
  // aspetta che i nomi delle carte siano caricati (dataset pronto)
  await page.waitForTimeout(300)
}

export const card = (page: Page, uid: string): Locator => page.locator(`[data-card="${uid}"]`)
export const zone = (page: Page, key: string): Locator => page.locator(`[data-zone="${key}"]`)

async function center(l: Locator) {
  const b = await l.boundingBox()
  if (!b) throw new Error('elemento non visibile')
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Trascinamento reale con il mouse (sopra la soglia di 4 px). */
export async function mouseDrag(page: Page, from: Locator, to: Locator, mods: ('Shift' | 'Alt' | 'Control')[] = []) {
  const a = await center(from)
  const b = await center(to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 3 })
  await page.mouse.move(b.x, b.y, { steps: 12 })
  for (const m of mods) await page.keyboard.down(m)
  await page.waitForTimeout(60)
  await page.mouse.up()
  for (const m of mods) await page.keyboard.up(m)
}

/** Trascinamento touch reale tramite CDP (Input.dispatchTouchEvent): pressione di ~250 ms, poi movimento. */
export async function touchDrag(page: Page, from: Locator, to: Locator, o: { hold?: number } = {}) {
  const a = await center(from)
  const b = await center(to)
  const cdp = await page.context().newCDPSession(page)
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number, y?: number) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x!, y: y!, id: 1 }] })
  await send('touchStart', a.x, a.y)
  await page.waitForTimeout(o.hold ?? 350)
  const n = 10
  for (let i = 1; i <= n; i++) {
    await send('touchMove', a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(50)
  await send('touchEnd')
  await cdp.detach()
}

export async function chooseMenu(page: Page, action: string) {
  await page.locator(`[data-pop-menu] [data-action="${action}"]`).click()
}

/** Passi salvati (dopo l'autosalvataggio). */
export async function savedSteps(page: Page): Promise<Array<Record<string, unknown>>> {
  const comboId = page.url().split('/').pop()!
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('decklab')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const rec = await new Promise<{ payload: { steps: Array<Record<string, unknown>> } }>((res) => {
      const q = db.transaction('combos').objectStore('combos').get(id)
      q.onsuccess = () => res(q.result)
    })
    db.close()
    return rec.payload.steps
  }, comboId)
}

/** Apre il pannello dei passi (chiuso di default) se non è già aperto. */
export async function openPanel(page: Page) {
  if ((await page.locator('[data-panel]').count()) === 0) await page.getByTestId('panel-toggle').click()
  await page.locator('[data-panel]').first().waitFor()
}

/** Combo lunga (n passi) generata qui: per ogni carta k una Evocazione Normale e un "manda al Cimitero"; una catena e un gruppo "ordine libero". */
export function longDoc(n = 60) {
  const pairs = Math.ceil(n / 2)
  const cards: Record<string, number> = {}
  const codes = [C.ash, C.tengu, C.rooklord, C.xyz, C.spell, C.trap]
  const uids: string[] = []
  for (let k = 1; k <= pairs; k++) {
    cards[`u${k}`] = codes[k % codes.length]!
    uids.push(`u${k}`)
  }
  const steps: Array<Record<string, unknown>> = []
  for (let k = 1; k <= pairs && steps.length < n; k++) {
    const uid = `u${k}`
    steps.push({
      id: `s${steps.length + 1}`,
      action: 'normalSummon',
      card: uid,
      from: { p: 0, loc: 'hand', seq: k - 1 },
      to: { p: 0, loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' },
      moves: [{ uid, from: { p: 0, loc: 'hand', seq: k - 1 }, to: { p: 0, loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' }, why: 'summon' }],
      note: k % 5 === 0 ? { it: `Nota del passo ${steps.length + 1}`, en: `Note on step ${steps.length + 1}` } : undefined,
    })
    if (steps.length >= n) break
    steps.push({
      id: `s${steps.length + 1}`,
      action: 'sendToGY',
      card: uid,
      moves: [{ uid, from: { p: 0, loc: 'mzone', seq: 0, pos: 'FACEUP_ATK' }, to: { p: 0, loc: 'gy', seq: k }, why: 'send' }],
    })
  }
  // catena (passi 11–13) e gruppo "ordine libero" (passi 21–23)
  for (const [i, link] of [[10, 1], [11, 2], [12, 3]] as const) steps[i]!.chain = { id: 'ch1', link }
  for (const i of [20, 21, 22]) steps[i]!.group = 'g1'
  const now = new Date().toISOString()
  return {
    format: 'combolab.combo',
    v: 1,
    meta: {
      id: 'long',
      title: { it: 'Combo lunga', en: 'Long combo' },
      scope: 'archetype',
      archetype: { name: { it: 'Prova', en: 'Test' } },
      variant: null,
      rules: 'TCG',
      banlist: { format: 'TCG', id: '' },
      tags: [],
      noteLang: ['it', 'en'],
      favorite: false,
      createdAt: now,
      updatedAt: now,
      source: 'manual',
    },
    deck: { main: uids.map((u) => cards[u]!), extra: [], side: [] },
    cards,
    setup: { first: true, hand: { required: uids, size: Math.max(5, uids.length), fill: 'none' }, own: { lp: 8000, places: [] }, opponent: { board: { lp: 8000, places: [] }, interrupts: [] } },
    steps,
    branches: [],
  }
}

/** Scrive in IndexedDB una combo completa (documento già pronto) e ritorna l'id del record. */
export async function seedDoc(page: Page, doc: unknown): Promise<string> {
  await page.goto('/combo')
  await page.getByTestId('new-combo').waitFor()
  return page.evaluate(async (d) => {
    const id = crypto.randomUUID()
    const archetypeId = crypto.randomUUID()
    const now = new Date().toISOString()
    const doc = JSON.parse(JSON.stringify(d)) as { meta: { id: string; title: object } }
    doc.meta.id = id
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('decklab')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['archetypes', 'combos'], 'readwrite')
      tx.objectStore('archetypes').put({ id: archetypeId, name: { it: 'Prova', en: 'Test' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
      tx.objectStore('combos').put({ id, archetypeId, variantId: null, name: doc.meta.title, tagIds: [], payload: doc, updatedAt: now, deletedAt: null })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    return id
  }, doc)
}
