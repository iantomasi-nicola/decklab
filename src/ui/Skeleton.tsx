import type { ComponentProps } from 'react'
import { cn } from './cn'

/** Segnaposto con dimensioni esplicite: nessuno shift di layout quando arrivano i dati. */
export function Skeleton({ className, ...rest }: ComponentProps<'div'>) {
  return <div aria-hidden className={cn('skeleton', className)} {...rest} />
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
