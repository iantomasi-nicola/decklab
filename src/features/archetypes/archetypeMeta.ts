import { useCallback } from 'react'
import type { Archetype, Lang } from '@/domain/types'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { useObservable } from '@/features/decks/useObservable'

/* Preferiti e tag degli archetipi vivono nelle impostazioni sincronizzate (chiavi fisse): il tipo Archetype non li prevede. */
export const FAVORITES_KEY = 'archetypes.favorites'
export const TAGMAP_KEY = 'archetypes.tags'

export type TagMap = Record<string, string[]>

export const toggleIn = <T,>(list: readonly T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface ListFilter {
  query: string
  favoritesOnly: boolean
  tagIds: readonly string[]
}

/** Filtra e ordina (preferiti prima, poi per nome nella lingua corrente). */
export function filterArchetypes(
  list: readonly Archetype[],
  f: ListFilter,
  favorites: readonly string[],
  tagMap: TagMap,
  tagNames: Record<string, string>,
  lang: Lang,
): Archetype[] {
  const q = normalizeText(f.query)
  const out = list.filter((a) => {
    if (f.favoritesOnly && !favorites.includes(a.id)) return false
    if (f.tagIds.length && !f.tagIds.every((t) => tagMap[a.id]?.includes(t))) return false
    if (!q) return true
    const hay = [a.name.it, a.name.en, ...(tagMap[a.id] ?? []).map((t) => tagNames[t])].filter(Boolean).map((s) => normalizeText(s!))
    return hay.some((h) => h.includes(q))
  })
  return out.sort((a, b) => {
    const fa = favorites.includes(a.id) ? 0 : 1
    const fb = favorites.includes(b.id) ? 0 : 1
    return fa - fb || localized(a.name, lang).localeCompare(localized(b.name, lang), lang)
  })
}

function useSetting<T>(key: string, fallback: T) {
  const { value, loaded } = useObservable(() => repos.settings.watch(key), [key])
  const current = (value as T | undefined) ?? fallback
  const set = useCallback((next: T) => void repos.settings.set(key, next), [key])
  return { value: current, set, loaded }
}

export function useFavorites() {
  const s = useSetting<string[]>(FAVORITES_KEY, [])
  return { favorites: s.value, loaded: s.loaded, toggle: (id: string) => s.set(toggleIn(s.value, id)) }
}

export function useTagMap() {
  const s = useSetting<TagMap>(TAGMAP_KEY, {})
  const tags = useObservable(() => repos.tags.watchList(), [])
  return {
    tagMap: s.value,
    tags: tags.value ?? [],
    loaded: s.loaded && tags.loaded,
    setTags: (archetypeId: string, ids: string[]) => s.set({ ...s.value, [archetypeId]: ids }),
  }
}
