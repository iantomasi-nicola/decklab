import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { HandResult } from '@/domain/stats'
import { ROLE_PRESETS } from '@/domain/stats'
import { ChartCard } from './charts/ChartCard'
import { Columns } from './charts/Columns'
import { HBars } from './charts/HBars'
import { pct } from './format'
import { useLang } from './parts'

export const roleName = (t: TFunction, role: string): string => ((ROLE_PRESETS as readonly string[]).includes(role) ? t(`statsLab.roles.${role}.name`) : role)

export function HandTab({ hand, name }: { hand: HandResult; name: (id: number) => string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const p = (v: number) => pct(v, lang, v < 0.1 ? 1 : 0)
  const odds = [...hand.cardOdds].sort((a, b) => b.p - a.p || b.count - a.count)
  const roles = [...hand.roleOdds].sort((a, b) => b.p - a.p)
  const maxBrick = Math.max(0, ...hand.topBricks.map((b) => b.p))
  const hist = hand.engineHist.map((v, i) => ({ key: i, label: String(i), value: v, title: t('statsLab.hand.histTip', { n: i, p: pct(v, lang) }) }))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard
        testId="chart-engine"
        title={t('statsLab.hand.histTitle')}
        subtitle={t('statsLab.hand.histSub', { count: hand.handSize })}
        table={{ head: [t('statsLab.hand.histCol'), t('statsLab.col.prob')], rows: hand.engineHist.map((v, i) => [i, pct(v, lang)]) }}
      >
        <Columns data={hist} format={(v) => pct(v, lang, 0)} ariaLabel={t('statsLab.hand.histTitle')} />
      </ChartCard>

      <ChartCard
        testId="chart-roles"
        title={t('statsLab.hand.rolesTitle')}
        subtitle={t('statsLab.hand.rolesSub')}
        table={{ head: [t('statsLab.col.role'), t('statsLab.col.copies'), t('statsLab.col.prob')], rows: roles.map((r) => [roleName(t, r.role), r.copies, pct(r.p, lang)]) }}
      >
        {roles.length ? (
          <HBars rows={roles.map((r) => ({ key: r.role, label: roleName(t, r.role), sub: `×${r.copies}`, value: r.p, text: p(r.p) }))} max={1} />
        ) : (
          <p className="text-[15px] text-muted">{t('statsLab.hand.noRoles')}</p>
        )}
      </ChartCard>

      <ChartCard
        testId="chart-odds"
        title={t('statsLab.hand.oddsTitle')}
        subtitle={t('statsLab.hand.oddsSub', { count: hand.handSize })}
        table={{ head: [t('statsLab.col.card'), t('statsLab.col.copies'), t('statsLab.col.prob')], rows: odds.map((o) => [name(o.id), o.count, pct(o.p, lang)]) }}
      >
        <HBars rows={odds.map((o) => ({ key: o.id, label: name(o.id), sub: `×${o.count}`, value: o.p, text: p(o.p) }))} max={1} />
      </ChartCard>

      <ChartCard
        testId="chart-bricks"
        title={t('statsLab.hand.bricksTitle')}
        subtitle={t('statsLab.hand.bricksSub')}
        table={{
          head: [t('statsLab.col.hand'), t('statsLab.col.prob')],
          rows: hand.topBricks.map((b) => [describe(b, name, t), pct(b.p, lang)]),
        }}
      >
        {hand.topBricks.length ? (
          <ol className="flex flex-col gap-3">
            {hand.topBricks.map((b, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
                <span className="min-w-0 text-[15px] text-fg">{describe(b, name, t)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-fg">{pct(b.p, lang)}</span>
                <span aria-hidden className="col-span-2 block h-1 rounded-full bg-surface-3">
                  <span className="block h-full rounded-full" style={{ width: `${maxBrick ? (b.p / maxBrick) * 100 : 0}%`, background: 'var(--viz-brick)' }} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-muted">{t('statsLab.hand.noBricks')}</p>
        )}
      </ChartCard>
    </div>
  )
}

function describe(b: HandResult['topBricks'][number], name: (id: number) => string, t: TFunction): string {
  const parts = b.cards.map((c) => (c.n > 1 ? `${name(c.id)} ×${c.n}` : name(c.id)))
  if (b.fill > 0) parts.push(t('statsLab.hand.fillCards', { count: b.fill }))
  return parts.join(' + ')
}
