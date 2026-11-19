import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Wand from 'lucide-react/icons/wand-sparkles'
import {
  collectRules,
  collectUnknownPairs,
  effectiveLabelFrom,
  isC2,
  labelKey,
  labelsFromCombos,
  labelTargets,
  mergeCards,
  type HandInput,
  type Label,
  type LabelState,
} from '@/domain/stats'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import { cn } from '@/ui/cn'
import { toast } from '@/ui/Toast'
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
  const { trios, derived, unknown, c2, fromCombos, unknownOpen } = useMemo(() => {
    const noLabels = { ...input, labels: {} }
    const targets = labelTargets(noLabels)
    return {
      ...targets,
      derived: collectRules(noLabels, 6, false),
      unknown: collectUnknownPairs(noLabels, 6, false),
      c2: mergeCards(input.cards).filter(isC2),
      fromCombos: labelsFromCombos(input),
      unknownOpen: [...collectUnknownPairs(input, 6, true).values()],
    }
  }, [input])

  const setLabel = (ids: number[], choice: Choice) =>
    update((s) => {
      const labels = { ...s.labels }
      const key = labelKey(ids)
      if (choice === 'auto') delete labels[key]
      else labels[key] = choice
      return { ...s, labels }
    })

  const state = (ids: number[]): { key: string; explicit: Label | undefined; auto: LabelState; effective: LabelState } => {
    const key = labelKey(ids)
    const explicit = saved.labels[key]
    const auto = effectiveLabelFrom(derived, {}, ids, unknown)
    return { key, explicit, auto, effective: explicit ?? auto }
  }
  const text = (l: LabelState) => (l === 'PLAYABLE' ? t('statsLab.playable') : l === 'BRICK' ? t('statsLab.brick') : t('statsLab.unknown'))

  /** Operazione in blocco con "Annulla". */
  const bulk = (fn: (labels: Record<string, Label>) => Record<string, Label>, message: string) => {
    const before = saved.labels
    update((s) => ({ ...s, labels: fn(s.labels) }))
    toast(message, { action: { label: t('common.undo'), onClick: () => update((s) => ({ ...s, labels: before })) } })
  }
  const markAll = (label: Label) =>
    bulk((l) => {
      const next = { ...l }
      for (const p of unknownOpen) next[labelKey(p)] = label
      return next
    }, t('statsLab.labels.bulkDone', { count: unknownOpen.length }))
  const derive = () =>
    bulk((l) => ({ ...l, ...fromCombos }), t('statsLab.labels.deriveDone', { count: Object.keys(fromCombos).length }))

  const trioRows = trios.map((ids) => ({ ids, ...state(ids) }))
  const changedTrios = trioRows.filter((r) => r.explicit && r.explicit !== r.auto)
  const listed = (onlyChanged ? changedTrios : trioRows).slice(0, limit)
  const total = (onlyChanged ? changedTrios : trioRows).length

  const renderRow = (r: { ids: number[]; key: string; explicit: Label | undefined; effective: LabelState }) => (
    <li key={r.key} className="grid gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
      <p className="min-w-0 break-words text-[15px] font-medium text-fg">{r.ids.map(name).join(' + ')}</p>
      <div className="flex items-center gap-2 lg:justify-end">
        <LabelBadge label={r.effective} text={text(r.effective)} />
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

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('statsLab.labels.title')} hint={t('statsLab.labels.hint')}>
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-4 md:p-6">
          <Switch
            checked={saved.useCombos}
            onCheckedChange={(v) => update((s) => ({ ...s, useCombos: v }))}
            label={t('statsLab.labels.useCombos')}
            description={t('statsLab.labels.useCombosHint')}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Button variant="secondary" icon={<Wand size={18} />} onClick={derive} disabled={!Object.keys(fromCombos).length} data-testid="derive-combos">
              {t('statsLab.labels.derive')}
            </Button>
            <p className="min-w-0 flex-1 basis-56 text-sm text-muted">{t('statsLab.labels.deriveHint', { count: Object.keys(fromCombos).length })}</p>
          </div>
        </div>
      </Section>

      <Section title={t('statsLab.matrix.title', { count: c2.length })} hint={c2.length >= 2 ? t('statsLab.matrix.hint') : undefined}>
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4 md:p-6">
          {c2.length < 2 ? (
            <p className="text-[15px] text-muted">{t('statsLab.labels.noPairs')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" disabled={!unknownOpen.length} onClick={() => markAll('PLAYABLE')} data-testid="all-playable">
                  {t('statsLab.matrix.allPlayable', { count: unknownOpen.length })}
                </Button>
                <Button variant="secondary" disabled={!unknownOpen.length} onClick={() => markAll('BRICK')} data-testid="all-brick">
                  {t('statsLab.matrix.allBrick', { count: unknownOpen.length })}
                </Button>
              </div>
              <Matrix
                cards={c2.map((c) => ({ id: c.id, count: c.count }))}
                name={name}
                state={(a, b) => state([a, b])}
                onTap={(a, b) => {
                  const cur = saved.labels[labelKey([a, b])]
                  setLabel([a, b], cur === undefined ? 'PLAYABLE' : cur === 'PLAYABLE' ? 'BRICK' : 'auto')
                }}
                text={text}
              />
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                {(['PLAYABLE', 'BRICK', 'UNKNOWN'] as const).map((l) => (
                  <li key={l}>
                    <LabelBadge label={l} text={text(l)} />
                  </li>
                ))}
                <li className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-5 rounded-full border-2 border-fg" />
                  {t('statsLab.matrix.manual')}
                </li>
              </ul>
              <p className="text-sm text-muted">{t('statsLab.matrix.groupsHint')}</p>
            </>
          )}
        </div>
      </Section>

      <Section title={t('statsLab.labels.trios', { count: trioRows.length })} hint={t('statsLab.labels.triosHint')}>
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

/**
 * Matrice di compatibilità delle carte C2: ogni cella è una coppia (triangolo inferiore, diagonale = la carta con sé stessa se ha 2+ copie).
 * Un tocco cambia lo stato: automatico → giocabile → brick → automatico. Scorre in orizzontale con la colonna dei nomi fissa.
 */
function Matrix({
  cards,
  name,
  state,
  onTap,
  text,
}: {
  cards: { id: number; count: number }[]
  name: (id: number) => string
  state: (a: number, b: number) => { explicit: Label | undefined; effective: LabelState }
  onTap: (a: number, b: number) => void
  text: (l: LabelState) => string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const update = useCallback(() => {
    const el = ref.current
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])
  useEffect(() => {
    update()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update, cards.length])
  return (
    <div className="relative">
    <div ref={ref} onScroll={update} className="max-w-full overflow-x-auto rounded-md border border-line" data-testid="c2-matrix" tabIndex={0} role="region" aria-label={t('statsLab.matrix.region')}>
      <table className="border-separate border-spacing-0 text-[15px]">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] md:w-40 md:min-w-40 md:max-w-40 border-b border-r border-line bg-surface-2 px-3 py-2 text-left text-sm font-medium text-muted">
              {t('statsLab.col.card')}
            </th>
            {cards.map((c, j) => (
              <th key={c.id} scope="col" title={name(c.id)} className="h-11 w-11 min-w-11 border-b border-line bg-surface-2 text-center text-sm font-semibold tabular-nums text-muted">
                {j + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((a, i) => (
            <tr key={a.id}>
              <th scope="row" className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] md:w-40 md:min-w-40 md:max-w-40 border-b border-r border-line bg-surface-2 px-3 py-1 text-left font-medium text-fg">
                <span className="flex items-baseline gap-2">
                  <span className="shrink-0 text-sm tabular-nums text-muted">{i + 1}</span>
                  <span className="line-clamp-2 break-words text-[14px] leading-tight">{name(a.id)}</span>
                </span>
              </th>
              {cards.map((b, j) => {
                if (j > i) return <td key={b.id} className="border-b border-line bg-surface-2/40" />
                if (i === j && a.count < 2)
                  return (
                    <td key={b.id} className="border-b border-line text-center text-subtle" aria-hidden>
                      –
                    </td>
                  )
                const st = state(a.id, b.id)
                const label = `${name(a.id)} + ${name(b.id)}: ${text(st.effective)}${st.explicit ? '' : ` (${t('statsLab.labels.auto')})`}`
                return (
                  <td key={b.id} className="border-b border-line p-0 text-center">
                    <button
                      type="button"
                      aria-label={label}
                      title={label}
                      data-state={st.effective}
                      data-manual={st.explicit ? 'true' : 'false'}
                      onClick={() => onTap(a.id, b.id)}
                      className="inline-flex size-11 cursor-pointer items-center justify-center"
                    >
                      <span className={cn('inline-flex size-7 items-center justify-center rounded-full', st.explicit && 'ring-2 ring-fg ring-offset-2 ring-offset-surface-1')}>
                        <LabelBadgeIcon label={st.effective} />
                      </span>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      <span
        aria-hidden
        data-testid="matrix-more"
        className={cn('pointer-events-none absolute inset-y-px right-px w-10 rounded-r-md transition-opacity duration-150', more ? 'opacity-100' : 'opacity-0')}
        style={{ background: 'linear-gradient(to left, var(--surface-1) 20%, transparent)' }}
      />
    </div>
  )
}

function LabelBadgeIcon({ label }: { label: LabelState }) {
  const bg = label === 'PLAYABLE' ? 'var(--viz-playable)' : label === 'BRICK' ? 'var(--viz-brick)' : 'var(--viz-unknown)'
  return (
    <span aria-hidden className={cn('inline-flex size-7 items-center justify-center rounded-full text-[14px] font-bold leading-none', label === 'UNKNOWN' && 'viz-hatch')} style={{ background: bg, color: 'var(--viz-on)' }}>
      {label === 'PLAYABLE' ? '✓' : label === 'BRICK' ? '✕' : '?'}
    </span>
  )
}
