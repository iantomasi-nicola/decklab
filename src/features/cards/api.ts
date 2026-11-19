/**
 * CONTRATTO tra l'agente "carte/ricerca" (implementa) e l'agente "mazzi/archetipi UI" (usa).
 * Non cambiare le firme senza coordinarsi. L'implementazione sostituisce gli stub sotto.
 */
import type { Banlist, Card, Lang } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'

export type CardFilters = {
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
  | { status: 'ready'; index: CardIndex; banlists: Banlist[]; archetypes: { setcode: number; name: { en: string; it?: string } }[]; datasetVersion: string }

/** Hook React: carica (una volta, in cache) il dataset da /data/manifest.json. */
export function useCardData(): CardDataState {
  return { status: 'loading' }
}

/** Ricerca IT/EN tollerante ai refusi, eseguita in un Web Worker. */
export async function searchCards(_query: string, _opts?: { limit?: number; filters?: CardFilters; lang?: Lang }): Promise<Card[]> {
  return []
}

/** Testo dell'effetto nella lingua scelta (carica texts.<lang> on demand). */
export async function getCardText(_id: number, _lang: Lang): Promise<string | undefined> {
  return undefined
}

/** URL dell'immagine: da VITE_IMAGE_BASE_URL (bucket R2) con fallback su placeholder; mai hotlink a YGOPRODeck. */
export function cardImageUrl(_id: number, _size: 'small' | 'full'): string | null {
  return null
}
