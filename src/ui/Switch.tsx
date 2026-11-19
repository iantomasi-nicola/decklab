import * as RSwitch from '@radix-ui/react-switch'
import { useId } from 'react'
import { cn } from './cn'

export interface SwitchProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  className?: string
}

export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId()
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', className)}>
      <label htmlFor={id} className="flex-1 cursor-pointer py-2">
        <span className="block text-[15px] font-medium text-fg">{label}</span>
        {description ? <span className="block text-sm text-muted">{description}</span> : null}
      </label>
      {/* area di tocco 48×44 (la pista visiva resta 48×28) */}
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="group relative h-11 w-12 shrink-0 cursor-pointer rounded-full disabled:opacity-50"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-2 h-7 rounded-full border border-line-strong bg-surface-2 transition-colors duration-150 group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent"
        />
        <RSwitch.Thumb className="absolute left-0 top-3 block size-5 translate-x-1 rounded-full bg-fg shadow-1 transition-transform duration-150 data-[state=checked]:translate-x-6 data-[state=checked]:bg-accent-fg" />
      </RSwitch.Root>
    </div>
  )
}
