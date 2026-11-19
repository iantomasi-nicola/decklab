import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { SideTurn } from '@/domain/side'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Field, Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'

export const ARCHETYPE_LIST_ID = 'side-archetype-options'

export interface NewPlanValues {
  name: string
  archetype: string
  turn: SideTurn
}

export function TurnSegmented({ value, onValueChange, className }: { value: SideTurn; onValueChange: (t: SideTurn) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <Segmented
      label={t('side.plan.turn')}
      value={value}
      onValueChange={onValueChange}
      className={className}
      options={[
        { value: 'first', label: t('side.turn.first') },
        { value: 'second', label: t('side.turn.second') },
      ]}
    />
  )
}

export function NewPlanDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (o: boolean) => void; onCreate: (v: NewPlanValues) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [archetype, setArchetype] = useState('')
  const [turn, setTurn] = useState<SideTurn>('first')
  useEffect(() => {
    if (open) {
      setName('')
      setArchetype('')
      setTurn('first')
    }
  }, [open])
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onCreate({ name: name.trim() || archetype.trim(), archetype: archetype.trim(), turn })
    onOpenChange(false)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('side.newTitle')} description={t('side.newLead')}>
      <form id="side-new-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('side.plan.name')}>
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} autoFocus value={name} placeholder={t('side.plan.namePlaceholder')} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          )}
        </Field>
        <Field label={t('side.plan.archetype')}>
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} list={ARCHETYPE_LIST_ID} value={archetype} placeholder={t('side.plan.archetypePlaceholder')} onChange={(e) => setArchetype(e.target.value)} autoComplete="off" />
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg">{t('side.plan.turn')}</span>
          <TurnSegmented value={turn} onValueChange={setTurn} />
        </div>
      </form>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" type="submit" form="side-new-form" data-testid="side-create">
          {t('side.create')}
        </Button>
      </div>
    </Dialog>
  )
}
