import { useTranslation } from 'react-i18next'
import LogIn from 'lucide-react/icons/log-in'
import LogOut from 'lucide-react/icons/log-out'
import Minus from 'lucide-react/icons/minus'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { countOf, type SideCount } from '@/domain/side'
import type { Lang } from '@/domain/types'
import { cardName } from '@/features/decks/cardData'
import { CardThumb } from '@/features/decks/CardThumb'
import { cn } from '@/ui/cn'
import type { ReactNode } from 'react'

export type LaneKind = 'out' | 'in'

export interface LaneStack {
  /** Passcode canonico. */
  cardId: number
  /** Passcode da mostrare (artwork scelto nel mazzo). */
  shownId: number
  /** Copie disponibili nella sezione (Main per OUT, Side per IN). */
  have: number
}

const TONE = {
  out: {
    head: 'bg-danger/10 border-danger/30',
    title: 'text-danger',
    border: 'border-danger',
    wash: 'bg-danger/25',
    pill: 'bg-danger-solid text-danger-fg',
    chip: 'border-danger/40 bg-danger/10 text-danger',
  },
  in: {
    head: 'bg-ok/10 border-ok/30',
    title: 'text-ok',
    border: 'border-ok',
    wash: 'bg-ok/20',
    pill: 'bg-ok text-bg',
    chip: 'border-ok/40 bg-ok/10 text-ok',
  },
} as const

function Tile({
  kind,
  stack,
  selected,
  name,
  onSet,
}: {
  kind: LaneKind
  stack: LaneStack
  selected: number
  name: string
  onSet: (cardId: number, count: number) => void
}) {
  const { t } = useTranslation()
  const tone = TONE[kind]
  const full = selected >= stack.have
  const label = [
    name,
    t(kind === 'out' ? 'side.tile.inMain' : 'side.tile.inSide', { count: stack.have }),
    selected > 0 ? t(kind === 'out' ? 'side.tile.markedOut' : 'side.tile.markedIn', { count: selected }) : '',
    full ? '' : t(kind === 'out' ? 'side.tile.addOut' : 'side.tile.addIn'),
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <div className="relative" data-testid={`tile-${kind}`} data-card-id={stack.cardId} data-selected={selected}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={selected > 0}
        onClick={() => onSet(stack.cardId, Math.min(selected + 1, stack.have))}
        className={cn(
          'relative block w-full cursor-pointer touch-manipulation rounded-[8px] border-2 p-0 text-left transition-colors duration-150',
          selected > 0 ? tone.border : 'border-transparent hover:border-line-strong',
        )}
      >
        <CardThumb id={stack.shownId} name={name} className="w-full" />
        {selected > 0 ? <span aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-[6px]', tone.wash)} /> : null}
        {selected > 0 ? (
          <span
            aria-hidden
            className={cn('absolute bottom-1 left-1 min-w-7 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums shadow-1', tone.pill)}
          >
            {kind === 'out' ? '−' : '+'}
            {selected}
          </span>
        ) : null}
        {stack.have > 1 ? (
          <span aria-hidden className="absolute bottom-1 right-1 min-w-7 rounded-full bg-bg/90 px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-fg shadow-1">
            ×{stack.have}
          </span>
        ) : null}
      </button>
      {selected > 0 ? (
        <button
          type="button"
          aria-label={t(kind === 'out' ? 'side.tile.removeOut' : 'side.tile.removeIn', { name })}
          data-testid={`tile-${kind}-minus`}
          onClick={() => onSet(stack.cardId, selected - 1)}
          className="absolute right-0 top-0 grid size-11 cursor-pointer touch-manipulation place-items-start justify-items-end p-1 text-fg"
        >
          <span aria-hidden className="grid size-7 place-items-center rounded-full border border-line-strong bg-bg/95 shadow-1">
            <Minus size={16} />
          </span>
        </button>
      ) : null}
    </div>
  )
}

export interface LaneProps {
  kind: LaneKind
  stacks: LaneStack[]
  selected: readonly SideCount[]
  index: CardIndex
  lang: Lang
  onSet: (cardId: number, count: number) => void
  /** Mostrato al posto della griglia quando non ci sono carte (es. Side vuoto). */
  empty?: ReactNode
  className?: string
}

/** Una corsia del piano: OUT (rosso tenue, carte del Main) o IN (verde, carte del Side). Tocco = +1, "−" = −1. */
export function Lane({ kind, stacks, selected, index, lang, onSet, empty, className }: LaneProps) {
  const { t } = useTranslation()
  const tone = TONE[kind]
  const Icon = kind === 'out' ? LogOut : LogIn
  const total = selected.reduce((n, c) => n + c.count, 0)
  return (
    <section
      data-testid={`lane-${kind}`}
      aria-label={t(`side.lane.${kind}`) + ' ' + t(`side.lane.${kind}From`)}
      className={cn('overflow-hidden rounded-lg border border-line bg-surface-1', className)}
    >
      <header className={cn('flex min-h-12 items-center justify-between gap-3 border-b px-3 py-2', tone.head)}>
        <h2 className={cn('flex items-center gap-2 text-base font-semibold', tone.title)}>
          <Icon aria-hidden size={18} />
          <span>{t(`side.lane.${kind}`)}</span>
          <span className="text-sm font-medium text-muted">{t(`side.lane.${kind}From`)}</span>
        </h2>
        <span data-testid={`lane-${kind}-count`} className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-full border px-2.5 text-sm font-bold tabular-nums', tone.chip)}>
          {kind === 'out' ? '−' : '+'}
          {total}
        </span>
      </header>
      <div className="p-3">
        {stacks.length ? (
          <>
            <p className="mb-3 text-sm text-muted">{t(kind === 'out' ? 'side.lane.tapOut' : 'side.lane.tapIn')}</p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2">
              {stacks.map((s) => (
                <Tile
                  key={s.cardId}
                  kind={kind}
                  stack={s}
                  selected={countOf(selected, s.cardId)}
                  name={cardName(index.byId(s.shownId), lang, s.shownId)}
                  onSet={onSet}
                />
              ))}
            </div>
          </>
        ) : (
          empty
        )}
      </div>
    </section>
  )
}
