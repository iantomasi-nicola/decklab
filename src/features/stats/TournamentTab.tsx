import { useTranslation } from 'react-i18next'
import type { HandResult, TournamentPlan, TournamentResult } from '@/domain/stats'
import { Segmented } from '@/ui/Segmented'
import { NativeSelect } from '@/features/decks/fields'
import { ChartCard } from './charts/ChartCard'
import { Columns } from './charts/Columns'
import { dec, pct } from './format'
import { Stepper, StatTile, useLang } from './parts'

export type TourMode = 'average' | 'atLeast1' | 'atLeastK' | 'distribution'
export const TOUR_MODES: TourMode[] = ['average', 'atLeast1', 'atLeastK', 'distribution']
export const asTourMode = (s: string): TourMode => (TOUR_MODES.includes(s as TourMode) ? (s as TourMode) : 'average')

export function TournamentTab({
  tour,
  hands,
  rounds,
  plan,
  mode,
  k,
  onRounds,
  onPlan,
  onMode,
  onK,
}: {
  tour: TournamentResult
  hands: Record<number, HandResult>
  rounds: number
  plan: TournamentPlan
  mode: TourMode
  k: number
  onRounds: (n: number) => void
  onPlan: (p: TournamentPlan) => void
  onMode: (m: TourMode) => void
  onK: (n: number) => void
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const kk = mode === 'atLeast1' ? 1 : k
  // si mostra solo la parte della distribuzione che ha probabilità visibile
  let last = tour.pmf.length - 1
  while (last > 1 && (tour.pmf[last] ?? 0) < 1e-4) last--
  const data = tour.pmf.slice(0, last + 1).map((v, j) => ({
    key: j,
    label: String(j),
    value: v,
    color: mode !== 'average' && mode !== 'distribution' && j >= kk ? 'var(--viz-brick)' : undefined,
    title: t('statsLab.tour.tip', { n: j, p: pct(v, lang) }),
  }))
  const p5 = hands[5]?.brick ?? 0
  const p6 = hands[6]?.brick ?? 0
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-lg border border-line bg-surface-1 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg">{t('statsLab.tour.rounds')}</span>
          <Stepper label={t('statsLab.tour.rounds')} value={rounds} min={1} max={200} onChange={onRounds} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-sm font-medium text-fg">{t('statsLab.tour.plan')}</span>
          <Segmented
            label={t('statsLab.tour.plan')}
            value={plan}
            onValueChange={onPlan}
            options={[
              { value: 'first', label: t('statsLab.tour.first') },
              { value: 'second', label: t('statsLab.tour.second') },
              { value: 'mixed', label: t('statsLab.tour.mixed') },
            ]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="tour-mode" className="text-sm font-medium text-fg">
            {t('statsLab.tour.mode')}
          </label>
          <NativeSelect id="tour-mode" value={mode} onChange={(e) => onMode(e.target.value as TourMode)} className="min-w-[200px]">
            {TOUR_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`statsLab.tour.modes.${m}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {mode === 'atLeastK' ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-fg">{t('statsLab.tour.k')}</span>
            <Stepper label={t('statsLab.tour.k')} value={k} min={1} max={Math.max(1, rounds)} onChange={onK} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={t('statsLab.tour.expected')} value={dec(tour.expectedBricks, lang)} hint={t('statsLab.tour.expectedHint', { count: rounds })} emphasis={mode === 'average'} />
        <StatTile label={t('statsLab.tour.none')} value={pct(tour.pNone, lang)} hint={t('statsLab.tour.noneHint')} />
        <StatTile label={t('statsLab.tour.atLeast', { count: 1 })} value={pct(tour.pAtLeast1, lang)} emphasis={mode === 'atLeast1'} />
        <StatTile label={t('statsLab.tour.atLeast', { count: Math.max(2, k) })} value={pct(sumFrom(tour.pmf, Math.max(2, k)), lang)} emphasis={mode === 'atLeastK'} />
      </div>

      <ChartCard
        testId="chart-tournament"
        title={t('statsLab.tour.chartTitle')}
        subtitle={t('statsLab.tour.chartSub', { count: rounds, first: pct(p5, lang), second: pct(p6, lang) })}
        table={{ head: [t('statsLab.tour.bricks'), t('statsLab.col.prob')], rows: tour.pmf.map((v, j) => [j, pct(v, lang, 2)]) }}
      >
        <Columns data={data} format={(v) => pct(v, lang, 0)} ariaLabel={t('statsLab.tour.chartTitle')} />
        {mode === 'atLeast1' || mode === 'atLeastK' ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: 'var(--viz-brick)' }} />
            {t('statsLab.tour.legendFrom', { count: kk, p: pct(sumFrom(tour.pmf, kk), lang) })}
          </p>
        ) : null}
      </ChartCard>
    </div>
  )
}

const sumFrom = (pmf: number[], k: number) => pmf.slice(k).reduce((a, b) => a + b, 0)
