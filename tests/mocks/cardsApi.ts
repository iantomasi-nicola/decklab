/**
 * Sostituto di '@/features/cards/api' per i test e2e di archetipi/mazzi (vedi vite.config.ts, E2E_MOCK_CARDS=1).
 * Stesse firme del contratto; dati da ./cardsData.ts. `?mockdelay=ms` o localStorage 'mock.delay' simula il caricamento.
 */
import { useEffect, useState } from 'react'
import type { Card, Lang } from '@/domain/types'
import { createCardIndex, normalizeName } from '@/domain/deck/cardIndex'
import { MOCK_BANLISTS, MOCK_CARDS } from './cardsData'

export interface CardFilters {
  kind?: 'monster' | 'spell' | 'trap'
  extraOnly?: boolean
  attribute?: number
  race?: number
  levelMin?: number
  levelMax?: number
  setcode?: number
  inFormat?: 'TCG' | 'OCG'
}
export type CardDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: ReturnType<typeof createCardIndex>; banlists: typeof MOCK_BANLISTS; archetypes: { setcode: number; name: { en: string; it?: string } }[]; datasetVersion: string }

const index = createCardIndex(MOCK_CARDS)
const READY: CardDataState = { status: 'ready', index, banlists: MOCK_BANLISTS, archetypes: [], datasetVersion: 'mock' }

function delayMs(): number {
  try {
    const q = new URLSearchParams(location.search).get('mockdelay') ?? localStorage.getItem('mock.delay')
    return q ? Number(q) || 0 : 0
  } catch {
    return 0
  }
}
let released = delayMs() === 0

export function useCardData(): CardDataState {
  const [ready, setReady] = useState(released)
  useEffect(() => {
    if (released) return
    const id = setTimeout(() => {
      released = true
      setReady(true)
    }, delayMs())
    return () => clearTimeout(id)
  }, [])
  return ready ? READY : { status: 'loading' }
}

const kindOf = (c: Card) => (c.type & 2 ? 'spell' : c.type & 4 ? 'trap' : 'monster')

export async function searchCards(query: string, opts?: { limit?: number; filters?: CardFilters; lang?: Lang }): Promise<Card[]> {
  const q = normalizeName(query)
  const f = opts?.filters ?? {}
  const out: Card[] = []
  for (const c of MOCK_CARDS) {
    if (c.alias) continue
    if (f.kind && kindOf(c) !== f.kind) continue
    if (f.extraOnly && !c.isExtra) continue
    if (f.attribute && !(c.attribute & f.attribute)) continue
    if (f.inFormat === 'OCG' && c.ocg === false) continue
    if (f.inFormat === 'TCG' && c.tcg === false) continue
    if (q) {
      const hay = `${normalizeName(c.name.en)} ${normalizeName(c.name.it ?? '')}`
      if (!q.split(' ').every((w) => hay.includes(w))) continue
    }
    out.push(c)
    if (out.length >= (opts?.limit ?? 50)) break
  }
  return out
}

export async function getCardText(_id: number, _lang: Lang): Promise<string | undefined> {
  return 'Testo di prova.'
}

export function cardImageUrl(_id: number, _size: 'small' | 'full'): string | null {
  return null
}
