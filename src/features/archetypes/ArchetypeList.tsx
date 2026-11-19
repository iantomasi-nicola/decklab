import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Layers from 'lucide-react/icons/layers'
import Plus from 'lucide-react/icons/plus'
import Star from 'lucide-react/icons/star'
import Ellipsis from 'lucide-react/icons/ellipsis'
import Pencil from 'lucide-react/icons/pencil'
import Copy from 'lucide-react/icons/copy'
import Trash2 from 'lucide-react/icons/trash-2'
import type { Archetype } from '@/domain/types'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { PageHeader } from '@/app/PageHeader'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { EmptyState } from '@/ui/EmptyState'
import { IconButton } from '@/ui/IconButton'
import { Menu } from '@/ui/Menu'
import { SearchField } from '@/ui/SearchField'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { cardName, useCards } from '@/features/decks/cardData'
import { CardThumb } from '@/features/decks/CardThumb'
import { useObservable } from '@/features/decks/useObservable'
import { filterArchetypes, useFavorites, useTagMap } from './archetypeMeta'
import { ArchetypeDialog } from './ArchetypeDialog'
import { TagChip } from './TagPicker'

/** Elimina con annulla (cancellazione logica propagata a varianti e combo). */
export function deleteArchetypeWithUndo(a: Archetype, labels: { undo: string; done: string }) {
  void repos.archetypes.softDelete(a.id)
  toast(labels.done, { durationMs: 8000, action: { label: labels.undo, onClick: () => void repos.archetypes.restore(a.id) } })
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" data-testid="archetypes-skeleton">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  )
}

function ArchetypeCard({
  archetype, variantCount, favorite, onFavorite, tagNames, onEdit,
}: {
  archetype: Archetype
  variantCount: number
  favorite: boolean
  onFavorite: () => void
  tagNames: string[]
  onEdit: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const cards = useCards()
  const navigate = useNavigate()
  const name = localized(archetype.name, lang, t('archetypes.untitled'))
  const other = archetype.name[lang === 'it' ? 'en' : 'it']
  const keys = archetype.keyCards.slice(0, 4)
  return (
    <article className="relative flex flex-col rounded-lg border border-line bg-surface-1 shadow-1 transition-colors duration-150 hover:border-line-strong" data-testid="archetype-card" data-archetype-id={archetype.id}>
      <div className="flex items-start gap-1 p-1">
        {/* link "esteso": l'intera scheda è cliccabile, i pulsanti restano sopra (z-10) */}
        <Link
          to="/archetipi/$archetypeId"
          params={{ archetypeId: archetype.id }}
          className="min-w-0 flex-1 rounded-md px-3 py-2 after:absolute after:inset-0 after:rounded-lg after:content-['']"
        >
          <h2 className="truncate text-lg font-semibold text-fg">{name}</h2>
          {other && other !== name ? <p className="truncate text-sm text-muted">{other}</p> : null}
        </Link>
        <IconButton
          className="relative z-10"
          label={favorite ? t('archetypes.unfavorite', { name }) : t('archetypes.favorite', { name })}
          aria-pressed={favorite}
          icon={<Star size={20} className={cn(favorite && 'fill-current text-warn')} />}
          onClick={onFavorite}
          data-testid="favorite-toggle"
        />
        <Menu
          trigger={<IconButton className="relative z-10" label={t('archetypes.menu', { name })} icon={<Ellipsis size={20} />} />}
          items={[
            { id: 'edit', label: t('common.edit'), icon: <Pencil size={18} />, onSelect: onEdit },
            {
              id: 'dup',
              label: t('common.duplicate'),
              icon: <Copy size={18} />,
              onSelect: async () => {
                const copy = await repos.archetypes.duplicate(archetype.id)
                toast(t('archetypes.duplicated'), { tone: 'ok', action: { label: t('common.open'), onClick: () => void navigate({ to: '/archetipi/$archetypeId', params: { archetypeId: copy.id } }) } })
              },
            },
            { id: 'del', label: t('common.delete'), icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteArchetypeWithUndo(archetype, { undo: t('common.undo'), done: t('archetypes.deleted', { name }) }) },
          ]}
        />
      </div>
      <div className="px-4">
        {keys.length && cards.status === 'ready' ? (
          <div className="flex gap-2">
            {keys.map((id) => (
              <CardThumb key={id} id={id} name={cardName(cards.index.byId(id), lang, id)} className="w-12" />
            ))}
          </div>
        ) : keys.length ? (
          <div className="flex gap-2">
            {keys.map((id) => (
              <Skeleton key={id} className="aspect-[59/86] w-12" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-subtle">{t('archetypes.noKeyCards')}</p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 p-4 pt-3">
        <Badge tone={variantCount ? 'accent' : 'neutral'}>{t('archetypes.variantCount', { count: variantCount })}</Badge>
        {tagNames.map((n) => (
          <Badge key={n}>{n}</Badge>
        ))}
      </div>
    </article>
  )
}

export function ArchetypeList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const navigate = useNavigate()
  const archetypes = useObservable(() => repos.archetypes.watchList(), [])
  const variants = useObservable(() => repos.variants.watchList(), [])
  const { favorites, toggle } = useFavorites()
  const { tagMap, tags } = useTagMap()
  const [query, setQuery] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [dialog, setDialog] = useState<{ open: boolean; archetype?: Archetype }>({ open: false })

  const tagNames = useMemo(() => Object.fromEntries(tags.map((x) => [x.id, x.name])), [tags])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of variants.value ?? []) m.set(v.archetypeId, (m.get(v.archetypeId) ?? 0) + 1)
    return m
  }, [variants.value])
  const all = archetypes.value ?? []
  const shown = useMemo(
    () => filterArchetypes(all, { query, favoritesOnly: favOnly, tagIds }, favorites, tagMap, tagNames, lang),
    [all, query, favOnly, tagIds, favorites, tagMap, tagNames, lang],
  )
  const filtering = query.trim() !== '' || favOnly || tagIds.length > 0

  const create = (
    <Button variant="primary" icon={<Plus size={18} />} onClick={() => setDialog({ open: true })} data-testid="new-archetype">
      {t('archetypes.new')}
    </Button>
  )

  return (
    <>
      <PageHeader title={t('archetypes.title')} lead={t('archetypes.lead')} actions={all.length ? create : undefined} />
      {!archetypes.loaded ? (
        <ListSkeleton />
      ) : all.length === 0 ? (
        <EmptyState icon={<Layers size={28} />} title={t('archetypes.emptyTitle')} description={t('archetypes.emptyBody')} action={create} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <SearchField label={t('archetypes.search')} placeholder={t('archetypes.searchPlaceholder')} value={query} onValueChange={setQuery} className="max-w-md" />
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('archetypes.filters')}>
              <TagChip pressed={favOnly} onClick={() => setFavOnly((v) => !v)} testId="filter-favorites">
                <Star aria-hidden size={16} className={cn(favOnly && 'fill-current')} />
                {t('archetypes.favorites')}
              </TagChip>
              {tags.map((tag) => (
                <TagChip key={tag.id} pressed={tagIds.includes(tag.id)} onClick={() => setTagIds((l) => (l.includes(tag.id) ? l.filter((x) => x !== tag.id) : [...l, tag.id]))}>
                  {tag.name}
                </TagChip>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon={<Layers size={28} />}
              title={t('archetypes.noResultsTitle')}
              description={t('archetypes.noResultsBody')}
              action={
                <Button
                  onClick={() => {
                    setQuery('')
                    setFavOnly(false)
                    setTagIds([])
                  }}
                >
                  {t('archetypes.resetFilters')}
                </Button>
              }
            />
          ) : (
            <>
              <p className="text-sm text-muted" role="status">
                {filtering ? t('archetypes.resultsFiltered', { count: shown.length, total: all.length }) : t('archetypes.results', { count: all.length })}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="archetype-grid">
                {shown.map((a) => (
                  <ArchetypeCard
                    key={a.id}
                    archetype={a}
                    variantCount={counts.get(a.id) ?? 0}
                    favorite={favorites.includes(a.id)}
                    onFavorite={() => toggle(a.id)}
                    tagNames={(tagMap[a.id] ?? []).map((id) => tagNames[id]).filter((x): x is string => !!x)}
                    onEdit={() => setDialog({ open: true, archetype: a })}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <ArchetypeDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        archetype={dialog.archetype}
        onDone={(a) => {
          if (!dialog.archetype) void navigate({ to: '/archetipi/$archetypeId', params: { archetypeId: a.id } })
        }}
      />
    </>
  )
}
