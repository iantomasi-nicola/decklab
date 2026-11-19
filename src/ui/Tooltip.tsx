import * as RTooltip from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RTooltip.Provider delayDuration={400} skipDelayDuration={200}>{children}</RTooltip.Provider>
}

/** Il trigger deve essere un solo elemento focalizzabile. Il contenuto è un'aggiunta, mai l'unica etichetta. */
export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="anim-fade z-[70] rounded-sm border border-line bg-surface-3 px-2.5 py-1.5 text-sm text-fg shadow-2"
        >
          {label}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}
