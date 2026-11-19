import EyeOff from 'lucide-react/icons/eye-off'
import { CardImage } from '@/features/cards/CardImage'
import type { Position } from '@/domain/combo/types'
import { cn } from '@/ui/cn'

/** DEF e coperte in DEF: la carta ruota di 90° e si riduce per restare nella cella (59/86). */
export const DEF_SCALE = 59 / 86

export const isDefPos = (pos: Position | undefined) => pos === 'FACEUP_DEF' || pos === 'FACEDOWN_DEF'
export const isDownPos = (pos: Position | undefined) => pos === 'FACEDOWN' || pos === 'FACEDOWN_DEF'

/** Carta con rapporto fisso; se coperta mostra un velo con l'icona (resta riconoscibile: è un editor). */
export function CardFace({ code, name, pos, className }: { code: number; name: string; pos?: Position | undefined; className?: string }) {
  const down = isDownPos(pos)
  return (
    <div
      className={cn('relative w-full', className)}
      style={{ aspectRatio: '59 / 86', transform: isDefPos(pos) ? `rotate(90deg) scale(${DEF_SCALE})` : undefined }}
    >
      <CardImage id={code} alt={name} className="w-full" />
      {down ? (
        <div
          aria-hidden
          className="absolute inset-0 grid place-items-center rounded-[6px]"
          style={{ background: 'color-mix(in srgb, var(--bg) 62%, transparent)', backdropFilter: 'saturate(.4)' }}
        >
          <EyeOff className="size-[34%] text-fg-muted" style={{ color: 'var(--fg-muted)' }} />
        </div>
      ) : null}
    </div>
  )
}
