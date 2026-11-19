import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Minus from 'lucide-react/icons/minus'
import Plus from 'lucide-react/icons/plus'
import Check from 'lucide-react/icons/check'
import X from 'lucide-react/icons/x'
import type { Label } from '@/domain/stats'
import type { Lang } from '@/domain/types'
import { cn } from '@/ui/cn'

export const useLang = (): Lang => {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage === 'it' ? 'it' : 'en'
}

/** Campo numerico con − e + da 44px. */
export function Stepper({ value, min, max, onChange, label, className }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; className?: string }) {
  const id = useId()
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)))
  const btn = 'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div role="group" aria-labelledby={id} className={cn('inline-flex items-center rounded-md border border-line-strong bg-surface-1', className)}>
      <span id={id} className="sr-only">
        {label}
      </span>
      <button type="button" aria-label={`${label} −`} className={cn(btn, 'rounded-l-md')} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        <Minus aria-hidden size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-labelledby={id}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && e.target.value !== '') onChange(clamp(n))
        }}
        className="h-11 w-14 min-w-0 border-x border-line bg-transparent text-center text-[15px] font-semibold tabular-nums text-fg [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" aria-label={`${label} +`} className={cn(btn, 'rounded-r-md')} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        <Plus aria-hidden size={18} />
      </button>
    </div>
  )
}

/** Dato in evidenza con etichetta (sentence case, niente due punti). */
export function StatTile({ label, value, hint, emphasis, className }: { label: string; value: ReactNode; hint?: string; emphasis?: boolean; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-md border bg-surface-2 p-4', emphasis ? 'border-accent-text' : 'border-line', className)}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold leading-tight tabular-nums text-fg">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  )
}

/** Etichetta PLAYABLE/BRICK: simbolo + testo, mai solo il colore. */
export function LabelBadge({ label, text }: { label: Label; text: string }) {
  const playable = label === 'PLAYABLE'
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-medium text-fg">
      <span
        aria-hidden
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: playable ? 'var(--viz-playable)' : 'var(--viz-brick)', color: 'var(--viz-on)' }}
      >
        {playable ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
      </span>
      {text}
    </span>
  )
}

export function Progress({ value, active }: { value: number; active: boolean }) {
  return (
    <div aria-hidden className={cn('h-0.5 w-full overflow-hidden rounded-full bg-transparent transition-opacity duration-200', active ? 'opacity-100' : 'opacity-0')}>
      <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${value}%` }} />
    </div>
  )
}

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">{title}</h2>
          {hint ? <p className="mt-1 max-w-[60ch] text-[15px] text-muted">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
