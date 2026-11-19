import { useWidth } from './useWidth'

export interface SplitPart {
  key: string
  label: string
  value: number
  color: string
  /** Testo stampato dentro il blocco (se ci sta). */
  text: string
  /** Tratteggio a 45° (canale di riserva per chi non distingue i colori). */
  hatch?: boolean
}

/**
 * Barra segmentata alta: un intero diviso in parti (larghezze proporzionali). Blocchi con angoli da 4px e 2px di luce tra l'uno e l'altro;
 * il testo sta dentro solo se ci sta, altrimenti resta in legenda e tabella.
 */
export function SplitBar({ parts, ariaLabel }: { parts: SplitPart[]; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const total = parts.reduce((a, p) => a + p.value, 0)
  const visible = parts.filter((p) => p.value > 0)
  const gap = 2
  const usable = Math.max(0, width - gap * (visible.length - 1))
  return (
    <div ref={ref} role="img" aria-label={ariaLabel} className="flex h-7 w-full" style={{ gap }}>
      {total > 0
        ? visible.map((p) => {
            const w = (p.value / total) * usable
            const fits = w >= p.text.length * 10.5 + 16
            return (
              <div
                key={p.key}
                title={`${p.label}: ${p.text}`}
                className={`flex items-center overflow-hidden rounded-[4px] px-2 text-[14px] font-bold leading-none${p.hatch ? ' viz-hatch' : ''}`}
                style={{ width: w, background: p.color, color: 'var(--viz-on)' }}
              >
                {fits ? <span className="whitespace-nowrap">{p.text}</span> : null}
              </div>
            )
          })
        : null}
    </div>
  )
}

export function Legend({ items }: { items: { key: string; label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {items.map((i) => (
        <li key={i.key} className="inline-flex items-center gap-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: i.color }} />
          <span>
            {i.label}
            {i.value ? <span className="ml-1.5 font-medium tabular-nums text-fg">{i.value}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}
