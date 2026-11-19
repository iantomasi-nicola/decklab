import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from './cn'

export const inputBase =
  'min-h-11 w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] text-fg placeholder:text-subtle transition-colors duration-150 hover:border-accent-text focus-visible:border-accent-text disabled:opacity-50'

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={cn(inputBase, className)} {...rest} />
}

export interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/** Etichetta + suggerimento + errore, con associazioni ARIA corrette. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errId = `${id}-err`
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
