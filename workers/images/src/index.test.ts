import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { resetThrottle, type Env } from './index'

function makeEnv(over: Partial<Env> = {}) {
  const store = new Map<string, ArrayBuffer>()
  const BUCKET = {
    get: vi.fn(async (k: string) => (store.has(k) ? { body: new Response(store.get(k)).body!, httpEtag: 'x' } : null)),
    put: vi.fn(async (k: string, v: ArrayBuffer) => void store.set(k, v)),
  }
  return { env: { BUCKET, ALLOWED_ORIGINS: 'https://app.test', ...over } as Env, store, BUCKET }
}
const get = (path: string, origin?: string) =>
  new Request(`https://img.test${path}`, { headers: origin ? { Origin: origin } : {} })
const bytes = () => new Uint8Array([1, 2, 3]).buffer

beforeEach(() => resetThrottle())
afterEach(() => vi.unstubAllGlobals())

describe('worker immagini', () => {
  it('scarica una volta, salva in R2 e serve con CORS e cache immutabile', async () => {
    const f = vi.fn(async () => new Response(bytes()))
    vi.stubGlobal('fetch', f)
    const { env, store } = makeEnv()
    const r = await worker.fetch(get('/small/46986414.jpg', 'https://app.test'), env)
    expect(r.status).toBe(200)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test')
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(f).toHaveBeenCalledWith('https://images.ygoprodeck.com/images/cards_small/46986414.jpg')
    expect(store.has('small/46986414.jpg')).toBe(true)
    const r2 = await worker.fetch(get('/small/46986414.jpg', 'https://app.test'), env)
    expect(r2.status).toBe(200)
    expect(f).toHaveBeenCalledTimes(1) // seconda richiesta da R2
  })
  it('usa le cartelle sorgente giuste per full e cropped', async () => {
    const f = vi.fn(async () => new Response(bytes()))
    vi.stubGlobal('fetch', f)
    const { env } = makeEnv()
    await worker.fetch(get('/full/1.jpg'), env)
    await worker.fetch(get('/cropped/2.jpg'), env)
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'https://images.ygoprodeck.com/images/cards/1.jpg',
      'https://images.ygoprodeck.com/images/cards_cropped/2.jpg',
    ])
  })
  it('rifiuta id non numerici e rotte sconosciute senza chiamare la sorgente', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const { env } = makeEnv()
    for (const p of ['/small/abc.jpg', '/small/12a.jpg', '/small/../x.jpg', '/huge/1.jpg', '/full/1.webp', '/small/0.jpg'])
      expect((await worker.fetch(get(p), env)).status).toBe(404)
    expect(f).not.toHaveBeenCalled()
  })
  it('403 per origine non consentita, 204 al preflight consentito', async () => {
    const { env } = makeEnv()
    expect((await worker.fetch(get('/small/1.jpg', 'https://evil.test'), env)).status).toBe(403)
    const o = new Request('https://img.test/small/1.jpg', { method: 'OPTIONS', headers: { Origin: 'https://app.test' } })
    expect((await worker.fetch(o, env)).status).toBe(204)
  })
  it('404 se la carta non esiste e non salva nulla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const { env, BUCKET } = makeEnv()
    expect((await worker.fetch(get('/small/999.jpg'), env)).status).toBe(404)
    expect(BUCKET.put).not.toHaveBeenCalled()
  })
  it('ritenta su 429 e poi riesce', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValue(new Response(bytes()))
    vi.stubGlobal('fetch', f)
    const { env } = makeEnv()
    const p = worker.fetch(get('/small/5.jpg'), env)
    await vi.runAllTimersAsync()
    expect((await p).status).toBe(200)
    expect(f).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
  it('distanzia le richieste verso la sorgente (throttle)', async () => {
    vi.useFakeTimers()
    const times: number[] = []
    vi.stubGlobal('fetch', vi.fn(async () => (times.push(Date.now()), new Response(bytes()))))
    const { env } = makeEnv()
    const ps = [1, 2, 3].map((i) => worker.fetch(get(`/small/${i}.jpg`), env))
    await vi.runAllTimersAsync()
    await Promise.all(ps)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(100)
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(100)
    vi.useRealTimers()
  })
  it('502 se la sorgente resta in errore', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const { env } = makeEnv()
    const p = worker.fetch(get('/small/7.jpg'), env)
    await vi.runAllTimersAsync()
    expect((await p).status).toBe(502)
    vi.useRealTimers()
  })
})
