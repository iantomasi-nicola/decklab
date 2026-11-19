import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import PanelRight from 'lucide-react/icons/panel-right'
import Plus from 'lucide-react/icons/plus'
import SlidersHorizontal from 'lucide-react/icons/sliders-horizontal'
import X from 'lucide-react/icons/x'
import Redo2 from 'lucide-react/icons/redo-2'
import Undo2 from 'lucide-react/icons/undo-2'
import { allStates } from '@/domain/combo/state'
import { readCombo } from '@/domain/combo/migrate'
import type { ComboDoc } from '@/domain/combo/types'
import { repos, type ComboRecord } from '@/data/repo'
import { Banner } from '@/ui/Banner'
import { cn } from '@/ui/cn'
import { IconButton } from '@/ui/IconButton'
import { Skeleton } from '@/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { Tooltip } from '@/ui/Tooltip'
import { BottomSheet } from '@/ui/BottomSheet'
import { Menu } from '@/ui/Menu'
import { Board, type BoardHandle } from './Board'
import { useEditor } from './editorStore'
import { InfoPanel } from './InfoPanel'
import { deriveDoc, finalizeDoc } from './model'
import { SetupPanel } from './SetupPanel'
import { StepsPanel } from './StepsPanel'
import { useCards, useMediaQuery } from './useCards'

type SaveState = 'saved' | 'saving' | 'error'
type PanelTab = 'steps' | 'setup' | 'info'
interface PanelState { open: boolean; tab: PanelTab }

const PANEL_KEY = 'combolab.combo.panel'
/** Pannelli chiusi di default; si ricorda l'ultimo stato (solo da 768 px: su telefono il pannello è un foglio modale). */
function readPanel(): PanelState {
  try {
    const v = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null') as Partial<PanelState> | null
    const tab = v?.tab === 'setup' || v?.tab === 'info' ? v.tab : 'steps'
    // senza preferenza salvata: su schermi larghi (>= 1280) lo spazio che avanza al campo va ai pannelli
    const open = v ? !!v.open : window.matchMedia('(min-width: 1280px)').matches
    return { open: open && window.matchMedia('(min-width: 768px)').matches, tab }
  } catch {
    return { open: false, tab: 'steps' }
  }
}
function writePanel(p: PanelState) {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(p))
  } catch {
    /* storage non disponibile */
  }
}

export function ComboEditor({ comboId }: { comboId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const cards = useCards()
  const [record, setRecord] = useState<ComboRecord | null | undefined>(undefined)
  const [all, setAll] = useState<ComboRecord[]>([])
  const [readError, setReadError] = useState<string[] | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [save, setSave] = useState<SaveState>('saved')
  const [panel, setPanel] = useState<PanelState>(readPanel)
  const boardRef = useRef<BoardHandle>(null)
  const isMd = useMediaQuery('(min-width: 768px)')
  const isLg = useMediaQuery('(min-width: 1024px)')

  const doc = useEditor((s) => s.doc)
  const cursor = useEditor((s) => s.cursor)
  const mode = useEditor((s) => s.mode)
  const rev = useEditor((s) => s.rev)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const recordRef = useRef<ComboRecord | null>(null)

  // ---- caricamento
  useEffect(() => {
    let live = true
    useEditor.getState().close()
    setRecord(undefined)
    setReadError(null)
    void repos.combos.get(comboId).then((r) => {
      if (!live) return
      if (!r || r.deletedAt !== null) return setRecord(null)
      const res = readCombo(r.payload)
      if (!res.ok) {
        setReadError(res.errors.map((e) => `${e.code} ${JSON.stringify(e.params ?? {})} ${e.path.join('.')}`))
        return setRecord(r)
      }
      recordRef.current = r
      setReadOnly(res.readOnly)
      useEditor.getState().open(res.doc, r.id)
      setRecord(r)
    })
    const sub = repos.combos.watchList().subscribe({ next: (rows) => live && setAll(rows) })
    return () => {
      live = false
      sub.unsubscribe()
    }
  }, [comboId])

  // ---- autosalvataggio (local-first): scrive su Dexie, mai in attesa della rete
  const saveNow = useCallback(async () => {
    const { doc: d, recordId } = useEditor.getState()
    if (!d || !recordId || readOnly) return
    try {
      setSave('saving')
      const final = finalizeDoc(d, new Date().toISOString())
      await repos.combos.update(recordId, { payload: final, name: final.meta.title })
      setSave('saved')
    } catch {
      setSave('error')
    }
  }, [readOnly])
  useEffect(() => {
    if (rev === 0) return
    setSave('saving')
    const h = setTimeout(() => void saveNow(), 600)
    return () => clearTimeout(h)
  }, [rev, saveNow])
  useEffect(() => {
    const flush = () => {
      if (useEditor.getState().rev > 0) void saveNow()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [saveNow])

  // ---- Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useEditor.getState().undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        useEditor.getState().redo()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const states = useMemo(() => (doc ? allStates(doc) : null), [doc])
  const state = states ? (mode === 'setup' ? states.main[0]! : (states.main[Math.min(cursor, states.main.length - 1)] ?? states.main[0]!)) : null
  const nameOfUid = useCallback((uid: string) => (doc ? cards.nameOf(doc.cards[uid] ?? 0) : uid), [doc, cards])

  const variants = useMemo(() => all.filter((r) => (r.payload as ComboDoc | undefined)?.meta?.derivedFrom?.comboId === comboId), [all, comboId])
  const mother = useMemo(() => {
    const id = doc?.meta.derivedFrom?.comboId
    return id ? all.find((r) => r.id === id) : undefined
  }, [all, doc?.meta.derivedFrom?.comboId])

  const derive = useCallback(
    async (index: number, inclusive: boolean) => {
      const { doc: d } = useEditor.getState()
      const rec = recordRef.current
      if (!d || !rec) return
      await saveNow()
      const id = crypto.randomUUID()
      const lang = i18n.language === 'it' ? 'it' : 'en'
      const base = d.meta.title[lang] ?? d.meta.title.it ?? d.meta.title.en ?? t('combos.untitled')
      const title = { it: `${d.meta.title.it ?? base} (variante)`, en: `${d.meta.title.en ?? base} (variant)` }
      const child = deriveDoc(d, index, inclusive, { id, title, now: new Date().toISOString() })
      await repos.combos.create({ id, archetypeId: rec.archetypeId, variantId: rec.variantId, name: child.meta.title, tagIds: rec.tagIds, payload: child })
      toast(t('combos.derived'), { tone: 'ok' })
      void navigate({ to: '/combo/$comboId', params: { comboId: id } })
    },
    [navigate, saveNow, i18n.language, t],
  )

  if (record === undefined) return <Skeleton className="h-96 w-full" />
  if (record === null || readError) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="danger" title={t(readError ? 'combos.readError' : 'combos.notFound')}>
          {readError ? <ul className="mt-1 list-disc pl-5 text-sm">{readError.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </Banner>
        <Link to="/combo" className="text-accent-text underline">{t('combos.backToList')}</Link>
      </div>
    )
  }
  if (!doc || !state) return <Skeleton className="h-96 w-full" />

  const lang = i18n.language === 'it' ? 'it' : 'en'
  const title = doc.meta.title[lang] ?? doc.meta.title.it ?? doc.meta.title.en ?? t('combos.untitled')
  const store = useEditor.getState()
  const setPanelState = (p: PanelState) => {
    setPanel(p)
    writePanel(p)
  }
  const togglePanel = () => setPanelState({ ...panel, open: !panel.open })

  const panelBody = (
    <Tabs value={panel.tab} onValueChange={(v) => setPanelState({ ...panel, tab: v as PanelTab })} className="min-w-0">
      <TabsList aria-label={t('combos.panels')}>
        <TabsTrigger value="steps">{t('combos.tab.steps')}</TabsTrigger>
        <TabsTrigger value="setup">{t('combos.tab.setup')}</TabsTrigger>
        <TabsTrigger value="info">{t('combos.tab.info')}</TabsTrigger>
      </TabsList>
      <TabsContent value="steps">
        <StepsPanel doc={doc} cursor={cursor} nameOf={nameOfUid} onDerive={(i, incl) => void derive(i, incl)} />
      </TabsContent>
      <TabsContent value="setup">
        <SetupPanel doc={doc} nameOf={nameOfUid} />
      </TabsContent>
      <TabsContent value="info">
        <InfoPanel doc={doc} variants={variants} mother={mother} />
      </TabsContent>
    </Tabs>
  )

  const tool = 'inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-150'
  const actions = (
    <div className="flex items-center justify-between gap-1 sm:justify-end sm:gap-1">
      <div className="flex items-center gap-1">
      <Tooltip label={`${t('combos.undo')} (Ctrl+Z)`}>
        <IconButton label={t('combos.undo')} icon={<Undo2 size={20} />} disabled={!canUndo} onClick={() => store.undo()} data-testid="undo" />
      </Tooltip>
      <Tooltip label={`${t('combos.redo')} (Ctrl+Shift+Z)`}>
        <IconButton label={t('combos.redo')} icon={<Redo2 size={20} />} disabled={!canRedo} onClick={() => store.redo()} data-testid="redo" />
      </Tooltip>
      </div>
      <div className="flex items-center gap-1">
      <Menu
        trigger={<IconButton label={t('combos.add.menu')} icon={<Plus size={20} />} disabled={readOnly} data-testid="add-menu" />}
        items={[
          { id: 'own', label: t('combos.add.own'), onSelect: () => boardRef.current?.addCard(0) },
          { id: 'opp', label: t('combos.add.opp'), onSelect: () => boardRef.current?.addCard(1) },
          ...(mode === 'setup' ? [{ id: 'hand', label: t('combos.add.toHand'), onSelect: () => boardRef.current?.deckToHand() }] : []),
        ]}
      />
      <Tooltip label={t('combos.modeSetup')}>
        <button
          type="button"
          aria-label={t('combos.modeSetup')}
          aria-pressed={mode === 'setup'}
          data-testid="mode-setup"
          onClick={() => store.setMode(mode === 'setup' ? 'steps' : 'setup')}
          className={cn(tool, 'cursor-pointer', mode === 'setup' ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2 hover:text-fg')}
        >
          <SlidersHorizontal size={20} aria-hidden />
        </button>
      </Tooltip>
      <Tooltip label={t('combos.panelToggle')}>
        <button
          type="button"
          aria-label={t('combos.panelToggle')}
          aria-pressed={panel.open}
          aria-expanded={panel.open}
          data-testid="panel-toggle"
          onClick={togglePanel}
          className={cn(tool, 'cursor-pointer', panel.open ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg')}
        >
          <PanelRight size={20} aria-hidden />
        </button>
      </Tooltip>
      </div>
    </div>
  )

  return (
    <div
      data-combo-stage
      className="flex h-[calc(100dvh-57px-16px-var(--bottomnav-h)-env(safe-area-inset-bottom,0px))] min-h-[420px] flex-col gap-2 md:h-[calc(100dvh-57px-16px)]"
    >
      <header className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tooltip label={t('combos.backToList')}>
            <Link to="/combo" aria-label={t('combos.backToList')} className={cn(tool, 'text-muted hover:bg-surface-2 hover:text-fg')}>
              <ArrowLeft size={20} aria-hidden />
            </Link>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold leading-6">{title}</h1>
            <p className="truncate text-sm leading-5 text-muted" data-testid="save-state" role="status">
              {readOnly ? t('combos.readOnly') : t(`combos.save.${save}`)}
            </p>
          </div>
        </div>
        {actions}
      </header>

      {readOnly ? <Banner tone="warn" title={t('combos.readOnly')}>{t('combos.readOnlyBody')}</Banner> : null}

      <div className="relative flex min-h-0 flex-1 gap-2">
        <div className="relative min-w-0 flex-1" data-mode={mode}>
          <Board doc={doc} state={state} mode={mode} cursor={cursor} readOnly={readOnly} handle={boardRef} />
          {mode === 'setup' ? (
            <p className="pointer-events-none absolute bottom-2 left-1/2 z-30 -translate-x-1/2 rounded-full border border-accent-text/60 bg-surface-1 px-3 py-1 text-sm font-medium text-accent-text shadow-1">
              {t('combos.modeSetupBadge')}
            </p>
          ) : null}
        </div>
        {isMd && panel.open ? (
          <aside
            aria-label={t('combos.panels')}
            data-panel
            className={cn(
              'flex min-h-0 flex-col rounded-lg border border-line bg-surface-1',
              isLg ? 'w-[clamp(320px,30vw,440px)] shrink-0' : 'absolute inset-y-0 right-0 z-30 w-[min(380px,85%)] shadow-3',
            )}
          >
            <div className="flex items-center justify-between gap-2 px-4 pt-2">
              <h2 className="text-base font-semibold">{t('combos.panels')}</h2>
              <IconButton label={t('common.close')} icon={<X size={20} />} onClick={togglePanel} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{panelBody}</div>
          </aside>
        ) : null}
      </div>

      {!isMd ? (
        <BottomSheet open={panel.open} onOpenChange={(o) => setPanelState({ ...panel, open: o })} title={t('combos.panels')}>
          <div data-panel>{panelBody}</div>
        </BottomSheet>
      ) : null}
    </div>
  )
}
