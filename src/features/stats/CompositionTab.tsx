import { useTranslation } from 'react-i18next'
import { ATTRIBUTE_KEYS, type Composition } from '@/domain/stats'
import { ChartCard } from './charts/ChartCard'
import { Columns } from './charts/Columns'
import { HBars } from './charts/HBars'
import { Legend, SplitBar } from './charts/SplitBar'
import { roleName } from './HandTab'
import { pct } from './format'
import { useLang } from './parts'

export function CompositionTab({ comp, sideMatchup }: { comp: Composition; sideMatchup: string | null }) {
  const { t } = useTranslation()
  const lang = useLang()
  const total = comp.total || 1
  const kinds = [
    { key: 'monster', color: 'var(--viz-cat-1)', value: comp.kinds.monster },
    { key: 'spell', color: 'var(--viz-cat-2)', value: comp.kinds.spell },
    { key: 'trap', color: 'var(--viz-cat-3)', value: comp.kinds.trap },
  ]
  const sub: { key: string; label: string; value: number }[] = [
    ...Object.entries(comp.monsterKinds).map(([k, v]) => ({ key: `m-${k}`, label: t(`statsLab.comp.sub.monster.${k}`), value: v ?? 0 })),
    ...Object.entries(comp.spellKinds).map(([k, v]) => ({ key: `s-${k}`, label: t(`statsLab.comp.sub.spell.${k}`), value: v ?? 0 })),
    ...Object.entries(comp.trapKinds).map(([k, v]) => ({ key: `t-${k}`, label: t(`statsLab.comp.sub.trap.${k}`), value: v ?? 0 })),
  ].filter((r) => r.value > 0)
  const attrs = ATTRIBUTE_KEYS.map((k) => ({ key: k, label: t(`statsLab.comp.attr.${k}`), value: comp.attributes[k] ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const levelKeys = Object.keys(comp.levels).map(Number).sort((a, b) => a - b)
  const lv = levelKeys.length ? Array.from({ length: levelKeys[levelKeys.length - 1]! - levelKeys[0]! + 1 }, (_, i) => levelKeys[0]! + i) : []
  const roles = Object.entries(comp.roles).sort((a, b) => b[1] - a[1])
  const n = (v: number) => String(v)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sideMatchup ? (
        <p data-testid="comp-after-side" className="rounded-md border border-accent-text bg-surface-1 px-4 py-3 text-[15px] text-fg lg:col-span-2">
          {t('statsLab.side.compNote', { matchup: sideMatchup })}
        </p>
      ) : null}
      <ChartCard
        testId="chart-kinds"
        title={t('statsLab.comp.kinds')}
        subtitle={t('statsLab.comp.kindsSub', { count: comp.total })}
        table={{ head: [t('statsLab.col.kind'), t('statsLab.col.copies'), t('statsLab.col.share')], rows: kinds.map((k) => [t(`statsLab.comp.kind.${k.key}`), k.value, pct(k.value / total, lang)]) }}
      >
        <SplitBar
          ariaLabel={t('statsLab.comp.kinds')}
          parts={kinds.map((k) => ({ key: k.key, label: t(`statsLab.comp.kind.${k.key}`), value: k.value, color: k.color, text: n(k.value) }))}
        />
        <div className="mt-3">
          <Legend items={kinds.map((k) => ({ key: k.key, label: t(`statsLab.comp.kind.${k.key}`), color: k.color, value: n(k.value) }))} />
        </div>
        <div className="mt-6">
          <HBars rows={sub.map((r) => ({ key: r.key, label: r.label, value: r.value, text: n(r.value) }))} />
        </div>
      </ChartCard>

      <ChartCard
        testId="chart-attributes"
        title={t('statsLab.comp.attributes')}
        subtitle={t('statsLab.comp.attributesSub')}
        table={{ head: [t('statsLab.col.attribute'), t('statsLab.col.copies')], rows: attrs.map((a) => [a.label, a.value]) }}
      >
        {attrs.length ? <HBars rows={attrs.map((a) => ({ key: a.key, label: a.label, value: a.value, text: n(a.value) }))} /> : <p className="text-[15px] text-muted">{t('statsLab.comp.none')}</p>}
      </ChartCard>

      <ChartCard
        testId="chart-levels"
        title={t('statsLab.comp.levels')}
        subtitle={t('statsLab.comp.levelsSub')}
        table={{ head: [t('statsLab.col.level'), t('statsLab.col.copies')], rows: lv.map((l) => [l, comp.levels[l] ?? 0]) }}
      >
        {lv.length ? (
          <Columns data={lv.map((l) => ({ key: l, label: String(l), value: comp.levels[l] ?? 0 }))} format={n} ariaLabel={t('statsLab.comp.levels')} />
        ) : (
          <p className="text-[15px] text-muted">{t('statsLab.comp.none')}</p>
        )}
      </ChartCard>

      <ChartCard
        testId="chart-comp-roles"
        title={t('statsLab.comp.roles')}
        subtitle={t('statsLab.comp.rolesSub')}
        table={{ head: [t('statsLab.col.role'), t('statsLab.col.copies')], rows: [...roles.map(([r, c]) => [roleName(t, r), c]), [t('statsLab.comp.untagged'), comp.untagged]] }}
      >
        <HBars rows={[...roles.map(([r, c]) => ({ key: r, label: roleName(t, r), value: c, text: n(c) })), { key: '_', label: t('statsLab.comp.untagged'), value: comp.untagged, text: n(comp.untagged) }]} max={comp.total || 1} />
      </ChartCard>
    </div>
  )
}
