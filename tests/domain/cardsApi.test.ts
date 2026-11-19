import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DATA = join(__dirname, '../../public/data')

beforeAll(() => {
  // fetch finto: serve i file di public/data (il percorso /data/<file> → file su disco)
  vi.stubGlobal('fetch', async (url: string) => {
    const file = new URL(url, 'http://localhost/').pathname.replace(/^\/data\//, '')
    try {
      const body = readFileSync(join(DATA, file), 'utf8')
      return { ok: true, status: 200, json: async () => JSON.parse(body) }
    } catch {
      return { ok: false, status: 404, json: async () => ({}) }
    }
  })
})
afterEach(() => vi.unstubAllEnvs())

describe('api carte (store + ricerca + testi)', () => {
  it('searchCards via runtime in-thread: IT, EN e refusi → 14558127', async () => {
    const { searchCards } = await import('@/features/cards/api')
    for (const q of ['ash blossom', 'fioritura di cenere', 'fioritura di cenre']) {
      const r = await searchCards(q, { limit: 3 })
      expect(r[0]?.id, q).toBe(14558127)
    }
  })
  it('getCardText carica on demand nella lingua scelta', async () => {
    const { getCardText } = await import('@/features/cards/api')
    const en = await getCardText(14558127, 'en')
    const it = await getCardText(14558127, 'it')
    expect(en).toMatch(/discard/i)
    expect(it).toBeTruthy()
    expect(it).not.toBe(en)
  })
  it('lo stato diventa ready con indice, banlist e archetipi', async () => {
    const { loadCardData, getCardDataState } = await import('@/features/cards/cardStore')
    await loadCardData()
    const s = getCardDataState()
    expect(s.status).toBe('ready')
    if (s.status !== 'ready') return
    expect(s.index.byId(14558127)?.name.en).toMatch(/Ash Blossom/)
    expect(s.banlists.length).toBeGreaterThan(0)
    expect(s.archetypes.length).toBeGreaterThan(0)
    expect(s.datasetVersion).toMatch(/^\d/)
  })
})

describe('cardImageUrl', () => {
  it('senza VITE_IMAGE_BASE_URL → null (mai hotlink)', async () => {
    vi.stubEnv('VITE_IMAGE_BASE_URL', '')
    const { cardImageUrl } = await import('@/features/cards/api')
    expect(cardImageUrl(14558127, 'small')).toBeNull()
  })
  it('con la variabile → URL del nostro bucket, slash finale ignorato', async () => {
    vi.stubEnv('VITE_IMAGE_BASE_URL', 'https://img.example.com/cards/')
    const { cardImageUrl } = await import('@/features/cards/api')
    expect(cardImageUrl(14558127, 'small')).toBe('https://img.example.com/cards/small/14558127.jpg')
    expect(cardImageUrl(14558127, 'full')).toBe('https://img.example.com/cards/full/14558127.jpg')
    expect(cardImageUrl(1, 'small')).not.toMatch(/ygoprodeck/)
  })
})
