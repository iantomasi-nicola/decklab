import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Info from 'lucide-react/icons/info'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import CircleCheck from 'lucide-react/icons/circle-check'
import CircleX from 'lucide-react/icons/circle-x'
import X from 'lucide-react/icons/x'
import { cn } from './cn'

export type BannerTone = 'info' | 'ok' | 'warn' | 'danger'

const icons = { info: Info, ok: CircleCheck, warn: TriangleAlert, danger: CircleX }
const iconColor: Record<BannerTone, string> = {
  info: 'text-accent-text',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}

export interface BannerProps {
  tone?: BannerTone
  title: string
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
  className?: string
}

export function Banner({ tone = 'info', title, children, action, onDismiss, className }: BannerProps) {
  const { t } = useTranslation()
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border border-line bg-surface-1 p-4', className)}
    >
      <Icon aria-hidden size={20} className={cn('mt-0.5 shrink-0', iconColor[tone])} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">{title}</p>
        {children ? <div className="mt-1 text-[15px] text-muted">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={onDismiss}
          className="-m-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:text-fg"
        >
          <X aria-hidden size={16} />
        </button>
      ) : null}
    </div>
  )
}
