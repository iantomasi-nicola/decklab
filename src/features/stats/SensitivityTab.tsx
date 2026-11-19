import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SensitivityItem } from '@/domain/stats'
import type { SensitivityState } from './useStatsModel'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Skeleton'
import { ChartCard } from './charts/ChartCard'
import { DivergingBar } from './charts/DivergingRow'
import { Legend } from './charts/SplitBar'
import { signedPts } from './format'
import { Progress, useLang } from './parts'

const FIRST = 10

export function SensitivityTab({ state, handSize, name }: { state: SensitivityState; handSize: number; name: (id: number) => string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [all, setAll] = useState(false)
  const { items, running, progress, cancelled, error } = state
  if (error) return <Banner tone="danger" title={t('statsLab.error')}>{error}</Banner>
  if (!items.length) {
    return (
      <div className="rounded-lg border border-line bg-surface-1 p-4 md:p-6" aria-busy={running}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] text-muted" aria-live="polite">
            {t('statsLab.sens.computing', { pct: progress })}
          </p>
          {running ? (
            <Button variant="secondary" onClick={state.cancel}>
              {t('statsLab.sens.cancel')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={state.restart}>
              {t('statsLab.sens.resume')}
            </Button>
          )}
        </div>
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
      {running || cancelled ? (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3" data-testid="sens-progress">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-muted" aria-live="polite">
              {cancelled ? t('statsLab.sens.cancelled', { count: rows.length }) : t('statsLab.sens.partial', { pct: progress })}
            </p>
            {running ? (
              <Button variant="secondary" onClick={state.cancel}>
                {t('statsLab.sens.cancel')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={state.restart}>
                {t('statsLab.sens.resume')}
              </Button>
            )}
          </div>
          <Progress value={progress} active={running} />
        </div>
      ) : null}
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
