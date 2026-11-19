import { useWidth } from './useWidth'

const BAR = 12
const PAD = 56

/** Una barra divergente attorno allo zero: destra (blu) = giocabile sale, sinistra (arancio) = scende. `max` è il valore assoluto massimo della scala comune. */
export function DivergingBar({ value, max, text, title }: { value: number | null; max: number; text: string; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const half = Math.max(0, width / 2)
  const scale = max > 0 ? Math.max(0, half - PAD) / max : 0
  const len = value === null ? 0 : Math.abs(value) * scale
  const positive = (value ?? 0) >= 0
  const h = BAR
  const r = 4
  return (
    <div ref={ref} className="w-full" title={title}>
      {width > 0 ? (
        <svg width={width} height={h + 4} aria-hidden className="block">
          <line x1={half} x2={half} y1={0} y2={h + 4} stroke="var(--viz-axis)" strokeWidth={1} />
          {value !== null && len > 0.5 ? (
            positive ? (
              <path d={`M${half} 2H${half + Math.max(len, 2) - r}A${r} ${r} 0 0 1 ${half + Math.max(len, 2)} ${2 + r}V${2 + h - r}A${r} ${r} 0 0 1 ${half + Math.max(len, 2) - r} ${2 + h}H${half}Z`} fill="var(--viz-playable)" />
            ) : (
              <path d={`M${half} 2H${half - Math.max(len, 2) + r}A${r} ${r} 0 0 0 ${half - Math.max(len, 2)} ${2 + r}V${2 + h - r}A${r} ${r} 0 0 0 ${half - Math.max(len, 2) + r} ${2 + h}H${half}Z`} fill="var(--viz-brick)" />
            )
          ) : null}
          <text
            x={value === null ? half + 6 : positive ? half + len + 8 : half - len - 8}
            y={h / 2 + 6}
            textAnchor={value === null || positive ? 'start' : 'end'}
            className="viz-strong"
          >
            {text}
          </text>
        </svg>
      ) : (
        <div style={{ height: h + 4 }} />
      )}
    </div>
  )
}
