/**
 * Worker immagini carte: R2 come cache, YGOPRODeck come sorgente (solo lato Worker, mai hotlink dal browser).
 * Rotte: GET /small/{id}.jpg|webp, /full/{id}.jpg, /cropped/{id}.jpg
 * Nessuna chiave nel codice. Tipi minimi locali per non richiedere dipendenze.
 */

interface R2ObjectBody {
  body: ReadableStream
  httpEtag: string
  httpMetadata?: { contentType?: string }
}
interface R2BucketLike {
  get(key: string): Promise<R2ObjectBody | null>
  put(key: string, value: ArrayBuffer | ReadableStream, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}
interface ImagesLike {
  input(s: ReadableStream): { output(o: { format: string }): Promise<{ response(): Response }> }
}
export interface Env {
  BUCKET: R2BucketLike
  ALLOWED_ORIGINS?: string
  IMAGES?: ImagesLike
}

export const SOURCES = {
  small: 'https://images.ygoprodeck.com/images/cards_small',
  full: 'https://images.ygoprodeck.com/images/cards',
  cropped: 'https://images.ygoprodeck.com/images/cards_cropped',
} as const
type Size = keyof typeof SOURCES

const PATH_RE = /^\/(small|full|cropped)\/(\d{1,10})\.(jpg|webp)$/
const MIN_GAP_MS = 100 // ~10 req/s per istanza, ben sotto il limite di 20 req/s
const MAX_RETRIES = 3

// Throttle per istanza: serializza le partenze delle richieste verso YGOPRODeck.
let nextSlot = 0
export function resetThrottle() {
  nextSlot = 0
}
async function throttle(): Promise<void> {
  const now = Date.now()
  const start = Math.max(now, nextSlot)
  nextSlot = start + MIN_GAP_MS
  if (start > now) await new Promise((r) => setTimeout(r, start - now))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Scarica dalla sorgente con retry su 429/5xx. Ritorna null se la carta non esiste (404). */
export async function fetchSource(size: Size, id: string): Promise<ArrayBuffer | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle()
    let res: Response | null = null
    try {
      res = await fetch(`${SOURCES[size]}/${id}.jpg`)
    } catch {
      res = null
    }
    if (res?.ok) return res.arrayBuffer()
    if (res && (res.status === 404 || res.status === 403)) return null
    if (attempt === MAX_RETRIES) throw new Error('upstream')
    await sleep(500 * 2 ** attempt)
  }
  return null
}

function allowedOrigin(env: Env, origin: string | null): string | null {
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.includes('*')) return '*'
  if (origin && list.includes(origin)) return origin
  return null
}

function withCors(headers: Headers, allow: string | null) {
  if (allow) headers.set('Access-Control-Allow-Origin', allow)
  headers.set('Vary', 'Origin')
  headers.set('Cross-Origin-Resource-Policy', 'cross-origin')
}

function err(status: number, msg: string, allow: string | null, extra?: Record<string, string>) {
  const h = new Headers({ 'Content-Type': 'text/plain; charset=utf-8', ...extra })
  withCors(h, allow)
  return new Response(msg, { status, headers: h })
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin')
    const allow = allowedOrigin(env, origin)
    // Origin presente ma non consentito: rifiuto. Senza Origin (<img> same-site, curl) si passa.
    if (origin && !allow) return err(403, 'Origine non consentita', null)

    if (req.method === 'OPTIONS') {
      const h = new Headers({ 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Max-Age': '86400' })
      withCors(h, allow)
      return new Response(null, { status: 204, headers: h })
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return err(405, 'Metodo non consentito', allow)

    const m = PATH_RE.exec(new URL(req.url).pathname)
    if (!m) return err(404, 'Non trovato', allow)
    const size = m[1] as Size
    const id = String(Number(m[2])) // normalizza gli zeri iniziali
    const ext = m[3] as 'jpg' | 'webp'
    if (id === '0') return err(404, 'Non trovato', allow)
    if (ext === 'webp' && size !== 'small') return err(404, 'Non trovato', allow)
    if (ext === 'webp' && !env.IMAGES) return err(404, 'WebP non attivo', allow)

    const key = `${size}/${id}.${ext}`
    const type = ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const ok = (body: BodyInit | null) => {
      const h = new Headers({ 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' })
      withCors(h, allow)
      return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: h })
    }

    const hit = await env.BUCKET.get(key)
    if (hit) return ok(hit.body)

    try {
      if (ext === 'webp' && env.IMAGES) {
        const jpgKey = `${size}/${id}.jpg`
        let src = await env.BUCKET.get(jpgKey)
        if (!src) {
          const data = await fetchSource(size, id)
          if (!data) return err(404, 'Carta inesistente', allow, { 'Cache-Control': 'public, max-age=3600' })
          await env.BUCKET.put(jpgKey, data, { httpMetadata: { contentType: 'image/jpeg' } })
          src = await env.BUCKET.get(jpgKey)
        }
        if (!src) throw new Error('r2')
        const out = await (await env.IMAGES.input(src.body).output({ format: 'image/webp' })).response().arrayBuffer()
        await env.BUCKET.put(key, out, { httpMetadata: { contentType: 'image/webp' } })
        return ok(out)
      }
      const data = await fetchSource(size, id)
      if (!data) return err(404, 'Carta inesistente', allow, { 'Cache-Control': 'public, max-age=3600' })
      await env.BUCKET.put(key, data, { httpMetadata: { contentType: 'image/jpeg' } })
      return ok(data)
    } catch {
      return err(502, 'Sorgente immagini non disponibile, riprova', allow, { 'Cache-Control': 'no-store' })
    }
  },
}
