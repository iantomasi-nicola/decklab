import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CircleCheck from 'lucide-react/icons/circle-check'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import CircleX from 'lucide-react/icons/circle-x'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { SideIssue, SideValidation } from '@/domain/side'
import type { LegalityIssue, Lang } from '@/domain/types'
import { cardName } from '@/features/decks/cardData'
import { issueKey } from '@/features/decks/legalityView'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

/** Testo di un problema del piano, già tradotto (riusa i testi della legalità per taglia/copie/banlist). */
export function useSideIssueText(index: CardIndex, lang: Lang) {
  const { t } = useTranslation()
  return (i: SideIssue): string => {
    const name = i.cardId !== undefined ? cardName(index.byId(i.cardId), lang, i.cardId) : ''
    const p = i.params
    switch (i.code) {
      case 'empty':
        return t('side.issue.empty')
      case 'unbalanced':
        return t(p.side === 'out' ? 'side.balance.missingOut' : 'side.balance.missingIn', { count: Number(p.missing) })
      case 'out-unavailable':
        return t('side.issue.outUnavailable', { ...p, name })
      case 'in-unavailable':
        return t('side.issue.inUnavailable', { ...p, name })
      case 'main-size':
        return t('legality.issue.main-size', p)
      case 'side-size':
        return t('legality.issue.side-size', p)
      case 'too-many-copies':
        return t('legality.issue.too-many-copies', { ...p, name })
      case 'legality': {
        const { legalityCode, ...rest } = p
        const li: LegalityIssue = { code: legalityCode as LegalityIssue['code'], severity: i.severity, ...(i.cardId !== undefined ? { cardId: i.cardId } : {}), params: rest }
        return t(`legality.issue.${issueKey(li)}`, { ...rest, name })
      }
      default:
        return t('side.issueFallback')
    }
  }
}

const HEADLINE_ORDER: SideIssue['code'][] = ['empty', 'unbalanced', 'out-unavailable', 'in-unavailable', 'main-size', 'side-size', 'too-many-copies', 'legality']

/**
 * Barra di bilancio (sempre visibile): OUT ⇄ IN con i conteggi e una sola frase che dice cosa fare ("Mancano 2 OUT").
 * I problemi ulteriori stanno nel banner sotto (`IssueList`).
 */
export function BalanceBar({ validation, index, lang, className }: { validation: SideValidation; index: CardIndex; lang: Lang; className?: string }) {
  const { t } = useTranslation()
  const text = useSideIssueText(index, lang)
  const { summary, issues, ok } = validation
  const head = [...issues].sort((a, b) => HEADLINE_ORDER.indexOf(a.code) - HEADLINE_ORDER.indexOf(b.code))[0]
  const tone: 'ok' | 'warn' | 'danger' = ok ? 'ok' : head && (head.code === 'empty' || head.code === 'unbalanced') ? 'warn' : 'danger'
  const Icon = tone === 'ok' ? CircleCheck : tone === 'warn' ? TriangleAlert : CircleX
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-danger'
  return (
    <div
      data-testid="balance-bar"
      data-ok={ok}
      data-tone={tone}
      role="status"
      aria-label={t('side.balance.label')}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-1 px-3 py-2 shadow-1', className)}
    >
      <div className="flex items-center gap-2 tabular-nums" aria-hidden>
        <span className="flex items-baseline gap-1.5">
          <span data-testid="balance-out" className="min-w-6 text-right text-2xl font-bold leading-none text-danger">{summary.outCount}</span>
          <span className="text-xs font-semibold text-muted">{t('side.balance.out')}</span>
        </span>
        <span className={cn('text-xl font-bold leading-none', summary.balanced ? 'text-ok' : 'text-warn')}>{summary.balanced ? '=' : '≠'}</span>
        <span className="flex items-baseline gap-1.5">
          <span data-testid="balance-in" className="min-w-6 text-right text-2xl font-bold leading-none text-ok">{summary.inCount}</span>
          <span className="text-xs font-semibold text-muted">{t('side.balance.in')}</span>
        </span>
      </div>
      <p data-testid="balance-text" className={cn('flex min-w-0 flex-1 items-center gap-2 text-[15px] font-medium', color)}>
        <Icon aria-hidden size={18} className="shrink-0" />
        <span className="min-w-0">
          {ok ? t('side.balance.ok') : head ? text(head) : ''}
          {ok ? <span className="block text-sm font-normal text-muted">{t('side.balance.valid', { main: summary.mainAfter, side: summary.sideAfter })}</span> : null}
        </span>
      </p>
    </div>
  )
}

const COLLAPSED = 3

/** Problemi oltre al bilancio (carte non disponibili, dimensioni, banlist). */
export function IssueList({ validation, index, lang }: { validation: SideValidation; index: CardIndex; lang: Lang }) {
  const { t } = useTranslation()
  const text = useSideIssueText(index, lang)
  const [all, setAll] = useState(false)
  const list = validation.issues.filter((i) => i.code !== 'unbalanced' && i.code !== 'empty')
  if (!list.length) return null
  const shown = all ? list : list.slice(0, COLLAPSED)
  return (
    <Banner tone="danger" title={t('side.issue.title', { count: list.length })} className="[&_ul]:mt-0">
      <ul data-testid="issue-list" className="flex flex-col gap-1.5">
        {shown.map((i, k) => (
          <li key={`${i.code}-${i.cardId ?? ''}-${k}`} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-danger" />
            <span className="min-w-0">{text(i)}</span>
          </li>
        ))}
      </ul>
      {list.length > COLLAPSED ? (
        <Button variant="ghost" className="-ml-3 mt-1" onClick={() => setAll((v) => !v)}>
          {all ? t('side.issue.showLess') : t('side.issue.showAll')}
        </Button>
      ) : null}
    </Banner>
  )
}
