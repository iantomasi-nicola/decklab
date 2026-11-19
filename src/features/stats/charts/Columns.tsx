import { useWidth } from './useWidth'

export interface Column {
  key: string | number
  label: string
  value: number
  color?: string
  /** Testo del tooltip nativo. */
  title?: string
}

const M = { top: 20, right: 8, bottom: 28, left: 40 }

/** Ticks "puliti" per un asse 0..max. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = 0; ; v += step) {
    out.push(Number(v.toFixed(10)))
    if (v >= max - step * 0.001) break
  }
  return out
}

/**
 * Grafico a colonne: base piatta, punta arrotondata (4px), larghezza massima 24px, griglia a filo sottile.
 * Le etichette dell'asse x si diradano da sole se non ci stanno; il valore è scritto sopra la sola colonna più alta.
 */
export function Columns({
  data,
  height = 200,
  format,
  color = 'var(--viz-neutral)',
  yMax,
  ariaLabel,
}: {
  data: Column[]
  height?: number
  format: (v: number) => string
  color?: string
  yMax?: number
  ariaLabel: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const innerW = Math.max(0, width - M.left - M.right)
  const innerH = height - M.top - M.bottom
  const maxV = Math.max(...data.map((d) => d.value), 0)
  const ticks = niceTicks((yMax ?? maxV * 1.05) || 1)
  const top = ticks[ticks.length - 1] || 1
  const band = data.length ? innerW / data.length : 0
  const bw = Math.min(24, Math.max(2, band - 2))
  const every = Math.max(1, Math.ceil(26 / Math.max(band, 1)))
  const peak = data.reduce((b, d, i) => (d.value > (data[b]?.value ?? -1) ? i : b), 0)
  const y = (v: number) => M.top + innerH - (v / top) * innerH
  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} />
              <text x={M.left - 8} y={y(t) + 4} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = M.left + band * i + band / 2
            const h = Math.max(d.value > 0 ? 2 : 0, (d.value / top) * innerH)
            const r = Math.min(4, bw / 2, h)
            const x = cx - bw / 2
            const yy = M.top + innerH - h
            return (
              <g key={d.key}>
                <title>{d.title ?? `${d.label}: ${format(d.value)}`}</title>
                {h > 0 ? (
                  <path
                    d={`M${x} ${yy + h}V${yy + r}A${r} ${r} 0 0 1 ${x + r} ${yy}H${x + bw - r}A${r} ${r} 0 0 1 ${x + bw} ${yy + r}V${yy + h}Z`}
                    fill={d.color ?? color}
                  />
                ) : null}
                {i % every === 0 ? (
                  <text x={cx} y={height - 8} textAnchor="middle">
                    {d.label}
                  </text>
                ) : null}
                {i === peak && d.value > 0 ? (
                  <text x={cx} y={Math.max(12, yy - 6)} textAnchor="middle" className="viz-strong">
                    {format(d.value)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  )
}
