import { CardImage } from '@/features/cards/CardImage'
import { cn } from '@/ui/cn'

/** Miniatura con proporzioni carta (59:86) attorno a CardImage. */
export function CardThumb({ id, name, size = 'small', className }: { id: number; name: string; size?: 'small' | 'full'; className?: string }) {
  return (
    <div className={cn('relative aspect-[59/86] shrink-0 overflow-hidden rounded-[6px] bg-surface-3', className)}>
      <CardImage id={id} size={size} alt={name} className="size-full object-cover" />
    </div>
  )
}
