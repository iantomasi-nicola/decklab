import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckLists, Lang } from '@/domain/types'
import type { TextListResult } from '@/domain/deck/textList'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { cn } from '@/ui/cn'
import { altName, cardName } from './cardData'
import { cardSubtitle } from './cardMeta'
import { CardThumb } from './CardThumb'
import { countCards, resolveReview } from './importHelpers'

interface Props {
  open: boolean
  result: TextListResult | null
  lang: Lang
  onCancel: () => void
  onConfirm: (deck: DeckLists) => void
}

/** Revisione di un import testuale: righe ambigue (scelta della carta), non trovate e corrette per refuso. */
export function ReviewDialog({ open, result, lang, onCancel, onConfirm }: Props) {
  const { t } = useTranslation()
  const [choices, setChoices] = useState<Record<number, number | undefined>>({})
  useEffect(() => {
    if (open) setChoices({})
  }, [open, result])

  const deck = useMemo(() => (result ? resolveReview(result, choices) : null), [result, choices])
  if (!result) return null
  const resolved = Object.values(choices).filter((v) => v !== undefined).length
  const fuzzy = result.matched.filter((m) => m.fuzzy)
  const total = deck ? countCards(deck) : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onCancel()}
      title={t('import.review.title')}
      description={t('import.review.body', { matched: result.matched.length, ambiguous: result.ambiguous.length, unmatched: result.unmatched.length })}
      className="max-w-2xl"
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={total === 0} onClick={() => deck && onConfirm(deck)}>
            {t('import.review.confirm', { count: total })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="review-dialog">
        {result.ambiguous.map((a, i) => (
          <fieldset key={`${a.line}-${i}`} className="min-w-0 rounded-lg border border-line p-3" data-testid="ambiguous-line">
            <legend className="px-1 text-[15px] font-semibold text-fg [overflow-wrap:anywhere]">
              {t('import.review.ambiguousLine', { line: a.line, count: a.count })}
            </legend>
            <p className="mb-2 text-sm text-muted">{t('import.review.ambiguousHint')}</p>
            <div className="flex flex-col gap-1">
              {a.candidates.map((c) => {
                const checked = choices[i] === c.id
                return (
                  <label
                    key={c.id}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-2 py-1.5 transition-colors duration-150',
                      checked ? 'border-accent-text bg-accent-soft' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input
                      type="radio"
                      name={`amb-${i}`}
                      checked={checked}
                      onChange={() => setChoices((s) => ({ ...s, [i]: c.id }))}
                      className="size-5 shrink-0 accent-[var(--accent)]"
                    />
                    <CardThumb id={c.id} name={cardName(c, lang)} className="w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{cardName(c, lang)}</span>
                      <span className="block truncate text-sm text-muted">{altName(c, lang) ?? cardSubtitle(c, t)}</span>
                    </span>
                    <span className="text-xs text-subtle">#{c.id}</span>
                  </label>
                )
              })}
              <label
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-2 text-[15px] text-muted',
                  choices[i] === undefined ? 'border-line-strong bg-surface-2' : 'border-line hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name={`amb-${i}`}
                  checked={choices[i] === undefined}
                  onChange={() => setChoices((s) => ({ ...s, [i]: undefined }))}
                  className="size-5 shrink-0 accent-[var(--accent)]"
                />
                {t('import.review.skip')}
              </label>
            </div>
          </fieldset>
        ))}

        {result.unmatched.length ? (
          <section data-testid="unmatched-lines">
            <h3 className="mb-1 text-base font-semibold text-fg">{t('import.review.unmatchedTitle', { count: result.unmatched.length })}</h3>
            <p className="mb-2 text-sm text-muted">{t('import.review.unmatchedHint')}</p>
            <ul className="flex flex-col gap-1 text-[15px]">
              {result.unmatched.map((u, i) => (
                <li key={i} className="rounded-md bg-surface-2 px-3 py-2 text-danger [overflow-wrap:anywhere]">
                  {u.line}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {fuzzy.length ? (
          <section>
            <h3 className="mb-1 text-base font-semibold text-fg">{t('import.review.fuzzyTitle', { count: fuzzy.length })}</h3>
            <ul className="flex flex-col gap-1 text-[15px] text-muted">
              {fuzzy.map((m, i) => (
                <li key={i} className="[overflow-wrap:anywhere]">
                  {m.line} <span aria-hidden>→</span> <span className="font-medium text-fg">{cardName(m.card, lang)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-sm text-muted" aria-live="polite">
          {t('import.review.resolved', { done: resolved, total: result.ambiguous.length })}
        </p>
      </div>
    </Dialog>
  )
}
