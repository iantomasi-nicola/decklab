import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import type { ButtonVariant } from './Button'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-danger-solid text-danger-fg hover:opacity-90',
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'aria-label'> {
  /** Obbligatoria: nome accessibile del pulsante. */
  label: string
  icon: ReactNode
  variant?: ButtonVariant
}

export function IconButton({ label, icon, variant = 'ghost', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...rest}
    >
      <span aria-hidden className="inline-flex">{icon}</span>
    </button>
  )
}
