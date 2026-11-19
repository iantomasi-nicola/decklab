/** Sostituto di CardImage per i test visivi: faccia carta disegnata in SVG (colore per tipo) con il nome. */
import { cn } from '@/ui/cn'
import { MOCK_CARDS } from './cardsData'

const byId = new Map(MOCK_CARDS.map((c) => [c.id, c]))

function color(id: number): string {
  const c = byId.get(id)
  if (!c) return '#4a4f63'
  if (c.type & 2) return '#1d9e75'
  if (c.type & 4) return '#a8458f'
  if (c.type & 0x4000000) return '#1f6fb8'
  if (c.type & 0x800000) return '#2b2d3a'
  if (c.type & 0x2000) return '#c9c9d3'
  if (c.type & 0x40) return '#8a4fc1'
  return '#c2862e'
}

export function CardImage({ id, size = 'small', alt = '', className }: { id: number; size?: 'small' | 'full'; alt?: string; className?: string; eager?: boolean }) {
  const label = alt.length > 22 ? `${alt.slice(0, 21)}…` : alt
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 59 86'><rect width='59' height='86' fill='${color(id)}'/><rect x='4' y='14' width='51' height='44' fill='rgba(255,255,255,.22)'/><text x='29.5' y='9' font-size='5' text-anchor='middle' fill='#111' font-family='sans-serif'>${label.replace(/[<&>']/g, '')}</text><text x='29.5' y='76' font-size='6' text-anchor='middle' fill='#111' font-family='sans-serif'>${id}</text></svg>`
  return (
    <div className={cn('relative block overflow-hidden rounded-[6px] bg-surface-3', !/(^|\s)(w|size)-/.test(className ?? '') && 'w-full', className)} style={{ aspectRatio: '59 / 86' }} data-testid="card-image" data-size={size}>
      <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt={alt} className="size-full object-cover" draggable={false} />
    </div>
  )
}
