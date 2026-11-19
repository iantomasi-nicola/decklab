import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Plus from 'lucide-react/icons/plus'
import Archive from 'lucide-react/icons/archive'
import type { Banlist, Card, Lang, Rules } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { searchCards, type CardFilters } from '@/features/cards/api'
import { SearchField } from '@/ui/SearchField'
import { Skeleton } from '@/ui/Skeleton'
import { cn } from '@/ui/cn'
import { altName, cardName } from './cardData'
import { cardSubtitle } from './cardMeta'
import { BanStatusBadge } from './CardPills'
import { CardThumb } from './CardThumb'
import { NativeSelect } from './fields'
import { banStatusKey, limitOf } from './legalityView'
import { ATTRIBUTES } from './deckStats'
import { VirtualList } from './VirtualList'

export const SEARCH_LIMIT = 300
export const DOUBLE_TAP_MS = 320

type TypeFilter = 'all' | 'monster' | 'spell' | 'trap' | 'extra'

function toFilters(type: TypeFilter, attr: string, rules: Rules): CardFilters {
  const f: CardFilters = { inFormat: rules }
  if (type === 'extra') f.extraOnly = true
  else if (type !== 'all') f.kind = type
  if (attr) {
    const bit = ATTRIBUTES.find(([k]) => k === attr)?.[1]
    if (bit) f.attribute = bit
  }
  return f
}

interface Props {
  index: CardIndex
  banlist: Banlist
  rules: Rules
  lang: Lang
  /** copie per carta canonica (Main+Extra+Side) */
  copies: (canonicalId: number) => number
  /** un tocco */
  onAdd: (card: Card) => void
  /** secondo tocco ravvicinato sulla stessa carta: +1 nel Side al posto del Main/Extra */
  onDoubleAdd: (card: Card) => void
  onAddSide: (card: Card) => void
  autoFocus?: boolean
}

export function CardSearch({ index, banlist, rules, lang, copies, onAdd, onDoubleAdd, onAddSide, autoFocus }: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [attr, setAttr] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)
  const lastTap = useRef<{ id: number; at: number } | null>(null)

  const active = query.trim().length > 0 || type !== 'all' || attr !== ''

  useEffect(() => {
    if (!active) {
      setResults([])
      setLoading(false)
      return
    }
    const mine = ++seq.current
    setLoading(true)
    const timer = setTimeout(() => {
      searchCards(query, { limit: SEARCH_LIMIT, filters: toFilters(type, attr, rules), lang })
        .then((r) => {
          if (mine === seq.current) setResults(r)
        })
        .catch(() => {
          if (mine === seq.current) setResults([])
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false)
        })
    }, 120)
    return () => clearTimeout(timer)
  }, [query, type, attr, rules, lang, active])

  const tap = (card: Card) => {
    const now = Date.now()
    const prev = lastTap.current
    if (prev && prev.id === card.id && now - prev.at < DOUBLE_TAP_MS) {
      lastTap.current = null
      onDoubleAdd(card)
    } else {
      lastTap.current = { id: card.id, at: now }
      onAdd(card)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="card-search">
      <SearchField
        label={t('deck.search.label')}
        placeholder={t('deck.search.placeholder')}
        value={query}
        onValueChange={setQuery}
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect aria-label={t('deck.search.type')} value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
          {(['all', 'monster', 'spell', 'trap', 'extra'] as const).map((v) => (
            <option key={v} value={v}>
              {t(`deck.search.types.${v}`)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label={t('deck.search.attribute')} value={attr} onChange={(e) => setAttr(e.target.value)}>
          <option value="">{t('deck.search.anyAttribute')}</option>
          {ATTRIBUTES.map(([k]) => (
            <option key={k} value={k}>
              {t(`deck.attr.${k}`)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <p className="text-sm text-muted" id="search-hint">
        {t('deck.search.hint')}
      </p>

      <div className="min-h-0 flex-1" aria-live="polite">
        {!active ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center" data-testid="search-idle">
            <p className="font-medium text-fg">{t('deck.search.idleTitle')}</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-[15px] text-muted">{t('deck.search.idleBody')}</p>
          </div>
        ) : loading && results.length === 0 ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[72px] w-full" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center" data-testid="search-empty">
            <p className="font-medium text-fg">{t('deck.search.noResultsTitle')}</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-[15px] text-muted">{t('deck.search.noResultsBody')}</p>
          </div>
        ) : (
          <VirtualList
            fill
            items={results}
            rowHeight={76}
            getKey={(c) => c.id}
            label={t('deck.search.results', { count: results.length })}
            renderRow={(card) => {
              const name = cardName(card, lang)
              const canon = index.canonicalId(card.id)
              const n = copies(canon)
              const limit = limitOf(banlist, canon)
              return (
                <div className={cn('flex items-center gap-1 rounded-md pr-1', loading && 'opacity-70')} data-testid="search-result" data-card-id={card.id}>
                  <button
                    type="button"
                    onClick={() => tap(card)}
                    aria-label={t('deck.search.addNamed', { name })}
                    className="flex min-h-[72px] min-w-0 flex-1 cursor-pointer touch-manipulation items-center gap-3 rounded-md px-1 text-left hover:bg-surface-2 active:bg-surface-3"
                  >
                    <CardThumb id={card.id} name={name} className="w-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-fg">{name}</span>
                      <span className="block truncate text-sm text-muted">{altName(card, lang) ?? cardSubtitle(card, t)}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1">
                        <BanStatusBadge status={banStatusKey(limit)} />
                        {n > 0 ? (
                          <span className="text-xs font-semibold text-accent-text" data-testid="in-deck">
                            {t('deck.search.inDeck', { count: n })}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
                      <Plus size={18} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddSide(card)}
                    aria-label={t('deck.search.addSideNamed', { name })}
                    title={t('deck.search.addSide')}
                    className="inline-flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <Archive aria-hidden size={18} />
                  </button>
                </div>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
