import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { collectRules, effectiveLabelFrom, labelKey, labelTargets, type HandInput, type Label } from '@/domain/stats'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import type { SavedStats } from './statsStore'
import { LabelBadge, Section } from './parts'

type Choice = 'auto' | Label
const PAGE = 30

export function LabelsTab({
  input,
  saved,
  update,
  name,
}: {
  input: HandInput
  saved: SavedStats
  update: (fn: (s: SavedStats) => SavedStats) => void
  name: (id: number) => string
}) {
  const { t } = useTranslation()
  const [onlyChanged, setOnlyChanged] = useState(true)
  const [limit, setLimit] = useState(PAGE)
  const { pairs, trios, derived } = useMemo(() => {
    const targets = labelTargets({ ...input, labels: {} })
    return { ...targets, derived: collectRules({ ...input, labels: {} }, 6, false) }
  }, [input])

  const setLabel = (ids: number[], choice: Choice) =>
    update((s) => {
      const labels = { ...s.labels }
      const key = labelKey(ids)
      if (choice === 'auto') delete labels[key]
      else labels[key] = choice
      return { ...s, labels }
    })

  const row = (ids: number[]) => {
    const key = labelKey(ids)
    const explicit = saved.labels[key]
    const auto = effectiveLabelFrom(derived, {}, ids)
    const effective = explicit ?? auto
    return { ids, key, explicit, auto, effective }
  }
  const pairRows = pairs.map(row)
  const trioRows = trios.map(row)
  const changedTrios = trioRows.filter((r) => r.explicit && r.explicit !== r.auto)
  const listed = (onlyChanged ? changedTrios : trioRows).slice(0, limit)
  const total = (onlyChanged ? changedTrios : trioRows).length
  const label = (l: Label) => (l === 'PLAYABLE' ? t('statsLab.playable') : t('statsLab.brick'))

  const renderRow = (r: ReturnType<typeof row>) => (
    <li key={r.key} className="grid gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
      <p className="min-w-0 break-words text-[15px] font-medium text-fg">{r.ids.map(name).join(' + ')}</p>
      <div className="flex items-center gap-2 lg:justify-end">
        <LabelBadge label={r.effective} text={label(r.effective)} />
        {!r.explicit ? <span className="text-sm text-muted">{t('statsLab.labels.auto')}</span> : null}
      </div>
      <Segmented<Choice>
        label={t('statsLab.labels.set', { names: r.ids.map(name).join(' + ') })}
        value={r.explicit ?? 'auto'}
        onValueChange={(c) => setLabel(r.ids, c)}
        options={[
          { value: 'auto', label: t('statsLab.labels.choiceAuto') },
          { value: 'PLAYABLE', label: t('statsLab.playable') },
          { value: 'BRICK', label: t('statsLab.brick') },
        ]}
      />
    </li>
  )

  const hasC2 = pairs.length > 0
  return (
    <div className="flex flex-col gap-6">
      <Section title={t('statsLab.labels.title')} hint={t('statsLab.labels.hint')}>
        <div className="rounded-lg border border-line bg-surface-1 p-4 md:p-6">
          <Switch
            checked={saved.useCombos}
            onCheckedChange={(v) => update((s) => ({ ...s, useCombos: v }))}
            label={t('statsLab.labels.useCombos')}
            description={t('statsLab.labels.useCombosHint')}
          />
        </div>
      </Section>

      <Section title={t('statsLab.labels.pairs', { count: pairRows.length })} hint={hasC2 ? t('statsLab.labels.pairsHint') : undefined}>
        <div className="rounded-lg border border-line bg-surface-1 p-4 md:p-6">
          {hasC2 ? (
            <ul className="flex flex-col divide-y divide-line" data-testid="pairs-list">
              {pairRows.map(renderRow)}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">{t('statsLab.labels.noPairs')}</p>
          )}
        </div>
      </Section>

      <Section
        title={t('statsLab.labels.trios', { count: trioRows.length })}
        hint={t('statsLab.labels.triosHint')}
      >
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4 md:p-6">
          <Switch checked={onlyChanged} onCheckedChange={(v) => { setOnlyChanged(v); setLimit(PAGE) }} label={t('statsLab.labels.onlyChanged')} description={t('statsLab.labels.changedCount', { count: changedTrios.length })} />
          {trioRows.length === 0 ? (
            <p className="text-[15px] text-muted">{t('statsLab.labels.noTrios')}</p>
          ) : listed.length ? (
            <ul className="flex flex-col divide-y divide-line" data-testid="trios-list">
              {listed.map(renderRow)}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">{t('statsLab.labels.noChanged')}</p>
          )}
          {total > limit ? (
            <div>
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                {t('statsLab.labels.more', { count: Math.min(PAGE, total - limit) })}
              </Button>
            </div>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
