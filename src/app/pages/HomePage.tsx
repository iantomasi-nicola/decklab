import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ChevronRight from 'lucide-react/icons/chevron-right'
import Library from 'lucide-react/icons/library'
import Workflow from 'lucide-react/icons/workflow'
import { repos } from '@/data/repo'
import { useObservable } from '@/features/decks/useObservable'
import { localized } from '@/i18n'
import { EmptyState } from '@/ui/EmptyState'
import { Skeleton } from '@/ui/Skeleton'
import { Surface } from '@/ui/Surface'
import { NAV } from '../nav'

/** Ultime modifiche: mazzi e combo più recenti (o lo stato vuoto se non c'è ancora nulla). */
function Recent() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const variants = useObservable(() => repos.variants.watchList(), [])
  const combos = useObservable(() => repos.combos.watchList(), [])
  if (!variants.loaded || !combos.loaded) return <Skeleton className="h-64 w-full rounded-lg" aria-label={t('common.loading')} />
  const rows = [
    ...(variants.value ?? []).map((v) => ({ kind: 'deck' as const, id: v.id, name: localized(v.name, lang, t('decks.defaultVariantName')), at: v.updatedAt })),
    ...(combos.value ?? []).map((c) => ({ kind: 'combo' as const, id: c.id, name: localized(c.name ?? {}, lang, t('combos.untitled')), at: c.updatedAt })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5)
  if (!rows.length) return <EmptyState icon={<Library size={28} />} title={t('home.emptyTitle')} description={t('home.emptyBody')} />
  const fmt = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <section aria-labelledby="recent-title">
      <h2 id="recent-title" className="mb-3 text-sm font-medium text-muted">
        {t('home.recentTitle')}
      </h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            {r.kind === 'deck' ? (
              <Link to="/mazzi/$variantId" params={{ variantId: r.id }} className="block rounded-lg">
                <RecentRow icon={<Library size={20} />} name={r.name} kind={t('home.recentDeck')} at={fmt.format(new Date(r.at))} />
              </Link>
            ) : (
              <Link to="/combo/$comboId" params={{ comboId: r.id }} className="block rounded-lg">
                <RecentRow icon={<Workflow size={20} />} name={r.name} kind={t('home.recentCombo')} at={fmt.format(new Date(r.at))} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentRow({ icon, name, kind, at }: { icon: React.ReactNode; name: string; kind: string; at: string }) {
  return (
    <Surface interactive className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium">{name}</span>
        <span className="block truncate text-sm text-muted">
          {kind} · {at}
        </span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-subtle" />
    </Surface>
  )
}

const QUICK = ['archetypes', 'decks', 'combos', 'learn'] as const

export function HomePage() {
  const { t } = useTranslation()
  const items = QUICK.map((k) => NAV.find((n) => n.key === k)!)
  return (
    <>
      <header className="mb-8 md:mb-10">
        <h1 className="max-w-[18ch] text-[34px] font-semibold leading-[1.1] tracking-tight md:text-4xl lg:text-5xl">{t('home.greeting')}</h1>
        <p className="mt-3 max-w-[56ch] text-base text-muted md:text-lg">{t('home.lead')}</p>
      </header>

      <section aria-labelledby="quick-title" className="@container mb-8">
        <h2 id="quick-title" className="mb-3 text-sm font-medium text-muted">
          {t('home.quickTitle')}
        </h2>
        <ul className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
          {items.map(({ to, key, Icon }) => (
            <li key={to}>
              <Link to={to} className="block rounded-lg">
                <Surface interactive className="flex min-h-16 items-center gap-4 px-4 py-3">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
                    <Icon size={20} />
                  </span>
                  <span className="flex-1 text-[15px] font-medium">{t(`home.quick.${key}`)}</span>
                  <ChevronRight aria-hidden size={18} className="text-subtle" />
                </Surface>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Recent />
    </>
  )
}
