import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import Redo2 from 'lucide-react/icons/redo-2'
import Undo2 from 'lucide-react/icons/undo-2'
import { allStates } from '@/domain/combo/state'
import { readCombo } from '@/domain/combo/migrate'
import type { ComboDoc } from '@/domain/combo/types'
import { repos, type ComboRecord } from '@/data/repo'
import { Banner } from '@/ui/Banner'
import { IconButton } from '@/ui/IconButton'
import { Skeleton } from '@/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { Tooltip } from '@/ui/Tooltip'
import { Board } from './Board'
import { useEditor } from './editorStore'
import { InfoPanel } from './InfoPanel'
import { deriveDoc, finalizeDoc } from './model'
import { SetupPanel } from './SetupPanel'
import { StepsPanel } from './StepsPanel'
import { useCards } from './useCards'

type SaveState = 'saved' | 'saving' | 'error'

export function ComboEditor({ comboId }: { comboId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const cards = useCards()
  const [record, setRecord] = useState<ComboRecord | null | undefined>(undefined)
  const [all, setAll] = useState<ComboRecord[]>([])
  const [readError, setReadError] = useState<string[] | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [save, setSave] = useState<SaveState>('saved')
  const [tabSel, setTabSel] = useState<'steps' | 'setup' | 'info'>('steps')

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

  const title = doc.meta.title[i18n.language === 'it' ? 'it' : 'en'] ?? doc.meta.title.it ?? doc.meta.title.en ?? t('combos.untitled')
  const store = useEditor.getState()

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <Tooltip label={t('combos.backToList')}>
          <Link to="/combo" aria-label={t('combos.backToList')} className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
            <ArrowLeft size={20} aria-hidden />
          </Link>
        </Tooltip>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight md:text-[26px]">{title}</h1>
          <p className="truncate text-sm text-muted" data-testid="save-state" role="status">
            {readOnly ? t('combos.readOnly') : t(`combos.save.${save}`)}
          </p>
        </div>
        <Tooltip label={`${t('combos.undo')} (Ctrl+Z)`}>
          <IconButton label={t('combos.undo')} icon={<Undo2 size={20} />} disabled={!canUndo} onClick={() => store.undo()} data-testid="undo" />
        </Tooltip>
        <Tooltip label={`${t('combos.redo')} (Ctrl+Shift+Z)`}>
          <IconButton label={t('combos.redo')} icon={<Redo2 size={20} />} disabled={!canRedo} onClick={() => store.redo()} data-testid="redo" />
        </Tooltip>
      </header>

      {readOnly ? <Banner tone="warn" title={t('combos.readOnly')}>{t('combos.readOnlyBody')}</Banner> : null}

      <div className="grid items-start gap-6 lg:grid-cols-[clamp(340px,calc((100dvh-210px)*0.709),56%)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Board doc={doc} state={state} mode={mode} cursor={cursor} readOnly={readOnly} />
        </div>
        <Tabs
          value={tabSel}
          onValueChange={(v) => {
            setTabSel(v as typeof tabSel)
            store.setMode(v === 'setup' ? 'setup' : 'steps')
          }}
          className="min-w-0 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto lg:pr-1"
        >
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
      </div>
    </div>
  )
}
