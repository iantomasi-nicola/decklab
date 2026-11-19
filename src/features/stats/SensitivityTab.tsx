import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SensitivityItem } from '@/domain/stats'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { ChartCard } from './charts/ChartCard'
import { DivergingBar } from './charts/DivergingRow'
import { Legend } from './charts/SplitBar'
import { signedPts } from './format'
import { Progress, useLang } from './parts'

const FIRST = 10

export function SensitivityTab({ items, running, progress, handSize, name }: { items: SensitivityItem[] | null; running: boolean; progress: number; handSize: number; name: (id: number) => string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [all, setAll] = useState(false)
  if (!items) {
    return (
      <div className="rounded-lg border border-line bg-surface-1 p-4 md:p-6" aria-busy>
        <p className="mb-4 text-[15px] text-muted">{t('statsLab.sens.computing', { pct: progress })}</p>
        <Progress value={progress} active={running} />
        <div className="mt-4 flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }
  const rows = items.filter((i) => !(i.id === 0 && (i.plus === null || i.plus === 0) && (i.minus === null || i.minus === 0)))
  const shown = all ? rows : rows.slice(0, FIRST)
  const max = Math.max(0.1, ...rows.flatMap((r) => [Math.abs(r.minus ?? 0), Math.abs(r.plus ?? 0)]))
  const label = (r: SensitivityItem) => (r.id === 0 ? t('statsLab.sens.filler') : name(r.id))
  const txt = (v: number | null) => (v === null ? '—' : signedPts(v, lang))
  return (
    <ChartCard
      testId="chart-sensitivity"
      title={t('statsLab.sens.title')}
      subtitle={t('statsLab.sens.subtitle', { count: handSize })}
      table={{
        head: [t('statsLab.col.card'), t('statsLab.sens.minus'), t('statsLab.sens.plus')],
        rows: rows.map((r) => [label(r), txt(r.minus), txt(r.plus)]),
      }}
    >
      <div className="mb-4">
        <Legend
          items={[
            { key: 'up', label: t('statsLab.sens.up'), color: 'var(--viz-playable)' },
            { key: 'down', label: t('statsLab.sens.down'), color: 'var(--viz-brick)' },
          ]}
        />
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((r) => (
          <li key={r.id} className="py-3 first:pt-0 last:pb-0">
            <p className="mb-2 flex items-baseline gap-2 text-[15px] font-medium text-fg">
              <span className="min-w-0 truncate">{label(r)}</span>
              {r.id !== 0 ? <span className="shrink-0 text-muted">×{r.count}</span> : null}
            </p>
            <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
              <span className="text-sm text-muted">{t('statsLab.sens.minusShort')}</span>
              <DivergingBar value={r.minus} max={max} text={txt(r.minus)} title={`${label(r)}: ${t('statsLab.sens.minus')} ${txt(r.minus)}`} />
              <span className="text-sm text-muted">{t('statsLab.sens.plusShort')}</span>
              <DivergingBar value={r.plus} max={max} text={txt(r.plus)} title={`${label(r)}: ${t('statsLab.sens.plus')} ${txt(r.plus)}`} />
            </div>
          </li>
        ))}
      </ul>
      {rows.length > FIRST ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setAll((v) => !v)}>
            {all ? t('statsLab.sens.fewer') : t('statsLab.sens.more', { count: rows.length - FIRST })}
          </Button>
        </div>
      ) : null}
      <p className="mt-4 text-sm text-muted">{t('statsLab.sens.note')}</p>
    </ChartCard>
  )
}
