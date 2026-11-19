import type { ComponentProps } from 'react'
import { cn } from './cn'

type Level = 1 | 2 | 3

const levels: Record<Level, string> = {
  1: 'bg-surface-1 border border-line shadow-1',
  2: 'bg-surface-2 border border-line',
  3: 'bg-surface-3 border border-line',
}

export interface SurfaceProps extends ComponentProps<'div'> {
  level?: Level
  /** Rende la superficie interattiva (hover) quando è dentro un link/pulsante. */
  interactive?: boolean
}

export function Surface({ level = 1, interactive, className, ...rest }: SurfaceProps) {
  return (
    <div
      className={cn(
        'rounded-lg',
        levels[level],
        interactive && 'transition-colors duration-150 hover:border-line-strong',
        className,
      )}
      {...rest}
    />
  )
}

export const Card = Surface
