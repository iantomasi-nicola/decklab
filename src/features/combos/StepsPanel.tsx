import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import ChevronDown from 'lucide-react/icons/chevron-down'
import ChevronUp from 'lucide-react/icons/chevron-up'
import CircleAlert from 'lucide-react/icons/circle-alert'
import Ellipsis from 'lucide-react/icons/ellipsis'
import GitFork from 'lucide-react/icons/git-fork'
import Link2 from 'lucide-react/icons/link-2'
import Link2Off from 'lucide-react/icons/link-2-off'
import Replace from 'lucide-react/icons/replace'
import Trash2 from 'lucide-react/icons/trash-2'
import type { ComboDoc, Step } from '@/domain/combo/types'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { IconButton } from '@/ui/IconButton'
import { Menu, type MenuItem } from '@/ui/Menu'
import { Switch } from '@/ui/Switch'
import { useEditor } from './editorStore'
import { incoherentSteps } from './incoherence'

const PHASES = ['draw', 'standby', 'main1', 'battle', 'main2', 'end'] as const
const textareaCls =
  'min-h-[72px] w-full rounded-md border border-line-strong bg-surface-1 px-3 py-2 text-[15px] text-fg placeholder:text-subtle hover:border-accent-text focus-visible:border-accent-text'

export function describeStep(s: Step, nameOf: (uid: string) => string, t: TFunction): string {
  if (s.action === 'custom') return s.label?.trim() || t('combos.action.custom')
  const base = t(`combos.action.${s.action}`)
  const method = s.method && s.action === 'specialSummon' ? ` (${t(`combos.method.${s.method}`)})` : ''
  if (s.action === 'changeLP') {
    const l = s.lp?.[0]
    return l ? `${base}: ${l.delta > 0 ? '+' : ''}${l.delta} ${t(l.p === 0 ? 'combos.lp.you' : 'combos.lp.opp')}` : base
  }
  return s.card ? `${base}${method}: ${nameOf(s.card)}` : base
}

export function StepsPanel({
  doc,
  cursor,
  nameOf,
  onDerive,
}: {
  doc: ComboDoc
  cursor: number
  nameOf: (uid: string) => string
  onDerive: (index: number, inclusive: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const store = useEditor.getState()
  const bad = useMemo(() => incoherentSteps(doc), [doc])
  const sel = cursor - 1
  const nameOfCode = (uid: string) => nameOf(uid)
  const groupIndex = (i: number) => {
    const g = doc.steps[i]?.group
    if (!g) return null
    const prev = doc.steps[i - 1]?.group === g
    const next = doc.steps[i + 1]?.group === g
    return { first: !prev, last: !next }
  }

  return (
    <div className="flex flex-col gap-3">
      {bad.size > 0 ? (
        <Banner tone="warn" title={t('combos.incoherent.title', { count: bad.size })}>
          {t('combos.incoherent.body')}
        </Banner>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('combos.steps.title', { count: doc.steps.length })}</h2>
        <Button variant="ghost" onClick={() => store.setCursor(0)} disabled={cursor === 0}>
          {t('combos.steps.fromStart')}
        </Button>
      </div>
      {doc.steps.length === 0 ? <p className="rounded-md border border-dashed border-line-strong p-4 text-[15px] text-muted">{t('combos.steps.empty')}</p> : null}
      <ol className="flex flex-col gap-1.5" data-steps>
        {doc.steps.map((s, i) => {
          const g = groupIndex(i)
          const selected = i === sel
          const why = bad.get(i)
          const items: MenuItem[] = [
            { id: 'here', label: t('combos.step.insertAfter'), onSelect: () => store.setCursor(i + 1) },
            {
              id: 'replace',
              label: t('combos.step.replace'),
              icon: <Replace size={18} />,
              onSelect: () => {
                store.edit((d) => ({ doc: { ...d, steps: d.steps.filter((x) => x.id !== s.id) }, cursor: i }))
              },
            },
            { id: 'up', label: t('combos.step.up'), icon: <ChevronUp size={18} />, disabled: i === 0, onSelect: () => store.moveStep(s.id, -1) },
            { id: 'down', label: t('combos.step.down'), icon: <ChevronDown size={18} />, disabled: i === doc.steps.length - 1, onSelect: () => store.moveStep(s.id, 1) },
            {
              id: 'group',
              label: s.group ? t('combos.step.ungroup') : t('combos.step.group'),
              icon: s.group ? <Link2Off size={18} /> : <Link2 size={18} />,
              disabled: !s.group && i === 0,
              onSelect: () => store.toggleGroup(s.id),
            },
            { id: 'derive-incl', label: t('combos.step.deriveIncl'), icon: <GitFork size={18} />, onSelect: () => onDerive(i, true) },
            { id: 'derive-excl', label: t('combos.step.deriveExcl'), icon: <GitFork size={18} />, onSelect: () => onDerive(i, false) },
            { id: 'delete', label: t('combos.step.delete'), icon: <Trash2 size={18} />, danger: true, onSelect: () => store.removeStep(s.id) },
          ]
          return (
            <li
              key={s.id}
              data-step-id={s.id}
              data-step-index={i}
              data-incoherent={why ? '' : undefined}
              className={cn(
                'rounded-md border bg-surface-1',
                selected ? 'border-accent-text' : 'border-line',
                why && 'border-warn/70',
                g && 'border-l-4 border-l-accent-text',
                g && !g.first && 'rounded-t-none',
                g && !g.last && 'rounded-b-none',
              )}
            >
              <div className="flex items-center gap-1 pr-1">
                <button
                  type="button"
                  onClick={() => store.setCursor(i + 1)}
                  aria-current={selected ? 'step' : undefined}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-3 text-sm font-semibold tabular-nums text-fg">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-fg">{describeStep(s, nameOfCode, t)}</span>
                    {(s.note?.[i18n.language === 'it' ? 'it' : 'en'] ?? s.note?.it ?? s.note?.en) ? (
                      <span className="block truncate text-sm text-muted">{s.note?.[i18n.language === 'it' ? 'it' : 'en'] ?? s.note?.it ?? s.note?.en}</span>
                    ) : null}
                  </span>
                  {s.group ? <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text">{t('combos.step.freeOrder')}</span> : null}
                  {why ? (
                    <span className="shrink-0 text-warn" title={t('combos.incoherent.step')}>
                      <CircleAlert size={18} aria-label={t('combos.incoherent.step')} />
                    </span>
                  ) : null}
                </button>
                <Menu
                  trigger={<IconButton label={t('combos.step.menu', { n: i + 1 })} icon={<Ellipsis size={20} />} data-testid={`step-menu-${i}`} />}
                  items={items}
                />
              </div>
              {selected ? <StepEditor step={s} /> : null}
            </li>
          )
        })}
      </ol>
      {cursor < doc.steps.length ? (
        <p role="status" className="text-sm text-muted">
          {t('combos.steps.insertHint', { n: cursor + 1 })}{' '}
          <button type="button" className="cursor-pointer text-accent-text underline" onClick={() => useEditor.getState().setCursor(doc.steps.length)}>
            {t('combos.steps.toEnd')}
          </button>
        </p>
      ) : null}
    </div>
  )
}

function StepEditor({ step }: { step: Step }) {
  const { t } = useTranslation()
  const store = useEditor.getState()
  const note = (lang: 'it' | 'en', value: string) => {
    const next = { ...step.note, [lang]: value }
    if (!value) delete next[lang]
    store.patchStep(step.id, { note: next })
  }
  return (
    <div className="flex flex-col gap-3 border-t border-line px-3 pb-3 pt-3" data-step-editor>
      {step.action === 'custom' ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('combos.step.label')}
          <input
            className="min-h-11 w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] font-normal text-fg"
            value={step.label ?? ''}
            onChange={(e) => store.patchStep(step.id, { label: e.target.value })}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('combos.step.noteIt')}
        <textarea className={textareaCls} value={step.note?.it ?? ''} onChange={(e) => note('it', e.target.value)} data-testid="note-it" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('combos.step.noteEn')}
        <textarea className={textareaCls} value={step.note?.en ?? ''} onChange={(e) => note('en', e.target.value)} data-testid="note-en" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t('combos.step.phase')}
        <select
          className="min-h-11 w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] font-normal text-fg"
          value={step.phase ?? ''}
          onChange={(e) => {
            const v = e.target.value
            const { phase: _p, ...rest } = step
            void _p
            store.edit((d) => ({
              doc: { ...d, steps: d.steps.map((x) => (x.id === step.id ? (v ? { ...rest, phase: v as Step['phase'] } : rest) : x)) },
            }))
          }}
        >
          <option value="">{t('combos.step.phaseNone')}</option>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {t(`combos.phase.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <Switch label={t('combos.step.optional')} checked={!!step.optional} onCheckedChange={(v) => store.patchStep(step.id, { optional: v })} />
    </div>
  )
}
