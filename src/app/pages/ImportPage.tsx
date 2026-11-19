import { useTranslation } from 'react-i18next'
import { useLocation } from '@tanstack/react-router'
import { ImportView } from '@/features/share/ImportView'
import { PageHeader } from '../PageHeader'

export function ImportPage() {
  const { t } = useTranslation()
  const hash = useLocation({ select: (l) => l.hash })
  return (
    <>
      <PageHeader title={t('importPage.title')} lead={t('importPage.lead')} />
      <ImportView initialText={hash ? `#${hash}` : undefined} />
    </>
  )
}
