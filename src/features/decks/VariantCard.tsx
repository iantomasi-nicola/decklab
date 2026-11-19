import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Ellipsis from 'lucide-react/icons/ellipsis'
import Copy from 'lucide-react/icons/copy'
import Pencil from 'lucide-react/icons/pencil'
import Trash2 from 'lucide-react/icons/trash-2'
import type { Variant } from '@/domain/types'
import { checkDeck } from '@/domain/legality/checkDeck'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { Badge } from '@/ui/Badge'
import { IconButton } from '@/ui/IconButton'
import { Menu } from '@/ui/Menu'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { banlistLabel, findBanlist, noLimits, type CardsState } from './cardData'
import { VariantDialog } from './VariantDialog'

interface Props {
  variant: Variant
  cards: CardsState
  lang: 'it' | 'en'
  /** mostra il nome dell'archetipo sopra la variante (elenco globale) */
  archetypeName?: string
}

/** Elimina con annulla: cancellazione logica + toast con "Annulla". */
export function deleteVariantWithUndo(v: Variant, undoLabel: string, doneLabel: string) {
  void repos.variants.softDelete(v.id)
  toast(doneLabel, { durationMs: 8000, action: { label: undoLabel, onClick: () => void repos.variants.restore(v.id) } })
}

export function VariantCard({ variant, cards, lang, archetypeName }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [edit, setEdit] = useState(false)
  const name = localized(variant.name, lang, t('decks.defaultVariantName'))

  const issues = useMemo(() => {
    if (cards.status !== 'ready') return null
    const bl = findBanlist(cards.banlists, variant.banlist) ?? noLimits(variant.banlist)
    return checkDeck(variant.deck, bl, variant.rules, cards.index)
  }, [cards, variant])

  const { main, extra, side } = variant.deck
  return (
    <article className="relative flex items-stretch gap-1 rounded-lg border border-line bg-surface-1 p-1 shadow-1 transition-colors duration-150 hover:border-line-strong" data-testid="variant-card" data-variant-id={variant.id}>
      <Link
        to="/mazzi/$variantId"
        params={{ variantId: variant.id }}
        className="flex min-h-[72px] min-w-0 flex-1 flex-col justify-center gap-1.5 rounded-md px-3 py-2"
      >
        {archetypeName ? <span className="truncate text-sm text-muted">{archetypeName}</span> : null}
        <span className="truncate text-base font-semibold text-fg">{name}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">{variant.rules}</Badge>
          <Badge>{banlistLabel(variant.banlist)}</Badge>
          {issues === null ? (
            <Skeleton className="h-6 w-24 rounded-full" />
          ) : issues.length === 0 ? (
            <Badge tone="ok" data-testid="variant-legal">
              {t('legality.legalShort')}
            </Badge>
          ) : (
            <Badge tone="danger" data-testid="variant-illegal">
              {t('legality.illegalShort', { count: issues.length })}
            </Badge>
          )}
        </span>
        <span className="text-sm text-muted tabular-nums">{t('decks.counts', { main: main.length, extra: extra.length, side: side.length })}</span>
      </Link>
      <Menu
        trigger={<IconButton label={t('decks.variantMenu', { name })} icon={<Ellipsis size={20} />} />}
        items={[
          { id: 'edit', label: t('decks.variantDialog.editTitle'), icon: <Pencil size={18} />, onSelect: () => setEdit(true) },
          {
            id: 'dup',
            label: t('common.duplicate'),
            icon: <Copy size={18} />,
            onSelect: async () => {
              const copy = await repos.variants.duplicate(variant.id)
              toast(t('decks.duplicated'), { tone: 'ok', action: { label: t('common.open'), onClick: () => void navigate({ to: '/mazzi/$variantId', params: { variantId: copy.id } }) } })
            },
          },
          { id: 'del', label: t('common.delete'), icon: <Trash2 size={18} />, danger: true, onSelect: () => deleteVariantWithUndo(variant, t('common.undo'), t('decks.deleted', { name })) },
        ]}
      />
      <VariantDialog open={edit} onOpenChange={setEdit} mode="edit" variant={variant} />
    </article>
  )
}
