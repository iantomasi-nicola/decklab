import { useTranslation } from 'react-i18next'
import type { SidePlan } from '@/domain/side'
import { Dialog } from '@/ui/Dialog'
import { PlanSummary } from './PlanList'

export function CopyFromDialog({ open, onOpenChange, plans, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; plans: SidePlan[]; onPick: (p: SidePlan) => void }) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('side.copyFrom.title')} description={t('side.copyFrom.lead')}>
      {plans.length ? (
        <ul className="flex flex-col gap-2">
          {plans.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-testid="copy-from-item"
                onClick={() => {
                  onPick(p)
                  onOpenChange(false)
                }}
                className="block min-h-11 w-full cursor-pointer rounded-md border border-line bg-surface-2 p-3 text-left hover:bg-surface-3"
              >
                <PlanSummary plan={p} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-[15px] text-muted">{t('side.copyFrom.empty')}</p>
      )}
    </Dialog>
  )
}
