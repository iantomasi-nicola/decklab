import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/ui/cn'

export const VIRTUAL_THRESHOLD = 200

interface Props<T> {
  items: readonly T[]
  rowHeight: number
  getKey: (item: T) => string | number
  renderRow: (item: T, index: number) => ReactNode
  label: string
  /** true: il contenitore riempie l'altezza del genitore e scorre sempre. false: scorre solo quando virtualizzato. */
  fill?: boolean
  className?: string
  threshold?: number
  overscan?: number
  maxHeight?: string
}

/**
 * Lista ad altezza di riga fissa. Sopra `threshold` elementi renderizza solo la finestra visibile;
 * sotto, renderizza tutto (nessun overhead e nessun contenitore scorrevole in più).
 */
export function VirtualList<T>({
  items, rowHeight, getKey, renderRow, label, fill, className, threshold = VIRTUAL_THRESHOLD, overscan = 8, maxHeight = '70dvh',
}: Props<T>) {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(600)
  const virtual = items.length > threshold

  useEffect(() => {
    const el = ref.current
    if (!el || !virtual) return
    const ro = new ResizeObserver(() => setViewport(el.clientHeight || 600))
    ro.observe(el)
    setViewport(el.clientHeight || 600)
    return () => ro.disconnect()
  }, [virtual])

  if (!virtual) {
    return (
      <div className={cn(fill && 'h-full overflow-y-auto', className)}>
        <ul aria-label={label} className="flex flex-col">
          {items.map((it, i) => (
            <li key={getKey(it)} style={{ minHeight: rowHeight }}>
              {renderRow(it, i)}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const total = items.length * rowHeight
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
  return (
    <div
      ref={ref}
      data-virtual="true"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={cn('overflow-y-auto', fill && 'h-full', className)}
      style={fill ? undefined : { height: Math.min(total, 9999), maxHeight }}
    >
      <ul aria-label={label} style={{ height: total, position: 'relative' }}>
        {items.slice(start, end).map((it, k) => (
          <li
            key={getKey(it)}
            aria-setsize={items.length}
            aria-posinset={start + k + 1}
            style={{ position: 'absolute', top: (start + k) * rowHeight, left: 0, right: 0, height: rowHeight }}
          >
            {renderRow(it, start + k)}
          </li>
        ))}
      </ul>
    </div>
  )
}
