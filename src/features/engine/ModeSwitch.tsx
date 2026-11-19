/** Interruttore "Manuale | Automatica" dell'editor (icona sola su telefono). */
import Cpu from 'lucide-react/icons/cpu'
import Hand from 'lucide-react/icons/hand'
import { Tooltip } from '@/ui/Tooltip'
import { cn } from '@/ui/cn'
import { useEngT } from './strings'

export function ModeSwitch({ auto, onChange, disabled, compact }: { auto: boolean; onChange: (auto: boolean) => void; disabled?: boolean; compact?: boolean }) {
  const { t } = useEngT()
  if (compact) {
    return (
      <Tooltip label={`${t('mode.label')}: ${auto ? t('mode.auto') : t('mode.manual')}`}>
        <button
          type="button"
          aria-label={t('mode.auto')}
          aria-pressed={auto}
          disabled={disabled}
          data-testid="mode-auto"
          onClick={() => onChange(!auto)}
          className={cn('inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 disabled:opacity-50', auto ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
        >
          <Cpu size={20} aria-hidden />
        </button>
      </Tooltip>
    )
  }
  const item = (on: boolean, label: string, Icon: typeof Cpu, id: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={auto === on}
      disabled={disabled}
      data-testid={id}
      onClick={() => auto !== on && onChange(on)}
      className={cn('inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-sm px-3 text-[15px] font-medium transition-colors duration-150 disabled:opacity-50', auto === on ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg')}
    >
      <Icon size={16} aria-hidden />
      {label}
    </button>
  )
  return (
    <div role="radiogroup" aria-label={t('mode.label')} className="mr-1 inline-flex gap-0.5 rounded-md border border-line bg-surface-2 p-0.5" title={auto ? t('mode.autoHint') : t('mode.manualHint')}>
      {item(false, t('mode.manual'), Hand, 'mode-manual')}
      {item(true, t('mode.auto'), Cpu, 'mode-auto')}
    </div>
  )
}
