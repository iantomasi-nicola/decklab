import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { PreviewRow } from '@/domain/side'
import type { Lang } from '@/domain/types'
import { cardName } from '@/features/decks/cardData'
import { CardThumb } from '@/features/decks/CardThumb'
import { sortStacks } from '@/features/decks/cardMeta'
import { cn } from '@/ui/cn'

/** Righe ordinate come nell'editor del mazzo (mostri, magie, trappole). */
export function useSortedRows(rows: PreviewRow[], index: CardIndex, lang: Lang): PreviewRow[] {
  return useMemo(() => {
    const order = sortStacks(rows.map((r) => ({ id: r.cardId, count: r.keep + r.in + r.out })), index, lang)
    const by = new Map(rows.map((r) => [r.cardId, r]))
    return order.map((s) => by.get(s.id)!)
  }, [rows, index, lang])
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={cn('inline-block size-3 rounded-[4px] border-2', className)} />
}

function PreviewTile({ row, index, lang }: { row: PreviewRow; index: CardIndex; lang: Lang }) {
  const { t } = useTranslation()
  const name = cardName(index.byId(row.shownId), lang, row.shownId)
  const gone = row.keep + row.in === 0
  const state = row.in > 0 ? 'in' : row.out > 0 ? 'out' : 'keep'
  const remaining = row.keep + row.in
  return (
    <li
      data-testid="preview-tile"
      data-card-id={row.cardId}
      data-state={state}
      data-keep={row.keep}
      data-out={row.out}
      data-in={row.in}
      aria-label={t('side.preview.tileLabel', { name, keep: row.keep, out: row.out, in: row.in })}
      className={cn(
        'relative overflow-hidden rounded-[8px] border-2',
        state === 'in' ? 'border-ok' : row.out > 0 ? 'border-danger' : 'border-transparent',
      )}
    >
      <CardThumb id={row.shownId} name={name} className={cn('w-full', gone && 'opacity-60 saturate-50')} />
      {row.out > 0 && gone ? (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-danger/30" />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(to top right, transparent calc(50% - 1.5px), var(--danger) calc(50% - 1.5px), var(--danger) calc(50% + 1.5px), transparent calc(50% + 1.5px))' }}
          />
        </>
      ) : null}
      {row.in > 0 ? <span aria-hidden className="pointer-events-none absolute inset-0 bg-ok/15" /> : null}
      <span className="absolute bottom-1 left-1 flex gap-1">
        {row.out > 0 ? (
          <span aria-hidden className="rounded-full bg-danger-solid px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-danger-fg">
            {t('side.preview.outTag', { count: row.out })}
          </span>
        ) : null}
        {row.in > 0 ? (
          <span aria-hidden className="rounded-full bg-ok px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-bg">
            {t('side.preview.inTag', { count: row.in })}
          </span>
        ) : null}
      </span>
      {remaining > 1 ? (
        <span aria-hidden className="absolute bottom-1 right-1 rounded-full bg-bg/90 px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums text-fg">
          ×{remaining}
        </span>
      ) : null}
    </li>
  )
}

export function Preview({ rows, mainAfter, index, lang, className }: { rows: PreviewRow[]; mainAfter: number; index: CardIndex; lang: Lang; className?: string }) {
  const { t } = useTranslation()
  const sorted = useSortedRows(rows, index, lang)
  return (
    <section data-testid="preview" aria-label={t('side.preview.title')} className={cn('rounded-lg border border-line bg-surface-1', className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-3 py-3">
        <h2 className="text-base font-semibold">
          {t('side.preview.title')}
          <span data-testid="preview-count" className="ml-2 text-sm font-medium text-muted">
            {t('side.preview.count', { count: mainAfter })}
          </span>
        </h2>
        <ul aria-label={t('side.preview.legend')} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <li className="inline-flex items-center gap-1.5"><Swatch className="border-line-strong" />{t('side.preview.keep')}</li>
          <li className="inline-flex items-center gap-1.5"><Swatch className="border-danger bg-danger/30" />{t('side.preview.out')}</li>
          <li className="inline-flex items-center gap-1.5"><Swatch className="border-ok bg-ok/30" />{t('side.preview.in')}</li>
        </ul>
      </header>
      <div className="p-3">
        {sorted.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2">
            {sorted.map((r) => (
              <PreviewTile key={r.cardId} row={r} index={index} lang={lang} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[15px] text-muted">{t('side.preview.empty')}</p>
        )}
      </div>
    </section>
  )
}
