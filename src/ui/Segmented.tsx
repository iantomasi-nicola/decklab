import * as TG from '@radix-ui/react-toggle-group'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export interface SegmentedProps<T extends string> {
  value: T
  onValueChange: (v: T) => void
  options: SegmentedOption<T>[]
  /** Nome accessibile del gruppo. */
  label: string
  className?: string
  /** Le opzioni si dividono sempre tutta la larghezza (anche da `sm` in su). */
  fill?: boolean
}

export function Segmented<T extends string>({ value, onValueChange, options, label, className, fill }: SegmentedProps<T>) {
  return (
    <TG.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('grid max-w-full auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-surface-2 p-0.5', fill ? 'w-full' : 'w-fit', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 py-1 text-center text-[15px] font-medium leading-tight text-muted transition-colors duration-150 hover:text-fg data-[state=on]:bg-accent data-[state=on]:text-accent-fg',
          )}
        >
          {o.icon ? <span aria-hidden className="inline-flex max-[420px]:hidden">{o.icon}</span> : null}
          <span className="min-w-0">{o.label}</span>
        </TG.Item>
      ))}
    </TG.Root>
  )
}
