import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import type { Card, Lang } from '@/domain/types'
import { useCardData } from '@/features/cards/api'
import { cardInfo, type CardInfo } from './cardKind'

/** Accesso comodo ai dati carta per il campo: nome nella lingua corrente, tipo, immagine. */
export function useCards() {
  const state = useCardData()
  const { i18n } = useTranslation()
  const lang: Lang = i18n.language === 'it' ? 'it' : 'en'
  const byId = useCallback((code: number): Card | undefined => (state.status === 'ready' ? state.index.byId(code) : undefined), [state])
  const nameOf = useCallback(
    (code: number) => {
      const c = byId(code)
      return c ? (c.name[lang] ?? c.name.en) : `#${code}`
    },
    [byId, lang],
  )
  const infoOfCode = useCallback((code: number): CardInfo => cardInfo(byId(code)), [byId])
  return useMemo(() => ({ ready: state.status === 'ready', state, lang, byId, nameOf, infoOfCode }), [state, lang, byId, nameOf, infoOfCode])
}

export function useMediaQuery(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(q).matches,
    () => false,
  )
}
