import * as RTabs from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'
import { cn } from './cn'

export const Tabs = RTabs.Root

export function TabsList({ className, ...rest }: ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn('flex gap-1 overflow-x-auto border-b border-line', className)} {...rest} />
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        '-mb-px inline-flex min-h-11 cursor-pointer items-center whitespace-nowrap border-b-2 border-transparent px-3 text-[15px] font-medium text-muted transition-colors duration-150 hover:text-fg data-[state=active]:border-accent-text data-[state=active]:text-fg',
        className,
      )}
      {...rest}
    />
  )
}

export function TabsContent({ className, ...rest }: ComponentProps<typeof RTabs.Content>) {
  return <RTabs.Content className={cn('pt-4', className)} {...rest} />
}
