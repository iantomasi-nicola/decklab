/** Replay di una combo: /combo/$comboId/replay. Campo in sola lettura + barra di controllo compatta riducibile. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import Check from 'lucide-react/icons/check'
import GitBranch from 'lucide-react/icons/git-branch'
import { pickLoc } from '@/features/guide/guideModel'
import '@/features/guide/locales'
import { makeNoteResolver } from '@/features/guide/notes'
import { useComboDoc } from '@/features/guide/useComboDoc'
import { useCards } from '@/features/combos/useCards'
import { useMediaQuery } from '@/features/combos/useCards'
import type { ComboDoc } from '@/domain/combo/types'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Menu } from '@/ui/Menu'
import { Skeleton } from '@/ui/Skeleton'
import { Tooltip } from '@/ui/Tooltip'
import { ControlBar, StepInfo, Timeline, type Names } from './ReplayParts'
import { FrameList, PickerButton, SegmentBar, StepNavBar, StepPicker } from './ReplayNav'
import { ReplayField } from './ReplayField'
import { blockStarts, buildTimeline, frameSections, initialPlayer, intervalFor, playerReducer, SPEEDS, stepBlock, type PlayerAction } from './replayModel'

const BAR_KEY = 'combolab.replay.expanded'
function readExpanded(): boolean | null {
  try {
    const v = localStorage.getItem(BAR_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

export function ReplayPage() {
  const { comboId } = useParams({ strict: false }) as { comboId: string }
  return <ReplayView key={comboId} comboId={comboId} />
}

const stageCls =
  'flex h-[calc(100dvh-57px-16px-var(--bottomnav-h)-env(safe-area-inset-bottom,0px))] min-h-[420px] flex-col gap-2 md:h-[calc(100dvh-61px-16px)]'

function ReplayView({ comboId }: { comboId: string }) {
  const { t } = useTranslation()
  const { load } = useComboDoc(comboId)
  if (load.status === 'loading') return <Skeleton className="h-96 w-full" />
  if (load.status === 'missing' || load.status === 'invalid')
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2 pt-4">
        <Banner tone="danger" title={t(load.status === 'missing' ? 'replay.notFound' : 'replay.invalid')} />
        <Link to="/combo" className="inline-flex min-h-11 items-center text-accent-text underline">{t('guide.back')}</Link>
      </div>
    )
  return <Replay doc={load.doc} comboId={comboId} />
}

function Replay({ doc, comboId }: { doc: ComboDoc; comboId: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const cards = useCards()
  const isLg = useMediaQuery('(min-width: 1024px)')

  const [branchId, setBranchId] = useState<string | null>(null)
  const tl = useMemo(() => buildTimeline(doc, branchId), [doc, branchId])
  const last = tl.frames.length - 1
  const lastRef = useRef(last)
  lastRef.current = last
  const [p, dispatch] = useReducer((s: typeof initialPlayer, a: PlayerAction) => playerReducer(s, a, lastRef.current), initialPlayer)
  const index = Math.min(p.index, last)
  const frame = tl.frames[index]!
  const sections = useMemo(() => frameSections(tl), [tl])
  const nav = useRef({ index, starts: [0] as number[] })
  nav.current = { index, starts: blockStarts(sections) }
  const seek = useCallback((i: number) => dispatch({ type: 'seek', index: i }), [])
  const wide = useMediaQuery('(min-width: 768px)')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFocus, setPickerFocus] = useState(false)
  const [panelQuery, setPanelQuery] = useState('')
  const longCombo = last > 24
  const sm = useMediaQuery('(min-width: 640px)')

  // barra: aperta di default (il campo ha rapporto fisso: in verticale lo spazio in più è per la descrizione); la scelta si ricorda
  const [stored, setStored] = useState<boolean | null>(readExpanded)
  const expanded = stored ?? true
  const setExpanded = (v: boolean) => {
    setStored(v)
    try {
      localStorage.setItem(BAR_KEY, v ? '1' : '0')
    } catch {
      /* storage non disponibile */
    }
  }

  // riproduzione automatica
  useEffect(() => {
    if (!p.playing) return
    const h = setTimeout(() => dispatch({ type: 'tick' }), intervalFor(p.speed))
    return () => clearTimeout(h)
  }, [p.playing, p.speed, p.index])

  // cambio ramo: riparte dal punto di diramazione
  const firstBranch = useRef(true)
  useEffect(() => {
    if (firstBranch.current) {
      firstBranch.current = false
      return
    }
    dispatch({ type: 'pause' })
    dispatch({ type: 'seek', index: branchId ? tl.branchStart - 1 : 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  // scorciatoie
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      if (el?.closest('[role="menu"], [role="dialog"]')) return
      // su un pulsante lo spazio/invio fanno già il clic
      const onButton = tag === 'BUTTON' || tag === 'A'
      switch (e.key) {
        case ' ':
          if (onButton) return
          e.preventDefault()
          dispatch({ type: 'toggle' })
          break
        case 'ArrowRight':
          e.preventDefault()
          dispatch({ type: 'next' })
          break
        case 'ArrowLeft':
          e.preventDefault()
          dispatch({ type: 'prev' })
          break
        case 'Home':
          e.preventDefault()
          dispatch({ type: 'seek', index: 0 })
          break
        case 'End':
          e.preventDefault()
          dispatch({ type: 'seek', index: lastRef.current })
          break
        case 'PageDown':
        case 'PageUp':
          e.preventDefault()
          dispatch({ type: 'seek', index: stepBlock(nav.current.starts, nav.current.index, e.key === 'PageDown' ? 1 : -1) })
          break
        case 'g':
        case 'G':
          if (lastRef.current < 1) break
          e.preventDefault()
          setPickerFocus(true)
          setPickerOpen(true)
          break
        case '+':
        case '=':
          dispatch({ type: 'speed', speed: SPEEDS[Math.min(SPEEDS.indexOf(p.speed) + 1, SPEEDS.length - 1)]! })
          break
        case '-':
          dispatch({ type: 'speed', speed: SPEEDS[Math.max(SPEEDS.indexOf(p.speed) - 1, 0)]! })
          break
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [p.speed])

  const nameOfUid = useCallback((uid: string) => (doc.cards[uid] !== undefined ? cards.nameOf(doc.cards[uid]!) : uid), [doc.cards, cards])
  const resolver = useMemo(
    () =>
      makeNoteResolver(doc, (code) => {
        const c = cards.byId(code)
        return c ? [c.name.en, ...(c.name.it ? [c.name.it] : [])] : []
      }),
    [doc, cards],
  )
  const names: Names = { nameOf: cards.nameOf, nameOfUid, resolver, lang }

  const title = pickLoc(doc.meta.title, lang) ?? t('combos.untitled')
  const branches = doc.branches
  const activeBranch = branchId ? branches.find((b) => b.id === branchId) : undefined
  const branchName = (b: ComboDoc['branches'][number], n: number) => pickLoc(b.title, lang) ?? t('replay.branchUntitled', { n })
  const counter = frame.inBranch
    ? t('replay.stepBranch', { n: frame.label, total: tl.frames.length - tl.branchStart })
    : index === 0
      ? t('replay.startShort')
      : t('replay.step', { n: frame.label, total: tl.branchStart - 1 })
  const hasSteps = last > 0
  // sul telefono il contatore è breve ("24/60"): il testo completo non entra senza troncarsi
  const counterShort = index === 0 ? t('replay.startShort') : frame.inBranch ? `${frame.label}/${tl.frames.length - tl.branchStart}` : `${frame.label}/${tl.branchStart - 1}`

  const lineItems = [
    { id: 'main', label: t('replay.main'), icon: branchId === null ? <Check size={18} /> : <span className="inline-block w-[18px]" />, onSelect: () => setBranchId(null) },
    ...branches.map((b, i) => ({
      id: b.id,
      label: branchName(b, i + 1),
      icon: branchId === b.id ? <Check size={18} /> : <span className="inline-block w-[18px]" />,
      onSelect: () => setBranchId(b.id),
    })),
  ]

  const panel = isLg && expanded
  return (
    <div data-combo-stage data-testid="replay-page" className={stageCls}>
      <header className="flex shrink-0 items-center gap-2">
        <Tooltip label={t('replay.back')}>
          <Link
            to="/combo/$comboId/guida"
            params={{ comboId }}
            aria-label={t('replay.back')}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-base font-semibold leading-5 [overflow-wrap:anywhere] sm:text-lg sm:leading-6">{title}</h1>
          <p className="truncate text-sm leading-5 text-muted">{activeBranch ? `${t('replay.title')} · ${branchName(activeBranch, branches.indexOf(activeBranch) + 1)}` : t('replay.title')}</p>
        </div>
        {branches.length ? (
          <Menu
            items={lineItems}
            trigger={
              <Button icon={<GitBranch size={18} />} aria-label={`${t('replay.line')}: ${activeBranch ? branchName(activeBranch, branches.indexOf(activeBranch) + 1) : t('replay.main')}`} data-testid="rp-line" className="w-11 shrink-0 px-0 sm:w-auto sm:max-w-[50%] sm:shrink sm:px-4">
                <span className="hidden truncate sm:inline">{activeBranch ? branchName(activeBranch, branches.indexOf(activeBranch) + 1) : t('replay.main')}</span>
              </Button>
            }
          />
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-h-0 min-w-0 flex-1">
          <ReplayField doc={doc} frame={frame} frameKey={`${branchId ?? 'main'}:${index}`} nameOf={cards.nameOf} animate={!(p.playing && p.speed >= 2)} />
        </div>
        {panel ? (
          <aside aria-label={t('replay.timeline')} data-testid="replay-panel" className="flex min-h-0 w-[clamp(300px,28vw,380px)] shrink-0 flex-col gap-3 rounded-lg border border-line bg-surface-1 p-3">
            <div className="max-h-[38%] shrink-0 overflow-y-auto overscroll-contain">
              <StepInfo frame={frame} names={names} />
            </div>
            <div className="h-px shrink-0 bg-line" />
            {hasSteps ? <StepNavBar query={panelQuery} onQuery={setPanelQuery} total={last} onJump={seek} /> : null}
            <FrameList frames={tl.frames} sections={sections} index={index} names={names} query={panelQuery} playing={p.playing} onSeek={seek} className="flex-1" />
          </aside>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        {expanded && !isLg ? (
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-1 p-2">
            <StepInfo frame={frame} names={names} clamp />
            {hasSteps && !longCombo ? <Timeline frames={tl.frames} index={index} branchStart={tl.branchStart} onSeek={seek} /> : null}
            {hasSteps && longCombo ? (
              <div className="flex items-center gap-2" data-testid="replay-longnav">
                <SegmentBar sections={sections} index={index} last={last} valueText={counter} onSeek={seek} />
                <PickerButton label={t('replay.picker.open')} onClick={() => { setPickerFocus(false); setPickerOpen(true) }} />
              </div>
            ) : null}
          </div>
        ) : null}
        {!hasSteps ? (
          <p className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-sm text-muted" data-testid="replay-empty">
            {t('replay.empty')}{' '}
            <Link to="/combo/$comboId" params={{ comboId }} className="text-accent-text underline">{t('replay.openEditor')}</Link>
          </p>
        ) : null}
        <ControlBar
          index={index}
          last={last}
          playing={p.playing}
          speed={p.speed}
          label={sm ? counter : counterShort}
          expanded={expanded}
          hasSteps={hasSteps}
          onPrev={() => dispatch({ type: 'prev' })}
          onNext={() => dispatch({ type: 'next' })}
          onFirst={() => dispatch({ type: 'seek', index: 0 })}
          onLast={() => dispatch({ type: 'seek', index: last })}
          onPlay={() => dispatch({ type: 'toggle' })}
          onSpeed={() => dispatch({ type: 'cycleSpeed' })}
          onExpand={() => setExpanded(!expanded)}
        />
      </div>
      {hasSteps ? (
        <StepPicker open={pickerOpen} onOpenChange={setPickerOpen} wide={wide} frames={tl.frames} sections={sections} index={index} names={names} onSeek={seek} focusJump={pickerFocus} />
      ) : null}
      <p className={cn('sr-only')} aria-live="polite">{frame.step ? counter : t('replay.start')}</p>
      <p className="sr-only">{t('replay.keys')}</p>
    </div>
  )
}
