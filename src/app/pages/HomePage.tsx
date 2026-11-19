import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ChevronRight from 'lucide-react/icons/chevron-right'
import Library from 'lucide-react/icons/library'
import { EmptyState } from '@/ui/EmptyState'
import { Surface } from '@/ui/Surface'
import { NAV } from '../nav'

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

      <EmptyState icon={<Library size={28} />} title={t('home.emptyTitle')} description={t('home.emptyBody')} />
    </>
  )
}
