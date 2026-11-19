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
