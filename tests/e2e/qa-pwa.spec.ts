import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'

/** PWA sulla build di produzione: manifest/icone/share target, offline dopo la prima visita, errore chiaro senza rete né cache. */
mkdirSync('test-results/pwa', { recursive: true })

const cached = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    const c = await caches.open(n)
    return (await c.keys()).map((r) => new URL(r.url).pathname)
  }, name)

test('manifest, icone e share target presenti', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(href).toBeTruthy()
  const m = await (await request.get(href!)).json()
  expect(m.name).toBe('Combo Lab')
  expect(m.display).toBe('standalone')
  expect(m.start_url).toBe('/')
  expect(m.share_target?.action).toBe('/share-target')
  expect(m.share_target?.method).toBe('POST')
  expect(m.share_target?.params?.files?.[0]?.name).toBe('files')
  const sizes = new Set((m.icons as { sizes: string; purpose?: string }[]).map((i) => `${i.sizes}:${i.purpose ?? 'any'}`))
  expect(sizes.has('192x192:any')).toBe(true)
  expect(sizes.has('512x512:any')).toBe(true)
  expect(sizes.has('512x512:maskable')).toBe(true)
  for (const i of m.icons as { src: string; type: string }[]) {
    const r = await request.get(i.src.startsWith('/') ? i.src : `/${i.src}`)
    expect(r.ok(), `icona ${i.src}`).toBe(true)
    expect(r.headers()['content-type']).toContain(i.type.split('/')[1]!.replace('svg', 'svg'))
  }
  expect(await page.locator('link[rel=apple-touch-icon]').count()).toBeGreaterThan(0)
  expect(await page.locator('meta[name=theme-color]').count()).toBeGreaterThan(0)
})

test('offline dopo la prima visita: app shell, rotte e dataset da cache', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/mazzi')
  await expect(page.locator('h1')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // da qui la pagina è controllata dal service worker
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  // dataset: scaricato a runtime dalla pagina che lo usa (nuova variante apre la ricerca carte) → finisce in cache
  await page.evaluate(async () => {
    const m = await (await fetch('/data/manifest.json?t=1')).json()
    const f = m.files
    await Promise.all([f.cards, f.banlists, f.archetypes].map((n: string) => fetch(`/data/${n}`).then((r) => r.arrayBuffer())))
  })
  await expect
    .poll(async () => (await cached(page, 'combolab-data-v1')).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(4) // manifest + cards + banlists + archetypes
  const precache = (await page.evaluate(async () => (await caches.keys()).join(','))) as string
  expect(precache).toContain('workbox-precache')

  await context.setOffline(true)
  for (const path of ['/', '/mazzi', '/combo', '/impostazioni', '/statistiche']) {
    await page.goto(path)
    await expect(page.locator('h1').first(), `offline ${path}`).toBeVisible()
  }
  // dataset: l'app lo legge dalla cache anche senza rete
  const ok = await page.evaluate(async () => {
    const m = await (await fetch('/data/manifest.json?t=2')).json()
    const r = await fetch(`/data/${m.files.cards}`)
    return r.ok
  })
  expect(ok).toBe(true)
  await page.goto('/mazzi')
  await expect(page.getByRole('button', { name: /Nuova variante|New variant/ }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/pwa/offline-mazzi.png' })
  expect(errors).toEqual([])
  await context.setOffline(false)
})

test.describe('senza dati', () => {
  test.use({ serviceWorkers: 'block' }) // page.route non intercetta le richieste fatte dal service worker

test('senza rete e senza cache: errore chiaro con "Riprova" nell\'editor del mazzo', async ({ page }) => {
  const errs: string[] = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  await page.route('**/data/**', (r) => r.abort())
  await page.goto('/archetipi')
  await expect(page.locator('h1')).toBeVisible()
  await expect
    .poll(() => page.evaluate(async () => (await indexedDB.databases()).some((d) => d.name === 'decklab')))
    .toBe(true)
  const id = await page.evaluate(async () => {
    const now = new Date().toISOString()
    const a = crypto.randomUUID()
    const v = crypto.randomUUID()
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('decklab')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['archetypes', 'variants'], 'readwrite')
      tx.objectStore('archetypes').put({ id: a, name: { it: 'Prova', en: 'Test' }, keyCards: [], starters: [], extenders: [], updatedAt: now, deletedAt: null })
      tx.objectStore('variants').put({ id: v, archetypeId: a, name: { it: 'Mazzo', en: 'Deck' }, rules: 'TCG', banlist: { format: 'TCG', id: '2026.10' }, deck: { main: [], extra: [], side: [] }, updatedAt: now, deletedAt: null })
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    return v
  })
  await page.goto(`/mazzi/${id}`)
  await page.waitForTimeout(2000)
  const failedLoads = errs.filter((e) => /ERR_FAILED/.test(e)).length
  expect(failedLoads, 'nessun ritentativo a raffica').toBeLessThan(12)
  await expect(page.getByRole('button', { name: /Riprova|Retry|Try again/ })).toBeVisible({ timeout: 20_000 })
  await page.screenshot({ path: 'test-results/pwa/no-data-error.png' })
})
})
