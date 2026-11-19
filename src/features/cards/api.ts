/**
 * CONTRATTO tra l'agente "carte/ricerca" (implementa) e l'agente "mazzi/archetipi UI" (usa).
 * Non cambiare le firme senza coordinarsi.
 *
 * Implementazione:
 *  - dati: cardStore.ts (manifest → cards/banlists/archetypes, una volta per sessione)
 *  - ricerca: searchClient.ts → src/workers/cards.worker.ts → domain/cards/searchEngine.ts (MiniSearch)
 *  - immagini: cardImageUrl qui sotto + <CardImage/> in CardImage.tsx
 */
import { useEffect } from 'react'
import type { Banlist, Card, Lang } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { CardFilters } from '@/domain/cards/searchEngine'
import { getCardDataState, loadCardData, loadTextsOnce, useCardDataState } from './cardStore'
import { runSearch } from './searchClient'

export type { CardFilters }

export type CardDataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: CardIndex; banlists: Banlist[]; archetypes: { setcode: number; name: { en: string; it?: string } }[]; datasetVersion: string }

/** Hook React: carica (una volta, in cache) il dataset da /data/manifest.json. */
export function useCardData(): CardDataState {
  const state = useCardDataState()
  useEffect(() => {
    void loadCardData().catch(() => {}) // l'errore è nello stato
  }, [state.status === 'error'])
  return state
}

/** Ricerca IT/EN tollerante ai refusi, eseguita in un Web Worker. */
export async function searchCards(query: string, opts?: { limit?: number; filters?: CardFilters; lang?: Lang }): Promise<Card[]> {
  await loadCardData() // garantisce manifest + avvio dell'indice nel worker
  return runSearch(query, opts)
}

/** Testo dell'effetto nella lingua scelta (carica texts.<lang> on demand). Se manca in `it` ripiega su `en`. */
export async function getCardText(id: number, lang: Lang): Promise<string | undefined> {
  await loadCardData()
  const s = getCardDataState()
  const base = s.status === 'ready' ? s.index.canonicalId(id) : id
  const texts = await loadTextsOnce(lang)
  const own = texts[String(base)] ?? texts[String(id)]
  if (own !== undefined || lang === 'en') return own
  const en = await loadTextsOnce('en')
  return en[String(base)] ?? en[String(id)]
}

/** URL dell'immagine: da VITE_IMAGE_BASE_URL (bucket R2) con fallback su placeholder; mai hotlink a YGOPRODeck. */
export function cardImageUrl(id: number, size: 'small' | 'full'): string | null {
  const base = (import.meta.env.VITE_IMAGE_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '')
  if (!base) return null
  return `${base}/${size}/${id}.jpg`
}
