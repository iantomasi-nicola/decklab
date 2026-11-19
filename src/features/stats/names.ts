import { useCallback } from 'react'
import type { CardsState } from '@/features/decks/cardData'
import { cardName } from '@/features/decks/cardData'
import type { Lang } from '@/domain/types'

/** Nome di una carta (passcode) nella lingua scelta; con dataset non pronto ripiega sul passcode. */
export function useCardNames(cards: CardsState, lang: Lang) {
  return useCallback((id: number): string => (cards.status === 'ready' ? cardName(cards.index.byId(id), lang, id) : String(id)), [cards, lang])
}
