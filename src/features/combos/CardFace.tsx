import type { CSSProperties } from 'react'
import EyeOff from 'lucide-react/icons/eye-off'
import { CardImage } from '@/features/cards/CardImage'
import type { Position } from '@/domain/combo/types'
import { cn } from '@/ui/cn'

export const isDefPos = (pos: Position | undefined) => pos === 'FACEUP_DEF' || pos === 'FACEDOWN_DEF'
export const isDownPos = (pos: Position | undefined) => pos === 'FACEDOWN' || pos === 'FACEDOWN_DEF'

/**
 * Carta con rapporto fisso. Se coperta mostra un velo con l'icona (resta riconoscibile: è un editor).
 * Con `fit` (dentro `.cl-fit`) la carta in DEF ruota di 90° e si centra nel contenitore già ruotato.
 */
export function CardFace({ code, name, pos, className, fit }: { code: number; name: string; pos?: Position | undefined; className?: string; fit?: boolean }) {
  const down = isDownPos(pos)
  const style: CSSProperties | undefined =
    fit && isDefPos(pos)
      ? { position: 'absolute', left: '50%', top: '50%', width: 'var(--wd)', transform: 'translate(-50%, -50%) rotate(90deg)' }
      : undefined
  return (
    <div className={cn('relative', !style && 'w-full', className)} style={{ aspectRatio: '59 / 86', ...style }}>
      <CardImage id={code} alt={name} className="w-full" />
      {down ? (
        <div
          aria-hidden
          className="absolute inset-0 grid place-items-center rounded-[6px]"
          style={{ background: 'color-mix(in srgb, var(--bg) 62%, transparent)', backdropFilter: 'saturate(.4)' }}
        >
          <EyeOff className="size-[34%]" style={{ color: 'var(--fg-muted)' }} />
        </div>
      ) : null}
    </div>
  )
}
