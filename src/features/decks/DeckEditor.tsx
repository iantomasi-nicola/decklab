import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import Undo2 from 'lucide-react/icons/undo-2'
import Redo2 from 'lucide-react/icons/redo-2'
import LayoutGrid from 'lucide-react/icons/layout-grid'
import List from 'lucide-react/icons/list'
import Upload from 'lucide-react/icons/upload'
import Share2 from 'lucide-react/icons/share-2'
import Settings2 from 'lucide-react/icons/settings-2'
import Plus from 'lucide-react/icons/plus'
import Library from 'lucide-react/icons/library'
import type { Card, DeckLists, Rules } from '@/domain/types'
import { checkDeck } from '@/domain/legality/checkDeck'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { Badge } from '@/ui/Badge'
import { BottomSheet } from '@/ui/BottomSheet'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/Dialog'
import { EmptyState } from '@/ui/EmptyState'
import { IconButton } from '@/ui/IconButton'
import { Skeleton } from '@/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { Tooltip } from '@/ui/Tooltip'
import { BanlistSelect } from './BanlistSelect'
import { banlistLabel, findBanlist, noLimits, sameRef, useCards, type BanlistRef } from './cardData'
import { CardSearch } from './CardSearch'
import { DeckSection, SectionCounter, type DeckView } from './DeckSection'
import { DeckStatsPanel } from './DeckStatsPanel'
import {
  addCard, defaultSection, moveCard, newHistory, pushState, redoState, removeAll, removeCard, replacePresent, SECTION_LIMITS, SECTIONS, undoState,
  type Section,
} from './deckOps'
import { ExportDialog } from './ExportDialog'
import { ImportBox } from './ImportBox'
import { LegalityBanner } from './LegalityBanner'
import { issuesByCard } from './legalityView'
import { useObservable } from './useObservable'
import { VariantDialog } from './VariantDialog'

const WIDE_PX = 704
const deckKey = (d: DeckLists) => `${d.main.join(',')}|${d.extra.join(',')}|${d.side.join(',')}`

const isTextTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function useWide(ref: React.RefObject<HTMLElement | null>) {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWide((e?.contentRect.width ?? 0) >= WIDE_PX))
    ro.observe(el)
    setWide(el.clientWidth >= WIDE_PX)
    return () => ro.disconnect()
  }, [ref])
  return wide
}

function EditorSkeleton() {
  return (
    <div aria-busy="true" data-testid="editor-skeleton">
      <Skeleton className="mb-3 h-5 w-40" />
      <Skeleton className="mb-4 h-9 w-72 max-w-full" />
      <Skeleton className="mb-4 h-11 w-full" />
      <Skeleton className="mb-4 h-24 w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="aspect-[59/86] w-full" />
        ))}
      </div>
    </div>
  )
}

export function DeckEditor({ variantId }: { variantId: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const cards = useCards()
  const { value: variant, loaded } = useObservable(() => repos.variants.watch(variantId), [variantId])
  const { value: archetype } = useObservable(() => repos.archetypes.watch(variant?.archetypeId ?? ''), [variant?.archetypeId])

  const rootRef = useRef<HTMLDivElement>(null)
  const wide = useWide(rootRef)

  const [hist, setHist] = useState(() => newHistory<DeckLists>({ main: [], extra: [], side: [] }))
  const [rules, setRules] = useState<Rules>('TCG')
  const [banRef, setBanRef] = useState<BanlistRef>({ format: 'TCG', id: '' })
  const [view, setView] = useState<DeckView>('grid')
  const [tab, setTab] = useState('main')
  const [sheet, setSheet] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [save, setSave] = useState<'saved' | 'saving'>('saved')
  const [announce, setAnnounce] = useState('')

  const deck = hist.present
  const deckRef = useRef(deck)
  deckRef.current = deck
  const initialised = useRef(false)
  const savedKey = useRef('')
  const lastSingle = useRef<{ id: number; section: Section } | null>(null)

  /* ---- sincronizzazione con il database ---- */
  useEffect(() => {
    if (!variant) return
    setRules(variant.rules)
    setBanRef(variant.banlist)
    const key = deckKey(variant.deck)
    if (!initialised.current) {
      initialised.current = true
      savedKey.current = key
      setHist(newHistory(variant.deck))
    } else if (key !== savedKey.current && deckKey(deckRef.current) === savedKey.current) {
      // modifica arrivata da fuori (sync) e nessuna modifica locale in sospeso
      savedKey.current = key
      setHist(newHistory(variant.deck))
    }
  }, [variant])

  const flush = useCallback(async () => {
    if (!initialised.current) return
    const d = deckRef.current
    const key = deckKey(d)
    if (key === savedKey.current) return
    savedKey.current = key
    await repos.variants.update(variantId, { deck: d })
    setSave('saved')
  }, [variantId])

  useEffect(() => {
    if (!initialised.current || deckKey(deck) === savedKey.current) return
    setSave('saving')
    const id = setTimeout(() => void flush(), 350)
    return () => clearTimeout(id)
  }, [deck, flush])

  useEffect(() => {
    const onHide = () => void flush()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      void flush()
    }
  }, [flush])

  /* ---- azioni sul mazzo (tutte con cronologia) ---- */
  const commit = useCallback((fn: (d: DeckLists) => DeckLists) => setHist((h) => pushState(h, fn(h.present))), [])
  const actions = useMemo(
    () => ({
      add: (s: Section, id: number) => commit((d) => addCard(d, s, id)),
      remove: (s: Section, id: number) => commit((d) => removeCard(d, s, id)),
      move: (from: Section, to: Section, id: number) => commit((d) => moveCard(d, from, to, id)),
      removeAll: (s: Section, id: number) => commit((d) => removeAll(d, s, id)),
    }),
    [commit],
  )
  const undo = useCallback(() => setHist(undoState), [])
  const redo = useCallback(() => setHist(redoState), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextTarget(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) (e.preventDefault(), undo())
      else if ((k === 'z' && e.shiftKey) || k === 'y') (e.preventDefault(), redo())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  /* ---- calcoli derivati ---- */
  const ready = cards.status === 'ready' ? cards : null
  const banlist = useMemo(() => (ready ? (findBanlist(ready.banlists, banRef) ?? noLimits(banRef)) : null), [ready, banRef])
  const banlistMissing = !!ready && !findBanlist(ready.banlists, banRef)
  const issues = useMemo(() => (ready && banlist ? checkDeck(deck, banlist, rules, ready.index) : []), [ready, banlist, deck, rules])
  const issueMap = useMemo(() => issuesByCard(issues), [issues])
  const copiesMap = useMemo(() => {
    const m = new Map<number, number>()
    if (!ready) return m
    for (const s of SECTIONS) for (const id of deck[s]) m.set(ready.index.canonicalId(id), (m.get(ready.index.canonicalId(id)) ?? 0) + 1)
    return m
  }, [ready, deck])
  const copies = useCallback((canon: number) => copiesMap.get(canon) ?? 0, [copiesMap])

  const say = (card: Card, section: Section) => {
    const n = deckRef.current[section].filter((x) => x === card.id).length + 1
    setAnnounce(t('deck.announce.added', { name: card.name[lang] ?? card.name.en, section: t(`deck.section.${section}`), count: n }))
  }
  const onAdd = (card: Card) => {
    const section = defaultSection(card)
    lastSingle.current = { id: card.id, section }
    commit((d) => addCard(d, section, card.id))
    say(card, section)
  }
  const onDoubleAdd = (card: Card) => {
    const prev = lastSingle.current
    lastSingle.current = null
    if (prev && prev.id === card.id) setHist((h) => replacePresent(h, addCard(removeCard(h.present, prev.section, card.id), 'side', card.id)))
    else commit((d) => addCard(d, 'side', card.id))
    say(card, 'side')
  }
  const onAddSide = (card: Card) => {
    lastSingle.current = null
    commit((d) => addCard(d, 'side', card.id))
    say(card, 'side')
  }

  const changeBanlist = (r: BanlistRef) => {
    if (sameRef(r, banRef)) return
    setBanRef(r)
    void repos.variants.update(variantId, { banlist: r })
  }

  const replaceDeck = (next: DeckLists) => {
    commit(() => next)
    setImportOpen(false)
    toast(t('deck.replaced'), { action: { label: t('common.undo'), onClick: undo }, durationMs: 8000 })
  }

  /* ---- stati speciali ---- */
  if (cards.status === 'error')
    return <EmptyState icon={<Library size={28} />} title={t('deck.dataError.title')} description={t('deck.dataError.body', { message: cards.message })} action={<Button onClick={() => location.reload()}>{t('common.retry')}</Button>} />
  if (!loaded || cards.status === 'loading') return <EditorSkeleton />
  if (!variant || variant.deletedAt !== null || !ready || !banlist)
    return (
      <EmptyState
        icon={<Library size={28} />}
        title={t('deck.notFound.title')}
        description={t('deck.notFound.body')}
        action={
          <Link to="/mazzi" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-medium text-accent-fg hover:bg-accent-hover">
            {t('deck.notFound.action')}
          </Link>
        }
      />
    )

  const name = localized(variant.name, lang, t('decks.defaultVariantName'))
  const archName = archetype ? localized(archetype.name, lang, t('archetypes.untitled')) : ''
  const label = banlistLabel(banRef)

  const sectionProps = {
    deck,
    view,
    index: ready.index,
    lang,
    banlist,
    issueMap,
    ...actions,
  } as const

  const sectionBlock = (s: Section) => (
    <section key={s} aria-labelledby={`h-${s}`} className="flex flex-col gap-3" data-testid={`section-${s}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`h-${s}`} className="text-lg font-semibold text-fg">
          {t(`deck.section.${s}`)}
        </h2>
        <span className="flex items-baseline gap-3 text-sm text-muted">
          <span className="hidden @lg:inline">{t('deck.limitHint', SECTION_LIMITS[s])}</span>
          <SectionCounter section={s} count={deck[s].length} />
        </span>
      </div>
      <DeckSection section={s} {...sectionProps} />
    </section>
  )

  const search = (autoFocus: boolean) => (
    <CardSearch
      index={ready.index}
      banlist={banlist}
      rules={rules}
      lang={lang}
      copies={copies}
      onAdd={onAdd}
      onDoubleAdd={onDoubleAdd}
      onAddSide={onAddSide}
      autoFocus={autoFocus}
    />
  )

  const countsLine = SECTIONS.map((s) => `${t(`deck.section.${s}`)} ${deck[s].length}/${SECTION_LIMITS[s].max}`).join(' · ')

  return (
    <div ref={rootRef} className="@container flex flex-col gap-4" data-testid="deck-editor" data-wide={wide}>
      <div>
        {archetype ? (
          <Link
            to="/archetipi/$archetypeId"
            params={{ archetypeId: archetype.id }}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[15px] text-muted hover:text-fg"
          >
            <ArrowLeft aria-hidden size={16} />
            <span className="truncate">{archName}</span>
          </Link>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight [overflow-wrap:anywhere] md:text-[30px]" data-testid="deck-title">
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{rules}</Badge>
              <Badge>{label}</Badge>
              <span className="text-sm text-subtle" role="status" data-testid="save-state" data-state={save}>
                {save === 'saving' ? t('deck.saving') : t('deck.saved')}
              </span>
            </div>
          </div>
          <Tooltip label={t('deck.settings')}>
            <IconButton label={t('deck.settings')} variant="secondary" icon={<Settings2 size={20} />} onClick={() => setSettingsOpen(true)} data-testid="open-settings" />
          </Tooltip>
        </div>
      </div>

      <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between">
        <label className="flex min-w-0 flex-col gap-1 @lg:w-72">
          <span className="text-sm font-medium text-fg">{t('deck.banlist')}</span>
          <BanlistSelect label={t('deck.banlist')} banlists={ready.banlists} value={banRef} onChange={changeBanlist} />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('deck.toolbar')}>
          <Tooltip label={`${t('deck.undo')} (Ctrl+Z)`}>
            <IconButton label={t('deck.undo')} variant="secondary" icon={<Undo2 size={20} />} disabled={!hist.past.length} onClick={undo} data-testid="undo" />
          </Tooltip>
          <Tooltip label={`${t('deck.redo')} (Ctrl+Shift+Z)`}>
            <IconButton label={t('deck.redo')} variant="secondary" icon={<Redo2 size={20} />} disabled={!hist.future.length} onClick={redo} data-testid="redo" />
          </Tooltip>
          <div role="group" aria-label={t('deck.view.label')} className="flex rounded-md border border-line bg-surface-2 p-0.5">
            <IconButton
              label={t('deck.view.grid')}
              icon={<LayoutGrid size={20} />}
              variant={view === 'grid' ? 'primary' : 'ghost'}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              data-testid="view-grid"
              className="size-11"
            />
            <IconButton
              label={t('deck.view.list')}
              icon={<List size={20} />}
              variant={view === 'list' ? 'primary' : 'ghost'}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              data-testid="view-list"
              className="size-11"
            />
          </div>
          <Tooltip label={t('deck.import')}>
            <IconButton label={t('deck.import')} variant="secondary" icon={<Upload size={20} />} onClick={() => setImportOpen(true)} data-testid="open-import" />
          </Tooltip>
          <Tooltip label={t('deck.export')}>
            <IconButton label={t('deck.export')} variant="secondary" icon={<Share2 size={20} />} onClick={() => setExportOpen(true)} data-testid="open-export" />
          </Tooltip>
        </div>
      </div>

      <LegalityBanner issues={issues} rules={rules} banlistLabel={label} banlistMissing={banlistMissing} index={ready.index} lang={lang} />

      {wide ? (
        <div className="grid grid-cols-[minmax(280px,380px)_minmax(0,1fr)] items-start gap-5">
          <aside
            aria-label={t('deck.search.panel')}
            className="sticky top-[72px] flex h-[calc(100dvh-96px)] min-h-[420px] flex-col rounded-lg border border-line bg-surface-1 p-3"
          >
            {search(false)}
          </aside>
          <div className="flex min-w-0 flex-col gap-8">
            {SECTIONS.map(sectionBlock)}
            <section aria-labelledby="h-stats" className="flex flex-col gap-3">
              <h2 id="h-stats" className="text-lg font-semibold text-fg">
                {t('deck.stats.title')}
              </h2>
              <DeckStatsPanel deck={deck} index={ready.index} />
            </section>
          </div>
        </div>
      ) : (
        <>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label={t('deck.sections')}>
              {SECTIONS.map((s) => (
                <TabsTrigger key={s} value={s} data-testid={`tab-${s}`}>
                  {t(`deck.section.${s}`)}
                  <span className="ml-1.5 text-subtle tabular-nums">{deck[s].length}</span>
                </TabsTrigger>
              ))}
              <TabsTrigger value="stats" data-testid="tab-stats">
                {t('deck.stats.title')}
              </TabsTrigger>
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent key={s} value={s}>
                {sectionBlock(s)}
              </TabsContent>
            ))}
            <TabsContent value="stats">
              <DeckStatsPanel deck={deck} index={ready.index} />
            </TabsContent>
          </Tabs>
          <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottomnav-h)+16px+env(safe-area-inset-bottom,0px))] z-30 flex justify-end">
            <Button
              variant="primary"
              className={cn('pointer-events-auto min-h-12 rounded-full px-5 shadow-3')}
              icon={<Plus size={20} />}
              onClick={() => setSheet(true)}
              data-testid="open-search"
            >
              {t('deck.addCards')}
            </Button>
          </div>
          <BottomSheet open={sheet} onOpenChange={setSheet} title={t('deck.addCards')} description={countsLine}>
            <div className="h-[68dvh]">{search(false)}</div>
          </BottomSheet>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite" data-testid="announce">
        {announce}
      </p>

      <Dialog open={importOpen} onOpenChange={setImportOpen} title={t('deck.importTitle')} description={t('deck.importBody')} className="max-w-xl">
        <ImportBox index={ready.index} lang={lang} onDeck={(d) => replaceDeck(d)} />
      </Dialog>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} deck={deck} index={ready.index} lang={lang} name={name} />
      <VariantDialog open={settingsOpen} onOpenChange={setSettingsOpen} mode="edit" variant={variant} />
    </div>
  )
}
