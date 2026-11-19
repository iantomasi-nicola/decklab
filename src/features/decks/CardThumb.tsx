import { CardImage } from '@/features/cards/CardImage'
import { cn } from '@/ui/cn'

/** Miniatura carta (59:86): CardImage fissa già proporzioni, skeleton e dorso di ripiego; qui si decide solo la larghezza. */
export function CardThumb({ id, name, size = 'small', className }: { id: number; name: string; size?: 'small' | 'full'; className?: string }) {
  return <CardImage id={id} size={size} alt={name} className={cn('shrink-0', className)} />
}
