import * as RDropdown from '@radix-ui/react-dropdown-menu'
import { useId } from 'react'
import Check from 'lucide-react/icons/check'
import ChevronDown from 'lucide-react/icons/chevron-down'
import { cn } from './cn'
import { inputBase } from './Input'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  onValueChange: (v: string) => void
  options: SelectOption[]
  /** Etichetta visibile sopra il campo. */
  label: string
  className?: string
  'data-testid'?: string
}

/** Menu a scelta singola con lo stesso aspetto degli altri campi (al posto del <select> nativo del sistema). */
export function Select({ value, onValueChange, options, label, className, 'data-testid': testId }: SelectProps) {
  const id = useId()
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span id={id} className="text-sm font-medium text-fg">
        {label}
      </span>
      <RDropdown.Root>
        <RDropdown.Trigger
          aria-labelledby={id}
          data-testid={testId}
          data-value={value}
          className={cn(inputBase, 'flex cursor-pointer items-center justify-between gap-2 text-left data-[state=open]:border-accent-text')}
        >
          <span className="min-w-0 flex-1 truncate">{current?.label}</span>
          <ChevronDown size={18} aria-hidden className="shrink-0 text-muted" />
        </RDropdown.Trigger>
        <RDropdown.Portal>
          <RDropdown.Content
            align="start"
            sideOffset={6}
            collisionPadding={16}
            className="anim-pop z-[60] max-h-[min(60vh,360px)] w-[var(--radix-dropdown-menu-trigger-width)] min-w-52 overflow-y-auto rounded-md border border-line bg-surface-1 p-1 shadow-2"
          >
            <RDropdown.RadioGroup value={value} onValueChange={onValueChange}>
              {options.map((o) => (
                <RDropdown.RadioItem
                  key={o.value}
                  value={o.value}
                  data-option={o.value}
                  className="flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-sm px-3 text-[15px] text-fg outline-none data-[highlighted]:bg-surface-3 data-[state=checked]:font-medium"
                >
                  <span className="flex-1">{o.label}</span>
                  <RDropdown.ItemIndicator>
                    <Check size={18} aria-hidden className="text-accent-text" />
                  </RDropdown.ItemIndicator>
                </RDropdown.RadioItem>
              ))}
            </RDropdown.RadioGroup>
          </RDropdown.Content>
        </RDropdown.Portal>
      </RDropdown.Root>
    </div>
  )
}
