import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Library from 'lucide-react/icons/library'
import Plus from 'lucide-react/icons/plus'
import type { DeckLists, Lang } from '@/domain/types'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { PageHeader } from '@/app/PageHeader'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { SearchField } from '@/ui/SearchField'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { useCards } from './cardData'
import { ImportBox } from './ImportBox'
import { clearSharedImport, readSharedImport, type SharedImport } from './importHelpers'
import { NewBanlistNotice } from './NewBanlistNotice'
import { useObservable } from './useObservable'
import { VariantCard } from './VariantCard'
import { VariantDialog } from './VariantDialog'

export function DecksOverview() {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const navigate = useNavigate()
  const cards = useCards()
  const archetypes = useObservable(() => repos.archetypes.watchList(), [])
  const variants = useObservable(() => repos.variants.watchList(), [])
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState<{ open: boolean; deck?: DeckLists; name?: string }>({ open: false })
  const [shared, setShared] = useState<SharedImport | null>(null)

  // contenuto arrivato dal "Condividi" del sistema (/mazzi?share=1, vedi src/sw.ts)
  const search = useSearch({ strict: false }) as { share?: unknown }
  const isShare = search.share === 1 || search.share === '1'
  useEffect(() => {
    if (!isShare) return
    let alive = true
    void readSharedImport().then(async (res) => {
      if (!alive) return
      if (res) setShared(res)
      else toast(t('import.shareEmpty'))
      await clearSharedImport()
      void navigate({ to: '/mazzi', replace: true })
    })
    return () => {
      alive = false
    }
  }, [isShare, navigate, t])

  const archList = archetypes.value ?? []
  const varList = variants.value ?? []
  const loaded = archetypes.loaded && variants.loaded

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    return archList
      .map((a) => ({
        a,
        name: localized(a.name, lang, t('archetypes.untitled')),
        items: varList
          .filter((v) => v.archetypeId === a.id)
          .filter((v) => !q || `${localized(a.name, lang)} ${v.name.it ?? ''} ${v.name.en ?? ''}`.toLowerCase().includes(q))
          .sort((x, y) => localized(x.name, lang).localeCompare(localized(y.name, lang), lang)),
      }))
      .filter((g) => g.items.length)
      .sort((x, y) => x.name.localeCompare(y.name, lang))
  }, [archList, varList, query, lang, t])

  const newBtn = (
    <Button variant="primary" icon={<Plus size={18} />} onClick={() => setDialog({ open: true })} data-testid="new-variant">
      {t('decks.newVariant')}
    </Button>
  )

  return (
    <>
      <PageHeader title={t('decks.title')} lead={t('decks.lead')} actions={newBtn} />
      <div className="flex flex-col gap-6">
        {cards.status === 'ready' ? <NewBanlistNotice variants={varList} archetypes={archList} cards={cards} lang={lang} /> : null}
        <ImportBox
          index={cards.status === 'ready' ? cards.index : undefined}
          lang={lang}
          initial={shared}
          onDeck={(deck, info) => setDialog({ open: true, deck, name: info.name })}
        />
        {!loaded ? (
          <div className="flex flex-col gap-3" aria-busy="true" data-testid="decks-skeleton">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ) : varList.length === 0 ? (
          <EmptyState icon={<Library size={28} />} title={t('decks.emptyTitle')} description={t('decks.emptyBody')} action={newBtn} />
        ) : (
          <section aria-labelledby="all-variants" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="all-variants" className="text-xl font-semibold">
                {t('decks.allVariants')}
              </h2>
              <SearchField label={t('decks.search')} placeholder={t('decks.searchPlaceholder')} value={query} onValueChange={setQuery} className="w-full sm:w-72" />
            </div>
            {groups.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-[15px] text-muted">{t('decks.noResults')}</p>
            ) : (
              groups.map((g) => (
                <div key={g.a.id} className="flex flex-col gap-2" data-testid="variant-group">
                  <h3 className="text-base font-semibold">
                    <Link to="/archetipi/$archetypeId" params={{ archetypeId: g.a.id }} className="inline-flex min-h-11 items-center text-fg hover:text-accent-text">
                      {g.name}
                    </Link>
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {g.items.map((v) => (
                      <VariantCard key={v.id} variant={v} cards={cards} lang={lang} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
      </div>
      <VariantDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        mode="create"
        archetypeChoices={archList}
        deck={dialog.deck}
        defaultName={dialog.name}
        onDone={(v) => void navigate({ to: '/mazzi/$variantId', params: { variantId: v.id } })}
      />
    </>
  )
}
