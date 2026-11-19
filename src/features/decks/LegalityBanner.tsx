import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Lang, LegalityIssue, Rules } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cardName } from './cardData'
import { issueKey, sortIssues } from './legalityView'

const COLLAPSED = 4

/** Testo di un problema, già tradotto (usato dal banner e dalle liste di varianti). */
export function useIssueText(index: CardIndex | undefined, lang: Lang) {
  const { t } = useTranslation()
  return (i: LegalityIssue): string =>
    t(`legality.issue.${issueKey(i)}`, {
      ...i.params,
      name: i.cardId !== undefined ? cardName(index?.byId(i.cardId), lang, i.cardId) : '',
    })
}

export interface LegalityBannerProps {
  issues: readonly LegalityIssue[]
  rules: Rules
  banlistLabel: string
  banlistMissing?: boolean
  index: CardIndex
  lang: Lang
}

export function LegalityBanner({ issues, rules, banlistLabel, banlistMissing, index, lang }: LegalityBannerProps) {
  const { t } = useTranslation()
  const [all, setAll] = useState(false)
  const text = useIssueText(index, lang)
  const sorted = sortIssues(issues)
  const shown = all ? sorted : sorted.slice(0, COLLAPSED)
  const legal = sorted.length === 0

  return (
    <div data-testid="legality-banner" data-legal={legal} data-count={sorted.length}>
      <Banner
        tone={legal ? 'ok' : 'danger'}
        title={legal ? t('legality.legalTitle') : t('legality.illegalTitle', { count: sorted.length })}
      >
        <p>{legal ? t('legality.legalBody', { rules, banlist: banlistLabel }) : t('legality.illegalBody', { rules, banlist: banlistLabel })}</p>
        {banlistMissing ? <p className="mt-1 text-warn">{t('legality.banlistMissing', { banlist: banlistLabel })}</p> : null}
        {sorted.length ? (
          <>
            <ul className="mt-3 flex flex-col gap-1.5">
              {shown.map((i, k) => (
                <li key={`${i.code}-${i.cardId ?? 'x'}-${k}`} className="flex gap-2 text-fg">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-danger" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{text(i)}</span>
                </li>
              ))}
            </ul>
            {sorted.length > COLLAPSED ? (
              <Button variant="ghost" className="-ml-4 mt-1" onClick={() => setAll((v) => !v)} aria-expanded={all}>
                {all ? t('legality.showLess') : t('legality.showAll', { count: sorted.length })}
              </Button>
            ) : null}
          </>
        ) : null}
      </Banner>
    </div>
  )
}
