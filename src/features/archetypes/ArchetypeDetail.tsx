import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import Star from 'lucide-react/icons/star'
import Plus from 'lucide-react/icons/plus'
import X from 'lucide-react/icons/x'
import Upload from 'lucide-react/icons/upload'
import Layers from 'lucide-react/icons/layers'
import Ellipsis from 'lucide-react/icons/ellipsis'
import Pencil from 'lucide-react/icons/pencil'
import Copy from 'lucide-react/icons/copy'
import Trash2 from 'lucide-react/icons/trash-2'
import type { Archetype, DeckLists, Lang } from '@/domain/types'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/Dialog'
import { EmptyState } from '@/ui/EmptyState'
import { Field, Input } from '@/ui/Input'
import { IconButton } from '@/ui/IconButton'
import { Menu } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { cardName, useCards } from '@/features/decks/cardData'
import { CardThumb } from '@/features/decks/CardThumb'
import { Textarea } from '@/features/decks/fields'
import { ImportBox } from '@/features/decks/ImportBox'
import { NewBanlistNotice } from '@/features/decks/NewBanlistNotice'
import { useObservable } from '@/features/decks/useObservable'
import { VariantCard } from '@/features/decks/VariantCard'
import { VariantDialog } from '@/features/decks/VariantDialog'
import { useFavorites, useTagMap } from './archetypeMeta'
import { ArchetypeDialog } from './ArchetypeDialog'
import { deleteArchetypeWithUndo } from './ArchetypeList'
import { CardPickerDialog } from './CardPickerDialog'

type Role = 'keyCards' | 'starters' | 'extenders'
const ROLES: Role[] = ['keyCards', 'starters', 'extenders']

/** Campo di testo che salva quando perde il focus (nessun pulsante "Salva" da ricordare). */
function SavedInput({ label, value, onSave, testId }: { label: string; value: string; onSave: (v: string) => void; testId?: string }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <Field label={label}>
      {({ id }) => (
        <Input
          id={id}
          data-testid={testId}
          value={draft}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value && onSave(draft.trim())}
        />
      )}
    </Field>
  )
}

function RoleSection({ role, archetype, lang }: { role: Role; archetype: Archetype; lang: Lang }) {
  const { t } = useTranslation()
  const cards = useCards()
  const [open, setOpen] = useState(false)
  const ids = archetype[role]
  const save = (next: number[]) => void repos.archetypes.update(archetype.id, { [role]: next })
  const label = t(`archetypes.roles.${role}`)
  return (
    <section aria-labelledby={`role-${role}`} className="flex flex-col gap-3" data-testid={`role-${role}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`role-${role}`} className="text-base font-semibold text-fg">
            {label} <span className="font-normal text-subtle tabular-nums">({ids.length})</span>
          </h3>
          <p className="text-sm text-muted">{t(`archetypes.roles.${role}Hint`)}</p>
        </div>
        <Button icon={<Plus size={18} />} onClick={() => setOpen(true)} data-testid={`add-${role}`}>
          {t('archetypes.addCards')}
        </Button>
      </div>
      {ids.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-center text-[15px] text-muted">{t('archetypes.roles.empty')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-2">
          {ids.map((id) => {
            const name = cards.status === 'ready' ? cardName(cards.index.byId(id), lang, id) : String(id)
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border border-line bg-surface-1 p-1.5 pr-0" data-testid="role-card">
                <CardThumb id={id} name={name} className="w-9" />
                <span className="min-w-0 flex-1 truncate text-[15px] text-fg">{name}</span>
                <IconButton
                  label={t('archetypes.removeCard', { name })}
                  icon={<X size={16} />}
                  onClick={() => {
                    save(ids.filter((x) => x !== id))
                    toast(t('archetypes.cardRemoved', { name }), { action: { label: t('common.undo'), onClick: () => save(ids) }, durationMs: 6000 })
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
      <CardPickerDialog open={open} onOpenChange={setOpen} title={t('archetypes.pickerTitle', { role: label })} lang={lang} selected={ids} onChange={save} />
    </section>
  )
}

function Detail({ archetype }: { archetype: Archetype }) {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const navigate = useNavigate()
  const cards = useCards()
  const variants = useObservable(() => repos.variants.watchByArchetype(archetype.id), [archetype.id])
  const { favorites, toggle } = useFavorites()
  const { tagMap, tags } = useTagMap()
  const [notesLang, setNotesLang] = useState<Lang>(lang)
  const [notesDraft, setNotesDraft] = useState(archetype.notes?.[notesLang] ?? '')
  const [edit, setEdit] = useState(false)
  const [newVariant, setNewVariant] = useState<{ open: boolean; deck?: DeckLists; name?: string }>({ open: false })
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => setNotesDraft(archetype.notes?.[notesLang] ?? ''), [archetype.notes, notesLang])

  const name = localized(archetype.name, lang, t('archetypes.untitled'))
  const fav = favorites.includes(archetype.id)
  const myTags = (tagMap[archetype.id] ?? []).map((id) => tags.find((x) => x.id === id)?.name).filter((x): x is string => !!x)
  const list = variants.value ?? []
  const sorted = useMemo(() => [...list].sort((a, b) => localized(a.name, lang).localeCompare(localized(b.name, lang), lang)), [list, lang])

  const saveNotes = () => {
    const cur = archetype.notes?.[notesLang] ?? ''
    if (notesDraft === cur) return
    void repos.archetypes.update(archetype.id, { notes: { ...archetype.notes, [notesLang]: notesDraft } })
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link to="/archetipi" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[15px] text-muted hover:text-fg">
          <ArrowLeft aria-hidden size={16} />
          {t('archetypes.title')}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight [overflow-wrap:anywhere] md:text-[32px]" data-testid="archetype-title">
              {name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{t('archetypes.variantCount', { count: list.length })}</Badge>
              {myTags.map((n) => (
                <Badge key={n}>{n}</Badge>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconButton
              variant="secondary"
              label={fav ? t('archetypes.unfavorite', { name }) : t('archetypes.favorite', { name })}
              aria-pressed={fav}
              icon={<Star size={20} className={cn(fav && 'fill-current text-warn')} />}
              onClick={() => toggle(archetype.id)}
            />
            <Menu
              trigger={<IconButton variant="secondary" label={t('archetypes.menu', { name })} icon={<Ellipsis size={20} />} />}
              items={[
                { id: 'edit', label: t('common.edit'), icon: <Pencil size={18} />, onSelect: () => setEdit(true) },
                {
                  id: 'dup',
                  label: t('common.duplicate'),
                  icon: <Copy size={18} />,
                  onSelect: async () => {
                    const copy = await repos.archetypes.duplicate(archetype.id)
                    toast(t('archetypes.duplicated'), { tone: 'ok', action: { label: t('common.open'), onClick: () => void navigate({ to: '/archetipi/$archetypeId', params: { archetypeId: copy.id } }) } })
                  },
                },
                {
                  id: 'del',
                  label: t('common.delete'),
                  icon: <Trash2 size={18} />,
                  danger: true,
                  onSelect: () => {
                    deleteArchetypeWithUndo(archetype, { undo: t('common.undo'), done: t('archetypes.deleted', { name }) })
                    void navigate({ to: '/archetipi' })
                  },
                },
              ]}
            />
          </div>
        </div>
      </header>

      <section aria-labelledby="sec-details" className="flex flex-col gap-4">
        <h2 id="sec-details" className="text-xl font-semibold">
          {t('archetypes.details')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SavedInput label={t('archetypes.dialog.nameIt')} value={archetype.name.it ?? ''} testId="name-it" onSave={(v) => void repos.archetypes.update(archetype.id, { name: { ...archetype.name, ...(v ? { it: v } : { it: undefined }) } })} />
          <SavedInput label={t('archetypes.dialog.nameEn')} value={archetype.name.en ?? ''} testId="name-en" onSave={(v) => void repos.archetypes.update(archetype.id, { name: { ...archetype.name, ...(v ? { en: v } : { en: undefined }) } })} />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="notes" className="text-sm font-medium text-fg">
              {t('archetypes.notes')}
            </label>
            <Segmented<Lang> label={t('archetypes.notesLang')} value={notesLang} onValueChange={setNotesLang} options={[{ value: 'it', label: 'IT' }, { value: 'en', label: 'EN' }]} />
          </div>
          <Textarea id="notes" data-testid="notes" rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={saveNotes} placeholder={t('archetypes.notesPlaceholder')} />
          <p className="text-sm text-muted">{t('archetypes.notesHint')}</p>
        </div>
      </section>

      <section aria-labelledby="sec-cards" className="flex flex-col gap-6">
        <h2 id="sec-cards" className="text-xl font-semibold">
          {t('archetypes.cardsTitle')}
        </h2>
        {ROLES.map((r) => (
          <RoleSection key={r} role={r} archetype={archetype} lang={lang} />
        ))}
      </section>

      <section aria-labelledby="sec-variants" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sec-variants" className="text-xl font-semibold">
            {t('archetypes.variants')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Upload size={18} />} onClick={() => setImportOpen(true)} data-testid="import-variant">
              {t('decks.import')}
            </Button>
            <Button variant="primary" icon={<Plus size={18} />} onClick={() => setNewVariant({ open: true })} data-testid="new-variant">
              {t('decks.newVariant')}
            </Button>
          </div>
        </div>
        {cards.status === 'ready' ? <NewBanlistNotice variants={list} archetypes={[archetype]} cards={cards} lang={lang} /> : null}
        {!variants.loaded ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Layers size={28} />}
            title={t('archetypes.noVariantsTitle')}
            description={t('archetypes.noVariantsBody')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={<Plus size={18} />} onClick={() => setNewVariant({ open: true })}>
                  {t('decks.newVariant')}
                </Button>
                <Button icon={<Upload size={18} />} onClick={() => setImportOpen(true)}>
                  {t('decks.import')}
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]" data-testid="variant-list">
            {sorted.map((v) => (
              <VariantCard key={v.id} variant={v} cards={cards} lang={lang} />
            ))}
          </div>
        )}
      </section>

      <ArchetypeDialog open={edit} onOpenChange={setEdit} archetype={archetype} />
      <VariantDialog
        open={newVariant.open}
        onOpenChange={(o) => setNewVariant((s) => ({ ...s, open: o }))}
        mode="create"
        archetypeId={archetype.id}
        deck={newVariant.deck}
        defaultName={newVariant.name}
        onDone={(v) => void navigate({ to: '/mazzi/$variantId', params: { variantId: v.id } })}
      />
      <Dialog open={importOpen} onOpenChange={setImportOpen} title={t('decks.importTitle')} description={t('decks.importBody')} className="max-w-xl">
        <ImportBox
          index={cards.status === 'ready' ? cards.index : undefined}
          lang={lang}
          onDeck={(deck, info) => {
            setImportOpen(false)
            setNewVariant({ open: true, deck, name: info.name })
          }}
        />
      </Dialog>
    </div>
  )
}

export function ArchetypeDetail({ archetypeId }: { archetypeId: string }) {
  const { t } = useTranslation()
  const { value, loaded } = useObservable(() => repos.archetypes.watch(archetypeId), [archetypeId])
  if (!loaded)
    return (
      <div aria-busy="true" data-testid="archetype-skeleton">
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="mb-6 h-10 w-64 max-w-full" />
        <Skeleton className="mb-3 h-11 w-full" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    )
  if (!value || value.deletedAt !== null)
    return (
      <EmptyState
        icon={<Layers size={28} />}
        title={t('archetypes.notFoundTitle')}
        description={t('archetypes.notFoundBody')}
        action={
          <Link to="/archetipi" className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 font-medium text-accent-fg hover:bg-accent-hover">
            {t('archetypes.backToList')}
          </Link>
        }
      />
    )
  return <Detail archetype={value} />
}
