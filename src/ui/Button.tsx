import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-1',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger-solid text-danger-fg hover:opacity-90',
}

export const buttonBase =
  'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-md px-4 text-[15px] font-medium leading-none whitespace-nowrap transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50'

/** Classi di un Button per un link (<a>) con lo stesso aspetto. */
export const buttonClasses = (variant: ButtonVariant = 'secondary') => cn(buttonBase, variants[variant])

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  icon?: ReactNode
  /** Mostra un indicatore e blocca il clic senza cambiare la larghezza. */
  busy?: boolean
}

export function Button({ variant = 'secondary', icon, busy, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cn(buttonBase, variants[variant], className)}
      {...rest}
    >
      {icon ? <span aria-hidden className="inline-flex shrink-0">{icon}</span> : null}
      {children}
    </button>
  )
}
