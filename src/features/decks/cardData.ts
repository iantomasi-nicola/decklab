import { useMemo } from 'react'
import type { Banlist, Card, Lang, Rules } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { useCardData } from '@/features/cards/api'

export type BanlistRef = { format: Banlist['format']; id: string }

const cmpId = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true })

export const banlistLabel = (ref: BanlistRef): string => `${ref.format} ${ref.id}`
export const sameRef = (a: BanlistRef, b: BanlistRef): boolean => a.format === b.format && a.id === b.id

export function findBanlist(banlists: readonly Banlist[], ref: BanlistRef): Banlist | undefined {
  return banlists.find((b) => b.format === ref.format && b.id === ref.id)
}

/** Ultima banlist (id più alto) del formato. */
export function latestBanlist(banlists: readonly Banlist[], format: Banlist['format']): Banlist | undefined {
  return banlists.filter((b) => b.format === format).sort((a, b) => cmpId(b.id, a.id))[0]
}

/** Banlist predefinita per le regole: l'ultima del formato omonimo (TCG/OCG). */
export function defaultBanlistRef(banlists: readonly Banlist[], rules: Rules): BanlistRef {
  const b = latestBanlist(banlists, rules)
  return b ? { format: b.format, id: b.id } : { format: rules, id: '' }
}

/** Formati selezionabili, nell'ordine in cui compaiono nel menu. */
const FORMAT_ORDER: Banlist['format'][] = ['TCG', 'OCG', 'GENESYS', 'SPEED', 'WORLD', 'TRADITIONAL', 'GOAT']

export function banlistGroups(banlists: readonly Banlist[]): { format: Banlist['format']; items: Banlist[] }[] {
  return FORMAT_ORDER.map((format) => ({
    format,
    items: banlists.filter((b) => b.format === format).sort((a, b) => cmpId(b.id, a.id)),
  })).filter((g) => g.items.length)
}

/** Banlist vuota (nessun limite) usata quando quella scelta non è nei dati. */
export const noLimits = (ref: BanlistRef): Banlist => ({ format: ref.format, id: ref.id, limits: {} })

export const isOlder = (a: BanlistRef, b: BanlistRef): boolean => a.format === b.format && cmpId(a.id, b.id) < 0

export const cardName = (card: Card | undefined, lang: Lang, fallbackId?: number): string =>
  card ? (card.name[lang] ?? card.name.en) : String(fallbackId ?? '?')

/** Nome alternativo (l'altra lingua), mostrato in piccolo se diverso. */
export const altName = (card: Card | undefined, lang: Lang): string | undefined => {
  if (!card) return undefined
  const other = card.name[lang === 'it' ? 'en' : 'it']
  return other && other !== cardName(card, lang) ? other : undefined
}

export type CardsReady = {
  status: 'ready'
  index: CardIndex
  banlists: Banlist[]
  archetypes: { setcode: number; name: { en: string; it?: string } }[]
}
export type CardsState = { status: 'loading' } | { status: 'error'; message: string } | CardsReady

/** Wrapper stabile di useCardData: restituisce un oggetto memoizzato. */
export function useCards(): CardsState {
  const s = useCardData()
  return useMemo<CardsState>(() => {
    if (s.status === 'ready') return { status: 'ready', index: s.index, banlists: s.banlists, archetypes: s.archetypes }
    return s.status === 'error' ? { status: 'error', message: s.message } : { status: 'loading' }
  }, [s])
}
