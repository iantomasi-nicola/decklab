import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Archetype, DeckLists, Rules, Variant } from '@/domain/types'
import { repos } from '@/data/repo'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Field, Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'
import { localized, setLocalized } from '@/i18n'
import { BanlistSelect } from './BanlistSelect'
import { defaultBanlistRef, latestBanlist, useCards, type BanlistRef } from './cardData'
import { NativeSelect } from './fields'
import { emptyDeck } from './deckOps'

const NEW = '__new__'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  variant?: Variant
  /** create: archetipo fisso */
  archetypeId?: string
  /** create: scelta dell'archetipo (es. dalla pagina Mazzi); abilita anche "nuovo archetipo" */
  archetypeChoices?: Archetype[]
  deck?: DeckLists
  defaultName?: string
  onDone?: (v: Variant) => void
}

export function VariantDialog({ open, onOpenChange, mode, variant, archetypeId, archetypeChoices, deck, defaultName, onDone }: Props) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const cards = useCards()
  const banlists = cards.status === 'ready' ? cards.banlists : []
  const [nameText, setNameText] = useState('')
  const [rules, setRules] = useState<Rules>('TCG')
  const [ban, setBan] = useState<BanlistRef>({ format: 'TCG', id: '' })
  const [arch, setArch] = useState('')
  const [archName, setArchName] = useState('')
  const [busy, setBusy] = useState(false)

  // reset all'apertura
  useEffect(() => {
    if (!open) return
    setBusy(false)
    if (mode === 'edit' && variant) {
      setNameText(localized(variant.name, lang))
      setRules(variant.rules)
      setBan(variant.banlist)
    } else {
      setNameText(defaultName ?? '')
      setRules('TCG')
      setBan({ format: 'TCG', id: '' })
    }
    setArch(archetypeId ?? archetypeChoices?.[0]?.id ?? NEW)
    setArchName('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // banlist predefinita appena i dati sono pronti (solo in creazione)
  useEffect(() => {
    if (open && mode === 'create' && !ban.id && banlists.length) setBan(defaultBanlistRef(banlists, rules))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, banlists.length])

  const changeRules = (r: Rules) => {
    setRules(r)
    // se la banlist era quella "di default" del formato, segui le regole
    if (ban.format === 'TCG' || ban.format === 'OCG') {
      const l = latestBanlist(banlists, r)
      if (l) setBan({ format: l.format, id: l.id })
    }
  }

  const needsNewArchetype = mode === 'create' && !archetypeId && arch === NEW
  const canSave = !busy && cards.status === 'ready' && (mode === 'edit' || !!ban.id) && (!needsNewArchetype || archName.trim().length > 0)

  const save = async () => {
    setBusy(true)
    try {
      const fallback = t('decks.defaultVariantName')
      const typed = nameText.trim()
      const cleaned = typed ? setLocalized(mode === 'edit' ? variant?.name : undefined, lang, typed) : { it: fallback, en: fallback }
      let result: Variant
      if (mode === 'edit' && variant) {
        result = await repos.variants.update(variant.id, { name: cleaned, rules, banlist: ban })
      } else {
        let aid = archetypeId ?? arch
        if (needsNewArchetype) {
          const a = await repos.archetypes.create({ name: { it: archName.trim(), en: archName.trim() }, keyCards: [], starters: [], extenders: [] })
          aid = a.id
        }
        result = await repos.variants.create({ archetypeId: aid, name: cleaned, deck: deck ?? emptyDeck(), rules, banlist: ban })
      }
      onOpenChange(false)
      onDone?.(result)
    } finally {
      setBusy(false)
    }
  }

  const formId = 'variant-form'
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'edit' ? t('decks.variantDialog.editTitle') : t('decks.variantDialog.createTitle')}
      description={mode === 'edit' ? undefined : t('decks.variantDialog.createBody')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button variant="primary" type="submit" form={formId} busy={busy} disabled={!canSave}>
            {mode === 'edit' ? t('common.save') : t('decks.variantDialog.create')}
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
        {mode === 'create' && !archetypeId && archetypeChoices ? (
          <>
            <Field label={t('decks.variantDialog.archetype')}>
              {({ id }) => (
                <NativeSelect id={id} value={arch} onChange={(e) => setArch(e.target.value)}>
                  {archetypeChoices.map((a) => (
                    <option key={a.id} value={a.id}>
                      {localized(a.name, lang, t('archetypes.untitled'))}
                    </option>
                  ))}
                  <option value={NEW}>{t('decks.variantDialog.newArchetype')}</option>
                </NativeSelect>
              )}
            </Field>
            {needsNewArchetype ? (
              <Field label={t('decks.variantDialog.newArchetypeName')}>
                {({ id }) => <Input id={id} value={archName} onChange={(e) => setArchName(e.target.value)} placeholder={t('archetypes.dialog.namePlaceholder')} autoComplete="off" />}
              </Field>
            ) : null}
          </>
        ) : null}
        <Field label={t('decks.variantDialog.name')}>
          {({ id }) => <Input id={id} value={nameText} onChange={(e) => setNameText(e.target.value)} placeholder={t('decks.variantDialog.namePlaceholder')} autoComplete="off" />}
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-fg">{t('decks.variantDialog.rules')}</span>
          <Segmented<Rules>
            label={t('decks.variantDialog.rules')}
            value={rules}
            onValueChange={changeRules}
            options={[
              { value: 'TCG', label: 'TCG' },
              { value: 'OCG', label: 'OCG' },
            ]}
          />
        </div>
        <Field label={t('decks.variantDialog.banlist')} hint={t('decks.variantDialog.banlistHint')}>
          {({ id }) => <BanlistSelect id={id} label={t('decks.variantDialog.banlist')} banlists={banlists} value={ban} onChange={setBan} disabled={cards.status !== 'ready'} />}
        </Field>
      </form>
    </Dialog>
  )
}
