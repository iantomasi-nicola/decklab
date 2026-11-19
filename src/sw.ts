/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Il worker gira in un contesto ServiceWorker, anche se il tsconfig include le lib DOM.
const sw = self as unknown as ServiceWorkerGlobalScope

sw.addEventListener('install', () => void sw.skipWaiting())
sw.addEventListener('activate', (e) => e.waitUntil(sw.clients.claim()))

// App shell: tutto ciò che la build produce è precache; le navigazioni cadono su index.html (SPA, offline).
precacheAndRoute((self as unknown as { __WB_MANIFEST: Array<string | { url: string; revision: string | null }> }).__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

/**
 * Dataset carte (/data/*): fuori dal precache, a runtime.
 * - manifest.json: network-first (è l'unico file mutabile), ripiega sulla copia in cache se offline.
 *   La chiave di cache ignora la query (?t=...) con cui il client evita la cache HTTP.
 * - tutti gli altri file hanno la versione nel nome (immutabili): cache-first.
 * Quando il manifest nuovo arriva, i file di versioni precedenti vengono eliminati dalla cache.
 */
const DATA_CACHE = 'combolab-data-v1'

async function pruneData(cache: Cache, manifestText: string) {
  try {
    const m = JSON.parse(manifestText) as { files?: { cards?: string; banlists?: string; archetypes?: string; texts?: Record<string, string> } }
    const keep = new Set(
      [m.files?.cards, m.files?.banlists, m.files?.archetypes, ...Object.values(m.files?.texts ?? {})].filter(Boolean).map((f) => `/data/${f}`),
    )
    keep.add('/data/manifest.json')
    for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req)
  } catch {
    /* manifest illeggibile: non si pota nulla */
  }
}

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.origin === sw.location.origin && url.pathname.startsWith('/data/'),
  async ({ request, url }) => {
    const cache = await caches.open(DATA_CACHE)
    if (url.pathname === '/data/manifest.json') {
      const key = new Request(url.origin + url.pathname)
      try {
        const res = await fetch(request)
        if (res.ok) {
          await cache.put(key, res.clone())
          void res.clone().text().then((t) => pruneData(cache, t))
        }
        return res
      } catch (err) {
        const cached = await cache.match(key)
        if (cached) return cached
        throw err
      }
    }
    const hit = await cache.match(request)
    if (hit) return hit
    const res = await fetch(request)
    if (res.ok) await cache.put(request, res.clone())
    return res
  },
)

/**
 * Motore EDOPro: i chunk JS del core (`assets/ocgcore.*.js`, il glue sync da ~21 KB; i chunk JSPI e base64 da 1,28 MB non si
 * scaricano mai) sono fuori dal precache e si salvano alla prima apertura del motore: cache-first (hash nel nome).
 * Il binario .wasm lo mette in cache il worker stesso (Cache Storage 'combolab-engine-wasm-v1').
 */
const ENGINE_CACHE = 'combolab-engine-v1'
registerRoute(
  ({ url, request }) => request.method === 'GET' && url.origin === sw.location.origin && /\/assets\/ocgcore[^/]*\.js$/.test(url.pathname),
  async ({ request }) => {
    const cache = await caches.open(ENGINE_CACHE)
    const hit = await cache.match(request)
    if (hit) return hit
    const res = await fetch(request)
    if (res.ok) await cache.put(request, res.clone())
    return res
  },
)

/**
 * Web Share Target (Android, app installata): POST multipart su /share-target con file .ydk e/o testo/URL.
 * Il contenuto viene messo nella Cache "combolab-share" (letto dall'import nelle fasi successive)
 * e l'utente viene portato su /mazzi?share=1.
 */
const SHARE_CACHE = 'combolab-share'

registerRoute(
  ({ url }) => url.pathname === '/share-target',
  async ({ request }) => {
    try {
      const form = await request.formData()
      const cache = await caches.open(SHARE_CACHE)
      for (const key of await cache.keys()) await cache.delete(key)
      const files: string[] = []
      let i = 0
      for (const f of form.getAll('files')) {
        if (!(f instanceof File)) continue
        const name = f.name || `file-${i}`
        files.push(name)
        await cache.put(`/__share/file/${i++}`, new Response(f, { headers: { 'x-file-name': encodeURIComponent(name), 'content-type': f.type || 'application/octet-stream' } }))
      }
      const meta = { title: String(form.get('title') ?? ''), text: String(form.get('text') ?? ''), url: String(form.get('url') ?? ''), files, at: Date.now() }
      await cache.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }))
    } catch {
      /* se la condivisione fallisce l'app si apre comunque */
    }
    return Response.redirect('/mazzi?share=1', 303)
  },
  'POST',
)
