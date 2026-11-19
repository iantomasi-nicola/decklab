import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Check from 'lucide-react/icons/check'
import type { Card, Lang } from '@/domain/types'
import { searchCards } from '@/features/cards/api'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/Dialog'
import { SearchField } from '@/ui/SearchField'
import { Skeleton } from '@/ui/Skeleton'
import { altName, cardName } from '@/features/decks/cardData'
import { cardSubtitle } from '@/features/decks/cardMeta'
import { CardThumb } from '@/features/decks/CardThumb'
import { VirtualList } from '@/features/decks/VirtualList'
import { toggleIn } from './archetypeMeta'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  lang: Lang
  selected: readonly number[]
  onChange: (ids: number[]) => void
}

/** Scelta di carte (più d'una) per le liste di un archetipo: un tocco aggiunge/toglie. */
export function CardPickerDialog({ open, onOpenChange, title, lang, selected, onChange }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const timer = setTimeout(() => {
      searchCards(query, { limit: 100, lang })
        .then((r) => mine === seq.current && setResults(r))
        .catch(() => mine === seq.current && setResults([]))
        .finally(() => mine === seq.current && setLoading(false))
    }, 120)
    return () => clearTimeout(timer)
  }, [query, lang])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t('archetypes.picker.body')}
      className="max-w-xl"
      footer={
        <Button variant="primary" onClick={() => onOpenChange(false)}>
          {t('archetypes.picker.done', { count: selected.length })}
        </Button>
      }
    >
      <div className="flex flex-col gap-3" data-testid="card-picker">
        <SearchField label={t('deck.search.label')} placeholder={t('deck.search.placeholder')} value={query} onValueChange={setQuery} autoFocus autoComplete="off" spellCheck={false} />
        <div className="h-[46dvh] min-h-60" aria-live="polite">
          {!query.trim() ? (
            <p className="px-2 py-6 text-center text-[15px] text-muted">{t('archetypes.picker.idle')}</p>
          ) : loading && !results.length ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : !results.length ? (
            <p className="px-2 py-6 text-center text-[15px] text-muted">{t('deck.search.noResultsBody')}</p>
          ) : (
            <VirtualList
              fill
              items={results}
              rowHeight={68}
              getKey={(c) => c.id}
              label={t('deck.search.results', { count: results.length })}
              renderRow={(card) => {
                const on = selected.includes(card.id)
                const name = cardName(card, lang)
                return (
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange(toggleIn(selected, card.id))}
                    data-testid="picker-result"
                    className={cn('flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-md px-2 text-left', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                  >
                    <CardThumb id={card.id} name={name} className="w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{name}</span>
                      <span className="block truncate text-sm text-muted">{altName(card, lang) ?? cardSubtitle(card, t)}</span>
                    </span>
                    <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-full border', on ? 'border-accent-text bg-accent text-accent-fg' : 'border-line-strong text-transparent')}>
                      <Check size={16} />
                    </span>
                  </button>
                )
              }}
            />
          )}
        </div>
      </div>
    </Dialog>
  )
}
