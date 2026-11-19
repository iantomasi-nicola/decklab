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
}

export function Segmented<T extends string>({ value, onValueChange, options, label, className }: SegmentedProps<T>) {
  return (
    <TG.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onValueChange(v as T)}
      className={cn('inline-flex w-full gap-1 rounded-md border border-line bg-surface-2 p-0.5 sm:w-auto', className)}
    >
      {options.map((o) => (
        <TG.Item
          key={o.value}
          value={o.value}
          className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-sm px-3 text-[15px] font-medium text-muted transition-colors duration-150 hover:text-fg data-[state=on]:bg-accent data-[state=on]:text-accent-fg sm:flex-none"
        >
          {o.icon ? <span aria-hidden className="inline-flex">{o.icon}</span> : null}
          {o.label}
        </TG.Item>
      ))}
    </TG.Root>
  )
}
