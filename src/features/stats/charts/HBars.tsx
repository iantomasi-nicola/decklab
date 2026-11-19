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

/** Elenco di barre orizzontali: etichetta, barra con angolo arrotondato solo sulla punta (base piatta), valore in colonna allineata. */
export function HBars({ rows, max, color = 'var(--viz-neutral)' }: { rows: HBarRow[]; max?: number; color?: string }) {
  const [ref, width] = useWidth<HTMLUListElement>()
  const top = max ?? Math.max(0, ...rows.map((r) => r.value))
  const labelW = Math.round(Math.min(220, Math.max(112, width * 0.38)))
  const trackW = Math.max(0, width - labelW - VALUE_COL - 16)
  return (
    <ul ref={ref} className="flex flex-col gap-2">
      {rows.map((r) => {
        const w = top > 0 ? Math.max(r.value > 0 ? 2 : 0, (r.value / top) * trackW) : 0
        return (
          <li key={r.key} className="grid items-center gap-2" style={{ gridTemplateColumns: `${labelW}px ${trackW}px ${VALUE_COL}px` }} title={`${r.label}: ${r.text}`}>
            <span className="min-w-0 truncate text-[15px] text-fg">
              {r.label}
              {r.sub ? <span className="ml-1.5 text-muted">{r.sub}</span> : null}
            </span>
            <svg width={trackW} height={BAR} aria-hidden className="block">
              <rect x={0} y={BAR / 2 - 0.5} width={trackW} height={1} fill="var(--viz-grid)" />
              {w > 0 ? <path d={rightRounded(w, BAR, 4)} fill={color} /> : null}
            </svg>
            <span className="text-right text-[15px] font-semibold tabular-nums text-fg">{r.text}</span>
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
