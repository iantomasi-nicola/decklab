import type { ReactNode } from 'react'
import { cn } from './cn'

export interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  className?: string
}

/** Stato vuoto: dice cosa manca e qual è il prossimo passo. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      <div aria-hidden className="relative mb-5 grid size-16 place-items-center">
        <span className="absolute inset-0 -rotate-6 rounded-md border border-line bg-surface-2" />
        <span className="absolute inset-0 rotate-3 rounded-md border border-line bg-accent-soft" />
        <span className="relative text-accent-text">{icon}</span>
      </div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-[44ch] text-[15px] text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}
