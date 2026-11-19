import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import ChevronDown from 'lucide-react/icons/chevron-down'
import ChevronRight from 'lucide-react/icons/chevron-right'
import ChevronUp from 'lucide-react/icons/chevron-up'
import Search from 'lucide-react/icons/search'
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
import { Select } from '@/ui/Select'
import { Switch } from '@/ui/Switch'
import { useEditor } from './editorStore'
import { incoherentSteps } from './incoherence'
import { pickText, withNoteLang, withText } from './model'
import { TurnBar, TurnStatus } from '@/features/turn'
import type { Phase, TurnState } from '@/domain/combo/turn'
import { EffectBadge, GameIcon, iconForAction } from '@/ui/gameIcons'
import Ban from 'lucide-react/icons/ban'

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

/** Blocchi comprimibili: catene (stesso `chain.id`) e gruppi "ordine libero" (stesso `group`), sempre contigui. */
type Segment =
  | { kind: 'step'; i: number }
  | { kind: 'chain' | 'group'; key: string; indices: number[] }

function segmentsOf(steps: Step[]): Segment[] {
  const out: Segment[] = []
  let i = 0
  while (i < steps.length) {
    const s = steps[i]!
    const key = s.chain ? `chain:${s.chain.id}` : s.group ? `group:${s.group}` : null
    if (!key) {
      out.push({ kind: 'step', i: i++ })
      continue
    }
    const indices = [i]
    while (steps[i + 1] && (steps[i + 1]!.chain ? `chain:${steps[i + 1]!.chain!.id}` : steps[i + 1]!.group ? `group:${steps[i + 1]!.group}` : null) === key) indices.push(++i)
    i++
    out.push(indices.length > 1 ? { kind: key.startsWith('chain') ? 'chain' : 'group', key, indices } : { kind: 'step', i: indices[0]! })
  }
  return out
}

const noteOf = (s: Step, lang: string, order: readonly string[]) => pickText(s.note, lang, order)

export interface StepMark {
  kind: 'coherence' | 'banlist'
  severity: 'error' | 'warning'
  text: string
}

const EFFECT_BADGES = new Set(['ignition', 'quick', 'trigger', 'continuous', 'activation'])

interface RowProps {
  marks: StepMark[] | undefined
  s: Step
  i: number
  total: number
  selected: boolean
  why: string[] | undefined
  match: boolean
  inBlock: boolean
  label: string
  note: string
  onDerive: (index: number, inclusive: boolean) => void
}

/** Riga di un passo. Memorizzata: con 100 passi cambia solo ciò che cambia davvero. `content-visibility` salta il rendering fuori schermo. */
const StepRow = memo(function StepRow({ s, i, total, selected, why, match, inBlock, label, note, onDerive, marks }: RowProps) {
  const { t } = useTranslation()
  const store = useEditor.getState()
  const items: MenuItem[] = [
    { id: 'here', label: t('combos.step.insertAfter'), onSelect: () => store.setCursor(i + 1) },
    {
      id: 'replace',
      label: t('combos.step.replace'),
      icon: <Replace size={18} />,
      onSelect: () => store.edit((d) => ({ doc: { ...d, steps: d.steps.filter((x) => x.id !== s.id) }, cursor: i })),
    },
    { id: 'up', label: t('combos.step.up'), icon: <ChevronUp size={18} />, disabled: i === 0, onSelect: () => store.moveStep(s.id, -1) },
    { id: 'down', label: t('combos.step.down'), icon: <ChevronDown size={18} />, disabled: i === total - 1, onSelect: () => store.moveStep(s.id, 1) },
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
      data-step-id={s.id}
      data-step-index={i}
      data-incoherent={why || marks?.some((m) => m.kind === 'coherence') ? '' : undefined}
      data-match={match || undefined}
      style={selected ? { scrollMarginTop: 112, scrollMarginBottom: 16 } : { contentVisibility: 'auto', containIntrinsicSize: 'auto 56px', scrollMarginTop: 112, scrollMarginBottom: 16 }}
      className={cn(
        'rounded-md border bg-surface-1',
        selected ? 'border-accent-text' : 'border-line',
        why && 'border-warn/70',
        match && !selected && 'ring-2 ring-accent-text/50',
        inBlock && 'rounded-l-none',
      )}
    >
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => store.setCursor(i + 1)}
          aria-current={selected ? 'step' : undefined}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left"
        >
          <span className="grid h-7 min-w-8 shrink-0 place-items-center rounded-full bg-surface-3 px-1.5 text-sm font-semibold tabular-nums text-fg">{i + 1}</span>
          <span aria-hidden className="shrink-0 text-muted">
            <GameIcon name={iconForAction(s.action, s.method) ?? 'check'} size={20} label={false} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-fg">{label}</span>
            {note ? <span className="block truncate text-sm text-muted">{note}</span> : null}
          </span>
          {s.effect && EFFECT_BADGES.has(s.effect.kind) ? (
            <EffectBadge kind={s.effect.kind as 'ignition'} {...(s.effect.index ? { index: s.effect.index } : {})} size="sm" />
          ) : null}
          {why ? (
            <span className="shrink-0 text-warn" title={t('combos.incoherent.step')}>
              <CircleAlert size={18} aria-label={t('combos.incoherent.step')} />
            </span>
          ) : null}
          {marks?.map((m, k) => (
            <span key={k} className={cn('shrink-0', m.severity === 'error' ? 'text-danger' : 'text-warn')} title={m.text} data-mark={m.kind}>
              {m.kind === 'banlist' ? <Ban size={18} aria-label={m.text} /> : <CircleAlert size={18} aria-label={m.text} />}
            </span>
          ))}
        </button>
        <Menu trigger={<IconButton label={t('combos.step.menu', { n: i + 1 })} icon={<Ellipsis size={20} />} data-testid={`step-menu-${i}`} />} items={items} />
      </div>
      {selected ? <StepEditor step={s} /> : null}
    </li>
  )
})

export function StepsPanel({
  doc,
  cursor,
  nameOf,
  onDerive,
  marks,
  turn,
  optTotal,
  onPhaseChange,
  checkBanner,
}: {
  doc: ComboDoc
  cursor: number
  nameOf: (uid: string) => string
  onDerive: (index: number, inclusive: boolean) => void
  marks?: ReadonlyMap<string, StepMark[]>
  turn?: TurnState | undefined
  optTotal?: number
  onPhaseChange?: (to: Phase) => void
  /** risultato di "Controlla": numero di problemi (null = controllo spento) */
  checkBanner?: { count: number; onClose: () => void } | null
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const store = useEditor.getState()
  const bad = useMemo(() => incoherentSteps(doc), [doc])
  const sel = cursor - 1
  const segments = useMemo(() => segmentsOf(doc.steps), [doc.steps])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [query, setQuery] = useState('')
  const [matchPos, setMatchPos] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)

  // testo di ogni passo (per la ricerca e le righe): calcolato una volta per documento
  const labels = useMemo(() => doc.steps.map((s) => describeStep(s, nameOf, t)), [doc.steps, nameOf, t])
  const notes = useMemo(() => doc.steps.map((s) => noteOf(s, lang, doc.meta.noteLang)), [doc.steps, doc.meta.noteLang, lang])

  // ricerca: numero = salto a quel passo; testo = passi che contengono le parole (azione, carta, nota)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as number[]
    if (/^\d+$/.test(q)) {
      const n = Number(q)
      return n >= 1 && n <= doc.steps.length ? [n - 1] : []
    }
    return doc.steps.flatMap((s, i) => ((labels[i] + ' ' + notes[i] + ' ' + (s.note?.it ?? '') + ' ' + (s.note?.en ?? '')).toLowerCase().includes(q) ? [i] : []))
  }, [query, doc.steps, labels, notes])
  const matchSet = useMemo(() => new Set(matches), [matches])

  const jump = (i: number) => {
    store.setCursor(i + 1)
    // apri i blocchi che lo contengono
    const seg = segments.find((sg) => sg.kind !== 'step' && sg.indices.includes(i))
    if (seg && seg.kind !== 'step') setCollapsed((c) => (c.has(seg.key) ? new Set([...c].filter((k) => k !== seg.key)) : c))
  }
  const step = (d: 1 | -1) => {
    if (!matches.length) return
    const n = (matchPos + d + matches.length) % matches.length
    setMatchPos(n)
    jump(matches[n]!)
  }

  // scorrimento automatico al passo corrente
  useEffect(() => {
    if (sel < 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-step-index="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel, collapsed, doc.steps.length])

  const toggle = (key: string) => setCollapsed((c) => (c.has(key) ? new Set([...c].filter((k) => k !== key)) : new Set([...c, key])))

  const row = (i: number, inBlock: boolean) => (
    <StepRow
      key={doc.steps[i]!.id}
      s={doc.steps[i]!}
      i={i}
      total={doc.steps.length}
      selected={i === sel}
      why={bad.get(i)}
      match={matchSet.has(i) && !!query.trim()}
      inBlock={inBlock}
      label={labels[i]!}
      note={notes[i]!}
      onDerive={onDerive}
      marks={marks?.get(doc.steps[i]!.id)}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      {turn ? (
        <div className="flex flex-col gap-2" data-turn-ui>
          <TurnBar phase={turn.phase} transitions={turn.phaseTransitions} turn={turn.turn} {...(onPhaseChange ? { onPhaseChange: (to: Phase) => onPhaseChange(to) } : {})} />
          <TurnStatus turn={turn} optTotal={optTotal ?? 0} cardName={nameOf} onJumpToStep={(i) => jump(i)} />
        </div>
      ) : null}
      {checkBanner ? (
        <Banner tone={checkBanner.count ? 'warn' : 'ok'} title={t(checkBanner.count ? 'combos.check.found' : 'combos.check.ok', { count: checkBanner.count })} onDismiss={checkBanner.onClose} />
      ) : null}
      {bad.size > 0 ? (
        <Banner tone="warn" title={t('combos.incoherent.title', { count: bad.size })}>
          {t('combos.incoherent.body')}
        </Banner>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('combos.steps.title', { count: doc.steps.length })}</h2>
        <div className="flex items-center gap-1">
          {segments.some((sg) => sg.kind !== 'step') ? (
            <Button
              variant="ghost"
              onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(segments.flatMap((sg) => (sg.kind === 'step' ? [] : [sg.key]))))}
              data-testid="toggle-blocks"
            >
              {t(collapsed.size ? 'combos.steps.expandAll' : 'combos.steps.collapseAll')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => store.setCursor(0)} disabled={cursor === 0}>
            {t('combos.steps.fromStart')}
          </Button>
        </div>
      </div>
      {doc.steps.length > 8 ? (
        // la ricerca resta visibile sotto le schede mentre si scorre la lista
        <div className="sticky top-11 z-10 -mx-1 flex items-center gap-1 bg-surface-1 px-1 pb-2 pt-1">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              data-testid="step-search"
              placeholder={t('combos.steps.search')}
              aria-label={t('combos.steps.search')}
              onChange={(e) => {
                setQuery(e.target.value)
                setMatchPos(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (matches.length === 1 || matchPos === 0) jump(matches[0] ?? 0)
                  if (matches.length > 1) step(e.shiftKey ? -1 : 1)
                }
              }}
              className="min-h-11 w-full rounded-md border border-line-strong bg-surface-1 pl-9 pr-3 text-[15px] text-fg placeholder:text-subtle hover:border-accent-text focus-visible:border-accent-text"
            />
          </div>
          {query.trim() ? (
            <>
              <span className="shrink-0 px-1 text-sm tabular-nums text-muted" data-testid="step-matches">
                {matches.length ? `${Math.min(matchPos + 1, matches.length)}/${matches.length}` : t('combos.steps.noMatch')}
              </span>
              <IconButton label={t('combos.steps.prevMatch')} icon={<ChevronUp size={18} />} disabled={!matches.length} onClick={() => step(-1)} />
              <IconButton label={t('combos.steps.nextMatch')} icon={<ChevronDown size={18} />} disabled={!matches.length} onClick={() => step(1)} />
            </>
          ) : null}
        </div>
      ) : null}
      {doc.steps.length === 0 ? <p className="rounded-md border border-dashed border-line-strong p-4 text-[15px] text-muted">{t('combos.steps.empty')}</p> : null}
      <ol className="flex flex-col gap-1.5" data-steps ref={listRef}>
        {segments.map((sg) => {
          if (sg.kind === 'step') return row(sg.i, false)
          const open = !collapsed.has(sg.key) || sg.indices.includes(sel)
          const first = doc.steps[sg.indices[0]!]!
          const title =
            sg.kind === 'chain' ? t('combos.steps.chainBlock', { count: sg.indices.length }) : t('combos.steps.groupBlock', { count: sg.indices.length })
          return (
            <li key={sg.key + sg.indices[0]} data-block={sg.kind} className="flex flex-col gap-1.5 rounded-md border-l-4 border-l-accent-text bg-surface-2/40 pl-1.5">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(sg.key)}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm font-medium text-fg hover:bg-surface-2"
              >
                {open ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs tabular-nums text-accent-text">
                  {sg.indices[0]! + 1}–{sg.indices[sg.indices.length - 1]! + 1}
                </span>
                {sg.kind === 'group' ? <span className="sr-only">{first.group}</span> : null}
              </button>
              {open ? <ol className="flex flex-col gap-1.5 pb-1.5 pr-1.5">{sg.indices.map((i) => row(i, true))}</ol> : null}
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
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const store = useEditor.getState()
  const noteLang = useEditor((x) => x.doc?.meta.noteLang) ?? []
  // un solo campo: mostra la lingua corrente (o la prima disponibile) e salva sotto la lingua corrente
  const note = (value: string) =>
    store.edit((d) => ({
      doc: {
        ...d,
        meta: { ...d.meta, noteLang: withNoteLang(d.meta.noteLang, lang) },
        steps: d.steps.map((x) => (x.id === step.id ? { ...x, note: withText(x.note, lang, value) } : x)),
      },
    }))
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
        {t('combos.step.note')}
        <textarea className={textareaCls} value={pickText(step.note, lang, noteLang)} onChange={(e) => note(e.target.value)} data-testid="note" />
      </label>
      <Select
        label={t('combos.step.phase')}
        value={step.phase ?? ''}
        data-testid="step-phase"
        options={[{ value: '', label: t('combos.step.phaseNone') }, ...PHASES.map((p) => ({ value: p, label: t(`combos.phase.${p}`) }))]}
        onValueChange={(v) => {
          const { phase: _p, ...rest } = step
          void _p
          store.edit((d) => ({
            doc: { ...d, steps: d.steps.map((x) => (x.id === step.id ? (v ? { ...rest, phase: v as Step['phase'] } : rest) : x)) },
          }))
        }}
      />
      {step.effect || step.action === 'activate' || step.action === 'chainActivate' ? (
        <Select
          label={t('combos.step.opt')}
          value={step.x?.opt === undefined ? 'auto' : String(step.x.opt)}
          data-testid="step-opt"
          options={[
            { value: 'auto', label: t('combos.step.optAuto') },
            { value: 'true', label: t('combos.step.optCard') },
            { value: 'name', label: t('combos.step.optName') },
            { value: 'false', label: t('combos.step.optNo') },
          ]}
          onValueChange={(v) => {
            const x: Record<string, unknown> = { ...step.x }
            if (v === 'auto') delete x.opt
            else x.opt = v === 'true' ? true : v === 'false' ? false : v
            store.patchStep(step.id, { x: Object.keys(x).length ? x : (undefined as never) })
          }}
        />
      ) : null}
      <Switch label={t('combos.step.optional')} checked={!!step.optional} onCheckedChange={(v) => store.patchStep(step.id, { optional: v })} />
    </div>
  )
}
