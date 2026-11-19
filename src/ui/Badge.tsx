import type { ComponentProps } from 'react'
import { cn } from './cn'

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

const tones: Record<BadgeTone, string> = {
  neutral: 'text-muted',
  accent: 'text-accent-text',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}
const dots: Record<BadgeTone, string> = {
  neutral: 'bg-subtle',
  accent: 'bg-accent-text',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
}

/** Il colore non è l'unico segnale: c'è sempre testo. */
export function Badge({ tone = 'neutral', className, children, ...rest }: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-xs font-medium',
        tones[tone],
        className,
      )}
      {...rest}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', dots[tone])} />
      {children}
    </span>
  )
}
