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
