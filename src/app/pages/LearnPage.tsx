import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import GraduationCap from 'lucide-react/icons/graduation-cap'
import { buttonClasses } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { PageHeader } from '../PageHeader'

export function LearnPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('learn.title')} />
      <EmptyState
        icon={<GraduationCap size={28} />}
        title={t('learn.emptyTitle')}
        description={t('learn.emptyBody')}
        action={
          <Link to="/combo" className={buttonClasses('primary')}>
            {t('learn.emptyAction')}
          </Link>
        }
      />
    </>
  )
}
