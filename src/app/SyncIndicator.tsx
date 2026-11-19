import { useTranslation } from 'react-i18next'
import Cloud from 'lucide-react/icons/cloud'
import CloudCheck from 'lucide-react/icons/cloud-check'
import CloudOff from 'lucide-react/icons/cloud-off'
import RefreshCw from 'lucide-react/icons/refresh-cw'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import { cn } from '@/ui/cn'
import { useSyncIndicator } from './syncIndicator'
import type { SyncState } from './syncStatusPlaceholder'

const ICONS = { idle: CloudCheck, syncing: RefreshCw, offline: CloudOff, error: TriangleAlert, disabled: Cloud }
const TONES: Record<SyncState, string> = {
  idle: 'text-ok',
  syncing: 'text-accent-text',
  offline: 'text-muted',
  error: 'text-danger',
  disabled: 'text-subtle',
}

/** Indicatore discreto di sincronizzazione. Dimensione fissa: non sposta nulla quando lo stato cambia. */
export function SyncIndicator({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const { t } = useTranslation()
  const { state, pending } = useSyncIndicator()
  const Icon = ICONS[state]
  const text =
    pending > 0 && state !== 'disabled' ? `${t(`sync.${state}`)}, ${t('sync.pending', { count: pending })}` : t(`sync.${state}`)
  return (
    <div
      role="status"
      aria-label={`${t('sync.label')}: ${text}`}
      title={text}
      className={cn('flex min-h-11 items-center gap-2', TONES[state], className)}
    >
      <Icon aria-hidden size={18} className={cn('shrink-0', state === 'syncing' && 'animate-spin')} />
      {showLabel ? <span className="text-sm leading-snug text-muted">{text}</span> : null}
    </div>
  )
}
