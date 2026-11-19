/** Pagina guida di una combo: /combo/$comboId/guida. */
import { useCallback, useMemo, type ReactNode } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import CircleCheck from 'lucide-react/icons/circle-check'
import CircleHelp from 'lucide-react/icons/circle-help'
import Download from 'lucide-react/icons/download'
import GraduationCap from 'lucide-react/icons/graduation-cap'
import Pencil from 'lucide-react/icons/pencil'
import Play from 'lucide-react/icons/play'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import { exportCompact, exportText } from '@/domain/combo/text'
import type { ComboDoc } from '@/domain/combo/types'
import type { Lang } from '@/domain/types'
import { useCards as useBanlistCards } from '@/features/decks/cardData'
import { useIssueText } from '@/features/decks/LegalityBanner'
import { useCards } from '@/features/combos/useCards'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Menu } from '@/ui/Menu'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { EndBoardSection, HandSection, VariantsSection } from './GuideParts'
import { StepsList, type GuideCtx } from './GuideSteps'
import { endboardState, endSummary, motherDivergence, pickLoc, stepsUsingCards, variantsOf } from './guideModel'
import { legalityOf, limitedCards, type Legality } from './legality'
import './locales'
import { makeNoteResolver, resolveDocNotes } from './notes'
import { useComboDoc } from './useComboDoc'

export const linkBtn = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-1',
  secondary: 'bg-surface-2 text-fg border border-line hover:bg-surface-3',
}
const linkBase =
  'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-md px-4 text-[15px] font-medium leading-none whitespace-nowrap transition-colors duration-150'

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-7 items-center rounded-full border border-line bg-surface-2 px-3 text-sm text-muted', className)}>{children}</span>
}

function LegalityBadge({ legality }: { legality: Legality }) {
  const { t } = useTranslation()
  const base = 'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-3 text-sm font-medium'
  switch (legality.kind) {
    case 'legal':
      return (
        <span data-testid="legality-badge" data-state="legal" className={cn(base, 'border-ok/50 bg-surface-2 text-ok')}>
          <CircleCheck aria-hidden size={16} />
          {t('guide.legal')}
        </span>
      )
    case 'illegal':
      return (
        <span data-testid="legality-badge" data-state="illegal" className={cn(base, 'border-danger/50 bg-surface-2 text-danger')}>
          <TriangleAlert aria-hidden size={16} />
          {t('guide.illegal', { count: legality.issues.length })}
        </span>
      )
    default:
      return (
        <span data-testid="legality-badge" data-state={legality.kind} className={cn(base, 'border-line bg-surface-2 text-muted')}>
          <CircleHelp aria-hidden size={16} />
          {t('guide.unknown')}
        </span>
      )
  }
}

export function GuidePage() {
  const { comboId } = useParams({ strict: false }) as { comboId: string }
  return <GuideView key={comboId} comboId={comboId} />
}

function GuideView({ comboId }: { comboId: string }) {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.language === 'it' ? 'it' : 'en'
  const { load, all } = useComboDoc(comboId)

  if (load.status === 'loading')
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-2 pt-4 md:px-6" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  if (load.status === 'missing' || load.status === 'invalid')
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-2 pt-4 md:px-6">
        <Banner tone="danger" title={t(load.status === 'missing' ? 'guide.notFound' : 'guide.invalid')} />
        <Link to="/combo" className="inline-flex min-h-11 items-center text-accent-text underline">{t('guide.back')}</Link>
      </div>
    )
  return <Guide doc={load.doc} comboId={comboId} lang={lang} all={all} />
}

function Guide({ doc, comboId, lang, all }: { doc: ComboDoc; comboId: string; lang: Lang; all: Parameters<typeof variantsOf>[2] }) {
  const { t } = useTranslation()
  const cards = useCards()
  const banCards = useBanlistCards()
  const ready = banCards.status === 'ready' ? banCards : null

  const nameOf = cards.nameOf
  const nameOfUid = useCallback((uid: string) => (doc.cards[uid] !== undefined ? nameOf(doc.cards[uid]!) : uid), [doc.cards, nameOf])
  const namesOf = useCallback(
    (code: number) => {
      const c = cards.byId(code)
      return c ? [c.name.en, ...(c.name.it ? [c.name.it] : [])] : []
    },
    [cards],
  )
  const resolver = useMemo(() => makeNoteResolver(doc, namesOf), [doc, namesOf])

  const legality = useMemo(() => legalityOf(doc, ready ? { index: ready.index, banlists: ready.banlists } : null), [doc, ready])
  const issueText = useIssueText(ready?.index, lang)
  const flagged = useMemo(
    () => (ready && legality.kind === 'illegal' ? stepsUsingCards(doc, ready.index.canonicalId, limitedCards(legality.issues)) : new Set<string>()),
    [doc, ready, legality],
  )

  const variants = useMemo(() => variantsOf(doc, comboId, all), [doc, comboId, all])
  const mother = useMemo(() => motherDivergence(doc, all.find((r) => r.id === doc.meta.derivedFrom?.comboId)), [doc, all])
  const endState = useMemo(() => endboardState(doc), [doc])

  const title = pickLoc(doc.meta.title, lang) ?? t('combos.untitled')
  const archetype = pickLoc(doc.meta.archetype.name, lang)
  const variant = doc.meta.variant ? pickLoc(doc.meta.variant.name, lang) : undefined
  const subtitle = [archetype, variant].filter(Boolean).join(' / ')

  const ctx: GuideCtx = { doc, lang, nameOf, nameOfUid, resolver, flagged }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('guide.action.copied'), { tone: 'ok' })
    } catch {
      toast(t('guide.action.copyFailed'), { tone: 'danger' })
    }
  }
  const nameIn = (code: number, l: Lang) => {
    const c = cards.byId(code)
    return c ? (c.name[l] ?? c.name.en) : `#${code}`
  }
  const exportable = () => resolveDocNotes(doc, resolver, nameIn)
  const legalityText = legality.kind === 'legal' ? `✔ ${t('guide.legal')}` : legality.kind === 'illegal' ? `✘ ${t('guide.illegal', { count: legality.issues.length })}` : undefined
  const opts = { lang, nameOf: nameIn, ...(legalityText ? { legality: legalityText } : {}) }

  const issues = legality.kind === 'illegal' ? legality.issues : []
  const shownIssues = issues.slice(0, 3)

  return (
    <article className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-2 pb-10 pt-2 md:px-6" data-testid="guide-page">
      <header className="flex flex-col gap-4">
        <Link to="/combo" className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-[15px] text-muted transition-colors duration-150 hover:text-fg">
          <ArrowLeft aria-hidden size={18} />
          {t('guide.back')}
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[28px] font-semibold leading-9 [overflow-wrap:anywhere] md:text-[32px] md:leading-10">{title}</h1>
          {subtitle ? <p className="text-base text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LegalityBadge legality={legality} />
          <Chip>{t('guide.rules', { rules: doc.meta.rules })}</Chip>
          <Chip>{doc.setup.first ? t('guide.first') : t('guide.second')}</Chip>
          <Chip>{t('guide.stepsCount', { count: doc.steps.length })}</Chip>
          {doc.branches.length ? <Chip>{t('guide.branchesCount', { count: doc.branches.length })}</Chip> : null}
        </div>
        {legality.kind === 'illegal' ? (
          <div className="rounded-lg border border-line bg-surface-1 p-3 text-[15px]" data-testid="legality-issues">
            <ul className="flex flex-col gap-1.5">
              {shownIssues.map((i, k) => (
                <li key={k} className="flex gap-2">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-danger" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{issueText(i)}</span>
                </li>
              ))}
            </ul>
            {issues.length > shownIssues.length ? <p className="mt-1.5 text-sm text-muted">{t('guide.moreIssues', { count: issues.length - shownIssues.length })}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted">
            {legality.kind === 'legal'
              ? t('guide.legalHint', { banlist: legality.banlist })
              : legality.kind === 'noDeck'
                ? t('guide.noDeckHint')
                : t('guide.loadingHint')}
          </p>
        )}
        {legality.kind !== 'loading' && legality.kind !== 'noDeck' && legality.missing ? <p className="text-sm text-warn">{t('guide.banlistMissing', { banlist: legality.banlist })}</p> : null}
        <div className="flex flex-wrap items-center gap-2" data-testid="guide-actions">
          <Link to="/combo/$comboId/replay" params={{ comboId }} className={cn(linkBase, linkBtn.primary)} data-testid="guide-replay">
            <Play aria-hidden size={18} />
            {t('guide.action.replay')}
          </Link>
          <Link to="/combo/$comboId" params={{ comboId }} className={cn(linkBase, linkBtn.secondary)} data-testid="guide-edit">
            <Pencil aria-hidden size={18} />
            {t('guide.action.edit')}
          </Link>
          <Button icon={<GraduationCap size={18} />} disabled title={t('guide.action.learnSoon')} aria-label={`${t('guide.action.learn')} (${t('guide.action.learnSoon')})`} data-testid="guide-learn">
            {t('guide.action.learn')}
          </Button>
          <Menu
            trigger={
              <Button icon={<Download size={18} />} data-testid="guide-export">
                {t('guide.action.export')}
              </Button>
            }
            align="start"
            items={[
              { id: 'text', label: t('guide.action.text'), onSelect: () => void copy(exportText(exportable(), opts)) },
              { id: 'compact', label: t('guide.action.compact'), onSelect: () => void copy(exportCompact(exportable(), { ...opts, layout: 'lines' })) },
              { id: 'json', label: t('guide.action.json'), onSelect: () => void copy(JSON.stringify(doc, null, 2)) },
            ]}
          />
        </div>
      </header>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:gap-x-10 lg:gap-y-8">
        <HandSection doc={doc} nameOf={nameOf} className="lg:col-start-2 lg:row-start-1" />
        <section aria-labelledby="guide-steps" className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <h2 id="guide-steps" className="text-lg font-semibold leading-7">{t('guide.steps.title')}</h2>
          <StepsList ctx={ctx} variants={variants} />
        </section>
        <EndBoardSection doc={doc} state={endState} nameOf={nameOf} summary={endSummary(doc, lang)} className="lg:col-start-2 lg:row-start-2" />
        <VariantsSection variants={variants} mother={mother} lang={lang} className="lg:col-start-2 lg:row-start-3" />
      </div>
    </article>
  )
}
