import { useCallback, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeftRight from 'lucide-react/icons/arrow-left-right'
import Library from 'lucide-react/icons/library'
import { repos } from '@/data/repo'
import { emptyPlanData, validateSidePlan, type SidePlan, type SideValidation } from '@/domain/side'
import { PageHeader } from '@/app/PageHeader'
import { findBanlist, noLimits, useCards } from '@/features/decks/cardData'
import { NativeSelect } from '@/features/decks/fields'
import { useObservable } from '@/features/decks/useObservable'
import { useLocalized } from '@/i18n'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { EmptyState } from '@/ui/EmptyState'
import { Skeleton } from '@/ui/Skeleton'
import { useContainerWidth, useLang, useRoles } from './hooks'
import { NewPlanDialog, ARCHETYPE_LIST_ID, type NewPlanValues } from './NewPlanDialog'
import { PlanEditor } from './PlanEditor'
import { PlanList } from './PlanList'
import './locales'

const LS_KEY = 'combolab.side.variant'
const readPref = (): string | null => {
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}
const writePref = (id: string) => {
  try {
    localStorage.setItem(LS_KEY, id)
  } catch {
    /* storage non disponibile */
  }
}

/** Contenitore largo: elenco dei matchup a sinistra e editor a destra. */
const SPLIT_PX = 900
/** Contenitore abbastanza largo per OUT e IN affiancati. */
const TWO_LANES_PX = 640

export function SideView() {
  const { t } = useTranslation()
  const lang = useLang()
  const { l } = useLocalized()
  const cards = useCards()
  const { value: archetypes } = useObservable(() => repos.archetypes.watchList(), [])
  const { value: variants, loaded } = useObservable(() => repos.variants.watchList(), [])
  const [pref, setPref] = useState<string | null>(readPref)
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const { width, setEl } = useContainerWidth()
  const split = width >= SPLIT_PX

  const options = useMemo(() => {
    const arch = new Map((archetypes ?? []).map((a) => [a.id, a]))
    return (variants ?? [])
      .filter((v) => arch.has(v.archetypeId))
      .map((v) => ({ v, label: `${l(arch.get(v.archetypeId)!.name, t('side.untitledVariant'))} · ${l(v.name, t('side.untitledVariant'))}` }))
      .sort((a, b) => a.label.localeCompare(b.label, lang))
  }, [archetypes, variants, l, lang, t])

  const variantId = options.find((o) => o.v.id === pref)?.v.id ?? options[0]?.v.id ?? null
  const variant = options.find((o) => o.v.id === variantId)
  const { value: plansRaw, loaded: plansLoaded } = useObservable(() => (variantId ? repos.sidePlans.watchByVariant(variantId) : emptyObservable()), [variantId])
  const plans = useMemo<SidePlan[]>(
    () => [...(plansRaw ?? [])].sort((a, b) => a.matchup.name.localeCompare(b.matchup.name, lang) || a.matchup.turn.localeCompare(b.matchup.turn)),
    [plansRaw, lang],
  )

  const ready = cards.status === 'ready' ? cards : null
  const index = ready?.index
  const canonical = useCallback((id: number) => index?.canonicalId(id) ?? id, [index])
  const roles = useRoles(variantId, canonical)
  const banlist = useMemo(() => {
    if (!ready || !variant) return undefined
    return findBanlist(ready.banlists, variant.v.banlist) ?? noLimits(variant.v.banlist)
  }, [ready, variant])

  // Un matchup appena creato o ripristinato compare nell'elenco con qualche ms di ritardo: un id non ancora (o non più)
  // presente vale "nessuna selezione". Con il contenitore largo l'editor mostra sempre un matchup.
  const selectedId = plans.some((p) => p.id === openId) ? openId : split && plans.length ? plans[0]!.id : null
  const selected = plans.find((p) => p.id === selectedId)

  const validations = useMemo(() => {
    const m = new Map<string, SideValidation>()
    if (!variant || !index) return m
    for (const p of plans) m.set(p.id, validateSidePlan(variant.v.deck, p, { rules: variant.v.rules, ...(banlist ? { banlist } : {}), index }))
    return m
  }, [plans, variant, banlist, index])

  const archetypeNames = useMemo(() => {
    if (!ready) return []
    const names = new Set<string>()
    for (const a of ready.archetypes) names.add(lang === 'it' ? (a.name.it ?? a.name.en) : a.name.en)
    return [...names].sort((a, b) => a.localeCompare(b, lang))
  }, [ready, lang])

  const create = async (v: NewPlanValues) => {
    if (!variantId) return
    const data = emptyPlanData(v.name || t('side.untitledPlan'), v.turn, v.archetype)
    const row = await repos.sidePlans.create({ variantId, ...data })
    setOpenId(row.id)
  }

  const chooseVariant = (id: string) => {
    setPref(id)
    writePref(id)
    setOpenId(null)
  }

  const noCards = cards.status === 'loading' || !loaded
  const header = <PageHeader title={t('side.title')} lead={t('side.lead')} />

  if (!noCards && !options.length) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<ArrowLeftRight size={28} />}
          title={t('side.noVariants.title')}
          description={t('side.noVariants.body')}
          action={
            <Link to="/mazzi" className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 text-[15px] font-medium text-accent-fg hover:bg-accent-hover">
              <Library aria-hidden size={18} />
              {t('side.noVariants.action')}
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div ref={setEl} data-testid="side-view" data-split={split}>
      {/* Su telefono, con un matchup aperto, resta solo l'editor */}
      <div className={cn(!split && selected && 'hidden')}>{header}</div>

      {noCards || !variant ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full max-w-md" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <div className={cn('mb-4 max-w-md', !split && selected && 'hidden')}>
            <NativeSelect aria-label={t('side.variantLabel')} data-testid="side-variant" value={variantId ?? ''} onChange={(e) => chooseVariant(e.target.value)}>
              {options.map((o) => (
                <option key={o.v.id} value={o.v.id}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <datalist id={ARCHETYPE_LIST_ID}>
            {archetypeNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {!plansLoaded ? (
            <div aria-busy="true" className="flex flex-col gap-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !plans.length ? (
            <EmptyState
              icon={<ArrowLeftRight size={28} />}
              title={t('side.noPlans.title')}
              description={t('side.noPlans.body')}
              action={
                <Button variant="primary" onClick={() => setNewOpen(true)} data-testid="side-new">
                  {t('side.new')}
                </Button>
              }
            />
          ) : (
            <div className={cn(split && 'grid grid-cols-[300px_minmax(0,1fr)] items-start gap-6')}>
              <PlanList
                plans={plans}
                validations={validations}
                selectedId={selectedId}
                onSelect={setOpenId}
                onNew={() => setNewOpen(true)}
                className={cn(!split && selected && 'hidden', split && 'sticky top-20')}
              />
              {selected && index ? (
                <PlanEditor
                  key={selected.id}
                  plan={selected}
                  others={plans.filter((p) => p.id !== selected.id)}
                  variant={variant.v}
                  variantName={variant.label}
                  index={index}
                  banlist={banlist}
                  roles={roles}
                  twoLanes={(split ? width - 300 - 24 : width) >= TWO_LANES_PX}
                  {...(split ? {} : { onBack: () => setOpenId(null) })}
                  onSelect={setOpenId}
                  onDeleted={() => setOpenId(null)}
                />
              ) : null}
            </div>
          )}
        </>
      )}

      <NewPlanDialog open={newOpen} onOpenChange={setNewOpen} onCreate={(v) => void create(v)} />
    </div>
  )
}

/** Observable vuoto (nessuna variante scelta). */
function emptyObservable() {
  return {
    subscribe(observer: { next?: (v: SidePlan[]) => void }) {
      observer.next?.([])
      return { unsubscribe() {}, closed: false }
    },
  } as never
}
