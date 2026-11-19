import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { toast } from '@/ui/Toast'
import { PageHeader } from '../PageHeader'

export function PlaceholderPage({ ns, icon, hasAction = true }: { ns: string; icon: ReactNode; hasAction?: boolean }) {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t(`${ns}.title`)} />
      <EmptyState
        icon={icon}
        title={t(`${ns}.emptyTitle`)}
        description={t(`${ns}.emptyBody`)}
        action={
          hasAction ? (
            <Button variant="primary" onClick={() => toast(t('common.comingSoon'))}>
              {t(`${ns}.emptyAction`)}
            </Button>
          ) : undefined
        }
      />
    </>
  )
}
