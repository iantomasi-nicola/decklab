import { useWidth } from './useWidth'

export interface HBarRow {
  key: string | number
  label: string
  /** Testo secondario accanto all'etichetta (es. "×3"). */
  sub?: string
  value: number
  text: string
}

const BAR = 16
const VALUE_COL = 64

/**
 * Elenco di barre orizzontali: barra con angolo arrotondato solo sulla punta (base piatta) e valore allineato a destra.
 * In colonne strette (< 520px) l'etichetta sta sopra la barra, così i nomi lunghi non vengono tagliati.
 */
export function HBars({ rows, max, color = 'var(--viz-neutral)' }: { rows: HBarRow[]; max?: number; color?: string }) {
  const [ref, width] = useWidth<HTMLUListElement>()
  const top = max ?? Math.max(0, ...rows.map((r) => r.value))
  const stacked = width < 520
  const labelW = Math.round(Math.min(220, Math.max(112, width * 0.38)))
  const trackW = Math.max(0, stacked ? width : width - labelW - VALUE_COL - 16)
  const bar = (v: number) => (top > 0 ? Math.max(v > 0 ? 2 : 0, (v / top) * trackW) : 0)
  return (
    <ul ref={ref} className={stacked ? 'flex flex-col gap-3' : 'flex flex-col gap-2'}>
      {rows.map((r) => {
        const w = bar(r.value)
        const svg = (
          <svg width={trackW} height={BAR} aria-hidden className="block">
            <rect x={0} y={BAR / 2 - 0.5} width={trackW} height={1} fill="var(--viz-grid)" />
            {w > 0 ? <path d={rightRounded(w, BAR, 4)} fill={color} /> : null}
          </svg>
        )
        const label = (
          <span className="min-w-0 text-[15px] text-fg">
            <span className={stacked ? 'break-words' : 'block truncate'}>
              {r.label}
              {r.sub ? <span className="ml-1.5 text-muted">{r.sub}</span> : null}
            </span>
          </span>
        )
        const value = <span className="text-right text-[15px] font-semibold tabular-nums text-fg">{r.text}</span>
        return stacked ? (
          <li key={r.key} title={`${r.label}: ${r.text}`}>
            <div className="mb-1 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
              {label}
              {value}
            </div>
            {svg}
          </li>
        ) : (
          <li key={r.key} className="grid items-center gap-2" style={{ gridTemplateColumns: `${labelW}px ${trackW}px ${VALUE_COL}px` }} title={`${r.label}: ${r.text}`}>
            {label}
            {svg}
            {value}
          </li>
        )
      })}
    </ul>
  )
}

/** Rettangolo con base piatta a sinistra e punta destra arrotondata. */
export function rightRounded(w: number, h: number, r: number): string {
  const rr = Math.min(r, w, h / 2)
  return `M0 0H${w - rr}A${rr} ${rr} 0 0 1 ${w} ${rr}V${h - rr}A${rr} ${rr} 0 0 1 ${w - rr} ${h}H0Z`
}
