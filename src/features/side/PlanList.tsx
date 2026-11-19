import { useTranslation } from 'react-i18next'
import CircleCheck from 'lucide-react/icons/circle-check'
import CircleDashed from 'lucide-react/icons/circle-dashed'
import Plus from 'lucide-react/icons/plus'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import { totalCount, type SidePlan, type SideValidation } from '@/domain/side'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'

export function PlanSummary({ plan, validation }: { plan: SidePlan; validation?: SideValidation }) {
  const { t } = useTranslation()
  const out = totalCount(plan.outs)
  const inn = totalCount(plan.ins)
  const empty = out + inn === 0
  const status = validation ? (validation.ok ? 'ok' : empty ? 'empty' : 'bad') : null
  const Icon = status === 'ok' ? CircleCheck : status === 'bad' ? TriangleAlert : CircleDashed
  return (
    <span className="flex w-full items-center gap-3">
      {status ? (
        <span
          data-testid="plan-status"
          data-status={status}
          title={t(status === 'ok' ? 'side.statusOk' : status === 'bad' ? 'side.statusBad' : 'side.statusEmpty')}
          className={cn('shrink-0', status === 'ok' ? 'text-ok' : status === 'bad' ? 'text-warn' : 'text-subtle')}
        >
          <Icon aria-hidden size={20} />
          <span className="sr-only">{t(status === 'ok' ? 'side.statusOk' : status === 'bad' ? 'side.statusBad' : 'side.statusEmpty')}</span>
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-fg">{plan.matchup.name || t('side.untitledPlan')}</span>
        <span className="block truncate text-sm text-muted">{plan.matchup.archetype || t('side.noArchetype')}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone="neutral">{t(`side.turn.${plan.matchup.turn}`)}</Badge>
        <span className="text-sm font-semibold tabular-nums">
          <span className="text-danger">−{out}</span> <span className="text-ok">+{inn}</span>
        </span>
      </span>
    </span>
  )
}

export function PlanList({
  plans,
  validations,
  selectedId,
  onSelect,
  onNew,
  className,
}: {
  plans: SidePlan[]
  validations: Map<string, SideValidation>
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <section aria-label={t('side.listLabel')} className={cn('flex flex-col gap-3', className)} data-testid="plan-list">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('side.listTitle')}</h2>
        <Button variant="primary" icon={<Plus size={18} />} onClick={onNew} data-testid="side-new">
          {t('side.new')}
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {plans.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              data-testid="plan-item"
              aria-current={p.id === selectedId ? 'true' : undefined}
              onClick={() => onSelect(p.id)}
              className={cn(
                'block min-h-14 w-full cursor-pointer rounded-md border p-3 text-left transition-colors duration-150',
                p.id === selectedId ? 'border-accent-text bg-accent-soft' : 'border-line bg-surface-1 hover:bg-surface-2',
              )}
            >
              <PlanSummary plan={p} validation={validations.get(p.id)} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
