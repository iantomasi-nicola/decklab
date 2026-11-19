import { useTranslation } from 'react-i18next'
import type { LegalityIssue } from '@/domain/types'
import { Badge } from '@/ui/Badge'
import { cn } from '@/ui/cn'
import { badgeKey, banStatusKey } from './legalityView'

/** Etichetta di violazione (rossa) per una carta, usata sulle miniature. */
export function IssuePill({ issue, className }: { issue: LegalityIssue; className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      data-testid="issue-pill"
      data-code={issue.code}
      className={cn('inline-flex max-w-full items-center whitespace-nowrap rounded-sm bg-danger-solid px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-danger-fg shadow-1', className)}
    >
      {t(`legality.badge.${badgeKey(issue.code)}`)}
    </span>
  )
}

/** Stato informativo della banlist per una carta (anche se il mazzo è legale). */
export function BanStatusBadge({ status }: { status: ReturnType<typeof banStatusKey> }) {
  const { t } = useTranslation()
  if (!status) return null
  return (
    <Badge tone={status === 'forbidden' ? 'danger' : 'warn'} data-testid="ban-status" data-status={status}>
      {t(`legality.badge.${status}`)}
    </Badge>
  )
}
