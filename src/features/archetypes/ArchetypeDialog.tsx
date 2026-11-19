import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Archetype } from '@/domain/types'
import { repos } from '@/data/repo'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Field, Input } from '@/ui/Input'
import { useTagMap } from './archetypeMeta'
import { TagPicker } from './TagPicker'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  archetype?: Archetype
  onDone?: (a: Archetype) => void
}

/** Crea o modifica un archetipo: nome IT/EN e tag. */
export function ArchetypeDialog({ open, onOpenChange, archetype, onDone }: Props) {
  const { t } = useTranslation()
  const { tags, tagMap, setTags } = useTagMap()
  const [nameIt, setNameIt] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setNameIt(archetype?.name.it ?? '')
    setNameEn(archetype?.name.en ?? '')
    setTagIds(archetype ? (tagMap[archetype.id] ?? []) : [])
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, archetype?.id])

  const canSave = !busy && (nameIt.trim() !== '' || nameEn.trim() !== '')
  const save = async () => {
    setBusy(true)
    try {
      const it = nameIt.trim()
      const en = nameEn.trim()
      const name = { ...(it ? { it } : {}), ...(en ? { en } : {}) }
      const a = archetype
        ? await repos.archetypes.update(archetype.id, { name })
        : await repos.archetypes.create({ name, keyCards: [], starters: [], extenders: [] })
      setTags(a.id, tagIds)
      onOpenChange(false)
      onDone?.(a)
    } finally {
      setBusy(false)
    }
  }
  const formId = 'archetype-form'
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={archetype ? t('archetypes.dialog.editTitle') : t('archetypes.dialog.createTitle')}
      description={archetype ? undefined : t('archetypes.dialog.createBody')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form={formId} busy={busy} disabled={!canSave}>
            {archetype ? t('common.save') : t('archetypes.dialog.create')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (canSave) void save()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('archetypes.dialog.nameIt')} hint={t('archetypes.dialog.nameHint')}>
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={nameIt} onChange={(e) => setNameIt(e.target.value)} placeholder={t('archetypes.dialog.namePlaceholder')} autoComplete="off" autoFocus />}
          </Field>
          <Field label={t('archetypes.dialog.nameEn')}>
            {({ id }) => <Input id={id} value={nameEn} onChange={(e) => setNameEn(e.target.value)} autoComplete="off" />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg">{t('archetypes.tags')}</span>
          <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
        </div>
      </form>
    </Dialog>
  )
}
