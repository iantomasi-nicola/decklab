import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ChartColumn from 'lucide-react/icons/chart-column'
import Download from 'lucide-react/icons/download'
import Upload from 'lucide-react/icons/upload'
import { applyOverride, composition, diffHands, mergeCards, planToSwaps, roundPlan, tournament, type HandInput, type StatsCard, type TournamentPlan } from '@/domain/stats'
import { repos } from '@/data/repo'
import { useLocalized } from '@/i18n'
import { PageHeader } from '@/app/PageHeader'
import { Banner } from '@/ui/Banner'
import { Button, buttonBase } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { Segmented } from '@/ui/Segmented'
import { Skeleton } from '@/ui/Skeleton'
import { Switch } from '@/ui/Switch'
import { Tabs, TabsContent, TabsTrigger } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'
import { cn } from '@/ui/cn'
import { NativeSelect } from '@/features/decks/fields'
import { useObservable } from '@/features/decks/useObservable'
import { CompositionTab } from './CompositionTab'
import { HandTab, type SideView } from './HandTab'
import { Hero } from './Hero'
import { ImportDialog } from './ImportDialog'
import { LabelsTab } from './LabelsTab'
import { RolesTab } from './RolesTab'
import { SensitivityTab } from './SensitivityTab'
import { TournamentTab, asTourMode, type TourMode } from './TournamentTab'
import { buildProject, downloadText, exportText } from './deckspaceIO'
import { useCardNames } from './names'
import { watchSidePlans } from './sidePlanAdapter'
import { ScrollTabsList, Stepper, useLang } from './parts'
import { useAnalysis, useSensitivity, useStatsModel } from './useStatsModel'
import './locales'
import './stats.css'

const LS_KEY = 'combolab.stats.variant'
const readPref = (): string | null => {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

type TabId = 'hand' | 'tournament' | 'sensitivity' | 'composition' | 'roles' | 'labels'
const TABS: TabId[] = ['hand', 'tournament', 'sensitivity', 'composition', 'roles', 'labels']

export function StatsView() {
  const { t } = useTranslation()
  const lang = useLang()
  const { l } = useLocalized()
  const archetypes = useObservable(() => repos.archetypes.watchList(), [])
  const variants = useObservable(() => repos.variants.watchList(), [])
  const [pref, setPref] = useState<string | null>(readPref)
  const [tab, setTab] = useState<TabId>('hand')
  const [sensSeen, setSensSeen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const vs = variants.value ?? []
    return (archetypes.value ?? [])
      .map((a) => ({ a, items: vs.filter((v) => v.archetypeId === a.id) }))
      .filter((g) => g.items.length)
  }, [archetypes.value, variants.value])
  const all = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const variantId = all.find((v) => v.id === pref)?.id ?? all[0]?.id ?? null
  const choose = (id: string) => {
    setPref(id)
    try {
      localStorage.setItem(LS_KEY, id)
    } catch {
      /* ignora */
    }
  }

  const model = useStatsModel(variantId)
  const { saved, update, rows } = model
  const name = useCardNames(model.cards, lang)
  const handSize = saved.settings.useSixCardHand ? 6 : 5
  const archetype = useObservable(() => repos.archetypes.watch(model.variant?.archetypeId ?? ''), [model.variant?.archetypeId]).value
  const sidePlans = useObservable(() => watchSidePlans(variantId ?? '', lang), [variantId, lang]).value ?? []
  const sidePlan = sidePlans.find((p) => p.id === planId) ?? null

  // pre-side = mazzo salvato; post-side = lo stesso con gli scambi del piano (`deckOverride`) e i ruoli delle carte che entrano dal Side
  const preInput = model.input
  const postInput = useMemo<HandInput | null>(() => {
    if (!preInput || !sidePlan) return null
    const profile = (id: number): StatsCard => ({ id, count: 1, tags: saved.tags[String(id)] ?? [], comboWith: saved.partners[String(id)]?.combo ?? [], brickWith: saved.partners[String(id)]?.brick ?? [] })
    return { ...preInput, deckOverride: planToSwaps(sidePlan), pool: [...new Set(sidePlan.ins.map((e) => e.cardId))].map((id) => profile(model.canonical(id))) }
  }, [preInput, sidePlan, saved.tags, saved.partners, model.canonical])
  const activeInput = postInput ?? preInput
  /** Mazzo su cui lavorano composizione, etichette e sensibilità: già con gli scambi applicati. */
  const resolved = useMemo(() => (activeInput ? applyOverride(activeInput) : null), [activeInput])

  const pre = useAnalysis(preInput, 'hands')
  const post = useAnalysis(postInput, 'post')
  const analysis = sidePlan ? post : pre
  const sens = useSensitivity(resolved, handSize, sensSeen)

  useEffect(() => {
    if (tab === 'sensitivity') setSensSeen(true)
  }, [tab])

  const hands = analysis.hands
  const hand = hands?.[handSize]
  const rounds = saved.settings.tournamentRounds
  const mode = asTourMode(saved.settings.tournamentMode)
  const tplan = saved.tournament.plan
  const k = saved.tournament.k
  const [tour, tourMax] = useMemo(() => {
    if (!hands) return [null, null] as const
    const kk = mode === 'atLeast1' ? 1 : k
    const lo = tournament(roundPlan(tplan, rounds, hands[5]?.brick ?? 0, hands[6]?.brick ?? 0), kk)
    const hi = tournament(roundPlan(tplan, rounds, (hands[5]?.brick ?? 0) + (hands[5]?.unknown ?? 0), (hands[6]?.brick ?? 0) + (hands[6]?.unknown ?? 0)), kk)
    return [lo, hi] as const
  }, [hands, tplan, rounds, k, mode])
  const comp = useMemo(
    () =>
      model.cards.status === 'ready' && resolved
        ? composition(mergeCards(resolved.cards).map((c) => ({ card: model.cards.status === 'ready' ? model.cards.index.byId(c.id) : undefined, count: c.count, tags: c.tags })))
        : null,
    [model.cards, resolved],
  )
  const side = useMemo<SideView | null>(() => {
    const preH = pre.hands?.[handSize]
    const postH = post.hands?.[handSize]
    if (!sidePlan || !preH || !postH) return null
    return { matchup: sidePlan.matchup, pre: preH, diff: diffHands(preH, postH), swaps: planToSwaps(sidePlan) }
  }, [sidePlan, pre.hands, post.hands, handSize])

  const header = <PageHeader title={t('statsLab.title')} lead={t('statsLab.lead')} />

  const importDialog = (
    <ImportDialog open={importing} onOpenChange={setImporting} variant={model.variant} rows={rows} canonical={model.canonical} update={update} cards={model.cards} onCreated={choose} />
  )

  if (variants.loaded && archetypes.loaded && !all.length) {
    return (
      <div className="stats-lab">
        {header}
        <EmptyState
          icon={<ChartColumn size={28} />}
          title={t('statsLab.empty.title')}
          description={t('statsLab.empty.body')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/mazzi" className={cn(buttonBase, 'bg-accent text-accent-fg hover:bg-accent-hover shadow-1')}>
                {t('statsLab.empty.action')}
              </Link>
              <Button variant="secondary" icon={<Upload size={18} />} onClick={() => setImporting(true)}>
                {t('statsLab.import.open')}
              </Button>
            </div>
          }
        />
        {importDialog}
      </div>
    )
  }

  const setSettings = (patch: Partial<typeof saved.settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const exportFile = () => {
    if (!model.variant) return
    const text = exportText(buildProject(model.variant, rows, saved, (id) => (model.cards.status === 'ready' ? (model.cards.index.byId(id)?.name.en ?? String(id)) : String(id)), model.canonical))
    downloadText(`${(model.variant.name.en ?? model.variant.name.it ?? 'deck').replace(/[^\w-]+/g, '-')}.deckspace.json`, text)
    toast(t('statsLab.export.done'), { tone: 'ok' })
  }

  const tooSmall = hand ? hand.deckSize < handSize : false
  const loading = !variants.loaded || !archetypes.loaded || !model.ready || !model.variantLoaded || (!hands && !analysis.error) || (!!sidePlan && !pre.hands && !pre.error)

  return (
    <div className="stats-lab">
      {header}
      <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface-1 p-4 md:p-6" aria-label={t('statsLab.setup')}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="stats-variant" className="text-sm font-medium text-fg">
              {t('statsLab.variant')}
            </label>
            <NativeSelect value={variantId ?? ''} onChange={(e) => choose(e.target.value)} id="stats-variant" data-testid="variant-select">
              {groups.map((g) => (
                <optgroup key={g.a.id} label={l(g.a.name, '—')}>
                  {g.items.map((v) => (
                    <option key={v.id} value={v.id}>
                      {l(v.name, '—')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </NativeSelect>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-fg">{t('statsLab.hand.label')}</span>
            <Segmented
              label={t('statsLab.hand.label')}
              value={handSize === 6 ? 'second' : 'first'}
              onValueChange={(v) => setSettings({ useSixCardHand: v === 'second' })}
              options={[
                { value: 'first', label: t('statsLab.hand.first') },
                { value: 'second', label: t('statsLab.hand.second') },
              ]}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1 md:col-span-2">
            <label htmlFor="stats-side" className="text-sm font-medium text-fg">
              {t('statsLab.side.label')}
            </label>
            <NativeSelect value={sidePlan?.id ?? ''} onChange={(e) => setPlanId(e.target.value || null)} id="stats-side" data-testid="side-select">
              <option value="">{t('statsLab.side.pre')}</option>
              {sidePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {t('statsLab.side.option', { matchup: p.matchup })}
                </option>
              ))}
            </NativeSelect>
            {!sidePlans.length ? <p className="text-sm text-muted">{t('statsLab.side.none')}</p> : null}
          </div>
        </div>
        <div className="grid gap-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-col gap-2">
            <Switch
              checked={saved.settings.useAssumedDeckSize}
              onCheckedChange={(v) => setSettings({ useAssumedDeckSize: v })}
              label={t('statsLab.assumed.label')}
              description={t('statsLab.assumed.hint')}
            />
            {saved.settings.useAssumedDeckSize ? (
              <Stepper label={t('statsLab.assumed.size')} value={saved.settings.assumedDeckSize} min={20} max={100} onChange={(n) => setSettings({ assumedDeckSize: n })} className="self-start" />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Upload size={18} />} onClick={() => setImporting(true)}>
              {t('statsLab.import.open')}
            </Button>
            <Button variant="secondary" icon={<Download size={18} />} onClick={exportFile} disabled={!model.variant || !model.ready}>
              {t('statsLab.export.open')}
            </Button>
          </div>
        </div>
      </section>

      {analysis.error ? <Banner tone="danger" title={t('statsLab.error')}>{analysis.error}</Banner> : null}

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : tooSmall ? (
        <Banner tone="warn" title={t('statsLab.tooSmall.title')}>
          {t('statsLab.tooSmall.body', { size: hand!.deckSize, count: handSize })}
        </Banner>
      ) : hand && hands && tour && tourMax ? (
        <>
          <Hero
            hand={hand}
            other={hands[handSize === 5 ? 6 : 5]}
            tour={tour}
            tourMax={tourMax}
            rounds={rounds}
            progress={analysis.progress}
            running={analysis.running}
            side={side ? { matchup: side.matchup, diff: side.diff } : null}
            onConfirm={() => setTab('labels')}
          />
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
            <ScrollTabsList label={t('statsLab.tabsLabel')} activeKey={tab}>
              {TABS.map((id) => (
                <TabsTrigger key={id} value={id} className="shrink-0">
                  {t(`statsLab.tabs.${id}`)}
                </TabsTrigger>
              ))}
            </ScrollTabsList>
            <TabsContent value="hand">
              <HandTab
                hand={hand}
                name={name}
                side={side}
                onOpenLabels={() => setTab('labels')}
                onLabel={(key, label) => update((s) => ({ ...s, labels: { ...s.labels, [key]: label } }))}
              />
            </TabsContent>
            <TabsContent value="tournament">
              <TournamentTab
                tour={tour}
                tourMax={tourMax}
                hands={hands}
                rounds={rounds}
                plan={tplan}
                mode={mode}
                k={k}
                onRounds={(n) => setSettings({ tournamentRounds: n })}
                onPlan={(p: TournamentPlan) => update((s) => ({ ...s, tournament: { ...s.tournament, plan: p } }))}
                onMode={(m: TourMode) => setSettings({ tournamentMode: m })}
                onK={(n) => update((s) => ({ ...s, tournament: { ...s.tournament, k: n } }))}
              />
            </TabsContent>
            <TabsContent value="sensitivity">
              <SensitivityTab state={sens} handSize={handSize} name={name} />
            </TabsContent>
            <TabsContent value="composition">{comp ? <CompositionTab comp={comp} sideMatchup={sidePlan?.matchup ?? null} /> : null}</TabsContent>
            <TabsContent value="roles">
              <RolesTab rows={rows} sideRows={model.sideRows} saved={saved} update={update} name={name} archetype={archetype} />
            </TabsContent>
            <TabsContent value="labels">{resolved ? <LabelsTab input={resolved} saved={saved} update={update} name={name} /> : null}</TabsContent>
          </Tabs>
        </>
      ) : null}

      </div>
      {importDialog}
    </div>
  )
}
