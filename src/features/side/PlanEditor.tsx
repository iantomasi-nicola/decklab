import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import ChevronDown from 'lucide-react/icons/chevron-down'
import Copy from 'lucide-react/icons/copy'
import ImageDown from 'lucide-react/icons/image-down'
import Layers from 'lucide-react/icons/layers'
import MoreHorizontal from 'lucide-react/icons/more-horizontal'
import Sparkles from 'lucide-react/icons/sparkles'
import Trash2 from 'lucide-react/icons/trash-2'
import ArrowLeftRight from 'lucide-react/icons/arrow-left-right'
import { repos } from '@/data/repo'
import type { Banlist, Variant } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import {
  applySidePlan,
  clampToDeck,
  countByCanonical,
  duplicatePlanData,
  otherTurn,
  previewRows,
  setCount,
  suggestSwaps,
  totalCount,
  validateSidePlan,
  type CardRole,
  type SidePlan,
  type SidePlanData,
  type SideTurn,
} from '@/domain/side'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { EmptyState } from '@/ui/EmptyState'
import { Field, Input } from '@/ui/Input'
import { IconButton } from '@/ui/IconButton'
import { Menu, type MenuItem } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { toast } from '@/ui/Toast'
import { Textarea } from '@/features/decks/fields'
import { sortStacks } from '@/features/decks/cardMeta'
import { BalanceBar, IssueList } from './Balance'
import { CopyFromDialog } from './CopyFromDialog'
import { Lane, type LaneStack } from './Lane'
import { ARCHETYPE_LIST_ID, TurnSegmented } from './NewPlanDialog'
import { Preview } from './Preview'
import { SideExportDialog } from './SideExportDialog'
import { usePlanDraft } from './usePlanDraft'
import { useLang } from './hooks'

type Tab = 'out' | 'in' | 'preview'

export interface PlanEditorProps {
  plan: SidePlan
  /** Altri piani della stessa variante (per "copia da"). */
  others: SidePlan[]
  variant: Variant
  variantName: string
  index: CardIndex
  banlist: Banlist | undefined
  roles: Map<number, CardRole>
  /** Contenitore largo: OUT e IN affiancati e anteprima sotto; altrimenti schede. */
  twoLanes: boolean
  onBack?: () => void
  onSelect: (id: string) => void
  onDeleted: () => void
}

/** Pila di carte uniche di una lista (per carta canonica), con l'artwork mostrato nel mazzo. */
function stacksOf(list: readonly number[], canonical: (id: number) => number, index: CardIndex, lang: 'it' | 'en'): LaneStack[] {
  const count = countByCanonical(list, canonical)
  const shown = new Map<number, number>()
  for (const id of list) if (!shown.has(canonical(id))) shown.set(canonical(id), id)
  const sorted = sortStacks([...count].map(([id, n]) => ({ id, count: n })), index, lang)
  return sorted.map((s) => ({ cardId: s.id, shownId: shown.get(s.id) ?? s.id, have: s.count }))
}

export function PlanEditor({ plan, others, variant, variantName, index, banlist, roles, twoLanes, onBack, onSelect, onDeleted }: PlanEditorProps) {
  const { t } = useTranslation()
  const lang = useLang()
  const { draft, update, replace, current } = usePlanDraft(plan)
  const [tab, setTab] = useState<Tab>('out')
  const [exportOpen, setExportOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(() => plan.matchup.note.trim().length > 0)
  const [hint, setHint] = useState<null | { tone: 'info' | 'warn'; title: string; body?: string; link?: boolean }>(null)

  const canonical = useCallback((id: number) => index.canonicalId(id), [index])
  const deck = variant.deck
  const mainStacks = useMemo(() => stacksOf(deck.main, canonical, index, lang), [deck.main, canonical, index, lang])
  const sideStacks = useMemo(() => stacksOf(deck.side, canonical, index, lang), [deck.side, canonical, index, lang])

  const validation = useMemo(
    () => validateSidePlan(deck, draft, { rules: variant.rules, ...(banlist ? { banlist } : {}), index }),
    [deck, draft, variant.rules, banlist, index],
  )
  const rows = useMemo(() => previewRows(deck, draft, canonical), [deck, draft, canonical])
  const after = useMemo(() => applySidePlan(deck, draft, canonical), [deck, draft, canonical])

  const setSwap = (kind: 'outs' | 'ins') => (cardId: number, count: number) => {
    setHint(null)
    update((d) => ({ ...d, [kind]: setCount(d[kind], cardId, count) }))
  }
  const setMatchup = (patch: Partial<SidePlanData['matchup']>) => update((d) => ({ ...d, matchup: { ...d.matchup, ...patch } }))

  /* ---- azioni ---- */
  const runSuggest = () => {
    const prev = current()
    const s = suggestSwaps({ deck, canonical, matchup: prev.matchup, roles })
    if (s.empty) {
      setHint({
        tone: 'info',
        title: t(`side.suggest.${s.empty === 'no-roles' ? 'noRoles' : s.empty === 'no-in' ? 'noIn' : 'noOut'}.title`),
        body: t(`side.suggest.${s.empty === 'no-roles' ? 'noRoles' : s.empty === 'no-in' ? 'noIn' : 'noOut'}.body`),
        link: s.empty === 'no-roles',
      })
      return
    }
    replace({ ...prev, outs: s.outs.map(({ cardId, count }) => ({ cardId, count })), ins: s.ins.map(({ cardId, count }) => ({ cardId, count })) })
    const extra = s.unmatched.ins ? t('side.suggest.unmatched', { count: s.unmatched.ins }) : s.unmatched.outs ? t('side.suggest.unmatchedOut', { count: s.unmatched.outs }) : ''
    setHint(extra ? { tone: 'info', title: extra } : null)
    toast(t('side.suggest.applied', { out: totalCount(s.outs), in: totalCount(s.ins) }), {
      tone: 'ok',
      durationMs: 6000,
      action: { label: t('side.suggest.undo'), onClick: () => replace(prev) },
    })
  }

  const duplicate = async (turn?: SideTurn) => {
    const copySuffix = t('side.actions.copySuffix')
    const name = turn ? draft.matchup.name : `${draft.matchup.name}${copySuffix}`
    // scrive prima l'eventuale modifica in sospeso, poi duplica
    await repos.sidePlans.update(plan.id, { matchup: draft.matchup, outs: draft.outs, ins: draft.ins })
    const copy = await repos.sidePlans.duplicate(plan.id, { name, ...(turn ? { turn } : {}) })
    toast(t('side.actions.duplicated'), { tone: 'ok' })
    onSelect(copy.id)
  }

  const remove = async () => {
    await repos.sidePlans.softDelete(plan.id)
    onDeleted()
    toast(t('side.actions.deleted', { name: draft.matchup.name || t('side.untitledPlan') }), {
      durationMs: 7000,
      action: { label: t('side.actions.undo'), onClick: () => void repos.sidePlans.restore(plan.id).then(() => onSelect(plan.id)) },
    })
  }

  const copyFrom = (src: SidePlan) => {
    const prev = current()
    const fitted = clampToDeck(duplicatePlanData(src), deck, canonical)
    replace({ ...prev, outs: fitted.outs, ins: fitted.ins })
    toast(t('side.actions.copied', { name: src.matchup.name }), { tone: 'ok', action: { label: t('side.actions.undo'), onClick: () => replace(prev) } })
  }

  const menuItems: MenuItem[] = [
    { id: 'dup', label: t('side.actions.duplicate'), icon: <Copy size={18} />, onSelect: () => void duplicate() },
    {
      id: 'dup-turn',
      label: t(draft.matchup.turn === 'first' ? 'side.actions.duplicateSecond' : 'side.actions.duplicateFirst'),
      icon: <ArrowLeftRight size={18} />,
      onSelect: () => void duplicate(otherTurn(draft.matchup.turn)),
    },
    { id: 'copy-from', label: t('side.actions.copyFrom'), icon: <Layers size={18} />, onSelect: () => setCopyOpen(true) },
    { id: 'delete', label: t('side.actions.delete'), icon: <Trash2 size={18} />, danger: true, onSelect: () => void remove() },
  ]

  const moreMenu = (
    <Menu
      trigger={<IconButton label={t('side.actions.more')} icon={<MoreHorizontal size={20} />} variant="secondary" data-testid="plan-menu" />}
      items={menuItems}
    />
  )

  const sideEmpty = (
    <EmptyState
      className="border-0 px-2 py-6"
      icon={<Layers size={28} />}
      title={t('side.emptySide.title')}
      description={t('side.emptySide.body')}
      action={
        <Link to="/mazzi/$variantId" params={{ variantId: variant.id }} className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-4 text-[15px] font-medium hover:bg-surface-3">
          {t('side.emptySide.action')}
        </Link>
      }
    />
  )

  const outLane = <Lane kind="out" stacks={mainStacks} selected={draft.outs} index={index} lang={lang} onSet={setSwap('outs')} scroll={twoLanes} />
  const inLane = <Lane kind="in" stacks={sideStacks} selected={draft.ins} index={index} lang={lang} onSet={setSwap('ins')} empty={sideEmpty} scroll={twoLanes} />
  const preview = <Preview rows={rows} mainAfter={after.main.length} index={index} lang={lang} />

  const subtitle = [variantName, draft.matchup.archetype, t(`side.turn.${draft.matchup.turn}`)].filter(Boolean).join(' · ')

  return (
    <div data-testid="plan-editor" data-plan-id={plan.id} className="flex min-w-0 flex-col gap-4">
      {/* Intestazione del matchup */}
      <div className="flex flex-col gap-3">
        {onBack ? (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" icon={<ArrowLeft size={18} />} onClick={onBack} data-testid="side-back" className="-ml-3">
              {t('side.back')}
            </Button>
            {moreMenu}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label={t('side.plan.name')}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  data-testid="plan-name"
                  value={draft.matchup.name}
                  placeholder={t('side.plan.namePlaceholder')}
                  onChange={(e) => setMatchup({ name: e.target.value })}
                  autoComplete="off"
                  className="text-base font-semibold"
                />
              )}
            </Field>
          </div>
          {onBack ? null : moreMenu}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1">
            <Field label={t('side.plan.archetype')}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  data-testid="plan-archetype"
                  className="min-h-12"
                  list={ARCHETYPE_LIST_ID}
                  value={draft.matchup.archetype ?? ''}
                  placeholder={t('side.plan.archetypePlaceholder')}
                  onChange={(e) => setMatchup({ archetype: e.target.value })}
                  autoComplete="off"
                />
              )}
            </Field>
          </div>
          <div className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="text-sm font-medium text-fg">{t('side.plan.turn')}</span>
            <TurnSegmented value={draft.matchup.turn} onValueChange={(turn) => setMatchup({ turn })} className="sm:w-auto" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<Sparkles size={18} />} onClick={runSuggest} data-testid="side-suggest" title={t('side.suggest.hint')} className="flex-1 sm:flex-none">
            {t('side.suggest.button')}
          </Button>
          <Button icon={<ImageDown size={18} />} onClick={() => setExportOpen(true)} data-testid="side-export" aria-label={t('side.export.button')} className="shrink-0 px-3 sm:px-4">
            <span className="hidden sm:inline">{t('side.export.button')}</span>
            <span className="sm:hidden">{t('side.export.short')}</span>
          </Button>
        </div>
      </div>

      {/* Bilancio sempre visibile */}
      <div className="sticky top-14 z-20 -mx-1 bg-bg/95 px-1 py-1 backdrop-blur">
        <BalanceBar validation={validation} index={index} lang={lang} />
      </div>

      {hint ? (
        <Banner
          tone={hint.tone}
          title={hint.title}
          onDismiss={() => setHint(null)}
          action={
            hint.link ? (
              <Link to="/statistiche" className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-4 text-[15px] font-medium hover:bg-surface-3">
                {t('side.suggest.noRoles.action')}
              </Link>
            ) : undefined
          }
        >
          {hint.body}
        </Banner>
      ) : null}

      <IssueList validation={validation} index={index} lang={lang} />

      {twoLanes ? (
        <>
          <div className="grid grid-cols-2 items-start gap-4">
            {outLane}
            {inLane}
          </div>
          {preview}
        </>
      ) : (
        <>
          <Segmented
            label={t('side.tabs.label')}
            value={tab}
            onValueChange={setTab}
            className="w-full"
            fill
            options={[
              { value: 'out', label: `${t('side.tabs.out')} −${validation.summary.outCount}` },
              { value: 'in', label: `${t('side.tabs.in')} +${validation.summary.inCount}` },
              { value: 'preview', label: t('side.tabs.preview') },
            ]}
          />
          {tab === 'out' ? outLane : tab === 'in' ? inLane : preview}
        </>
      )}

      {/* Note */}
      <div className="rounded-lg border border-line bg-surface-1">
        <button
          type="button"
          aria-expanded={noteOpen}
          onClick={() => setNoteOpen((o) => !o)}
          className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-3 text-left text-[15px] font-medium"
        >
          {t('side.plan.noteToggle')}
          <ChevronDown aria-hidden size={18} className={cn('text-subtle transition-transform duration-150', noteOpen && 'rotate-180')} />
        </button>
        {noteOpen ? (
          <div className="border-t border-line p-3">
            <Textarea
              aria-label={t('side.plan.note')}
              data-testid="plan-note"
              value={draft.matchup.note}
              placeholder={t('side.plan.notePlaceholder')}
              onChange={(e) => setMatchup({ note: e.target.value })}
              className="min-h-24 w-full"
            />
          </div>
        ) : null}
      </div>

      <SideExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        title={draft.matchup.name || t('side.untitledPlan')}
        subtitle={subtitle}
        rows={rows}
        outs={draft.outs}
        ins={draft.ins}
        index={index}
        lang={lang}
      />
      <CopyFromDialog open={copyOpen} onOpenChange={setCopyOpen} plans={others} onPick={copyFrom} />
    </div>
  )
}
