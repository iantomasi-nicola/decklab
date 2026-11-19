import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Minus from 'lucide-react/icons/minus'
import Plus from 'lucide-react/icons/plus'
import ArrowRightLeft from 'lucide-react/icons/arrow-right-left'
import Trash2 from 'lucide-react/icons/trash-2'
import type { Banlist, DeckLists, Lang, LegalityIssue } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { cn } from '@/ui/cn'
import { Menu, type MenuItem } from '@/ui/Menu'
import { IconButton } from '@/ui/IconButton'
import { cardName, altName } from './cardData'
import { CardThumb } from './CardThumb'
import { cardSubtitle, sortStacks } from './cardMeta'
import { IssuePill, BanStatusBadge } from './CardPills'
import { defaultSection, SECTION_LIMITS, toStacks, type Section, type Stack } from './deckOps'
import { badgeKey, banStatusKey, limitOf, mainIssue } from './legalityView'
import { VirtualList } from './VirtualList'

export type DeckView = 'grid' | 'list'

export interface DeckActions {
  add: (section: Section, id: number) => void
  remove: (section: Section, id: number) => void
  move: (from: Section, to: Section, id: number) => void
  removeAll: (section: Section, id: number) => void
}

interface Props extends DeckActions {
  section: Section
  deck: DeckLists
  view: DeckView
  index: CardIndex
  lang: Lang
  banlist: Banlist
  issueMap: Map<number, LegalityIssue[]>
}

export function SectionCounter({ section, count }: { section: Section; count: number }) {
  const { t } = useTranslation()
  const { min, max } = SECTION_LIMITS[section]
  const tone = count < min ? 'text-warn' : count > max ? 'text-danger' : 'text-ok'
  return (
    <span
      data-testid={`counter-${section}`}
      data-count={count}
      className={cn('inline-flex items-baseline gap-1 whitespace-nowrap font-semibold tabular-nums', tone)}
      title={t('deck.limitHint', { min, max })}
    >
      {count}
      <span className="text-sm font-medium text-subtle">/{max}</span>
    </span>
  )
}

function useStackItems(props: Props) {
  const { deck, section, index, lang, issueMap, banlist } = props
  return useMemo(
    () =>
      sortStacks(toStacks(deck[section]), index, lang).map((s) => {
        const card = index.byId(s.id)
        const canon = index.canonicalId(s.id)
        const issue = mainIssue(issueMap.get(canon) ?? [])
        return { ...s, card, canon, issue, status: banStatusKey(limitOf(banlist, canon)) }
      }),
    [deck, section, index, lang, issueMap, banlist],
  )
}

type Item = Stack & { card: ReturnType<CardIndex['byId']>; canon: number; issue?: LegalityIssue; status: ReturnType<typeof banStatusKey> }

function useMenuItems(props: Props) {
  const { t } = useTranslation()
  const { section, add, remove, move, removeAll } = props
  return (it: Item): MenuItem[] => {
    const target: Section = section === 'side' ? (it.card ? defaultSection(it.card) : 'main') : 'side'
    return [
      { id: 'add', label: t('deck.action.add'), icon: <Plus size={18} />, onSelect: () => add(section, it.id) },
      { id: 'remove', label: t('deck.action.remove'), icon: <Minus size={18} />, onSelect: () => remove(section, it.id) },
      { id: 'move', label: t(`deck.action.moveTo.${target}`), icon: <ArrowRightLeft size={18} />, onSelect: () => move(section, target, it.id) },
      { id: 'removeAll', label: t('deck.action.removeAll'), icon: <Trash2 size={18} />, danger: true, onSelect: () => removeAll(section, it.id) },
    ]
  }
}

function GridTile({ it, props, menu }: { it: Item; props: Props; menu: MenuItem[] }) {
  const { t } = useTranslation()
  const name = cardName(it.card, props.lang, it.id)
  const label = [name, `×${it.count}`, it.issue ? t(`legality.badge.${badgeKey(it.issue.code)}`) : ''].filter(Boolean).join(', ')
  return (
    <Menu
      align="start"
      items={menu}
      trigger={
        <button
          type="button"
          aria-label={label}
          data-testid="deck-tile"
          data-card-id={it.id}
          data-issue={it.issue?.code}
          className={cn(
            'group relative block w-full cursor-pointer touch-manipulation rounded-[8px] border-2 border-transparent p-0 text-left transition-colors duration-150',
            it.issue ? 'border-danger bg-danger/10' : 'hover:border-line-strong',
          )}
        >
          <CardThumb id={it.id} name={name} className="w-full" />
          {it.issue ? <IssuePill issue={it.issue} className="absolute left-1 top-1" /> : null}
          {it.count > 1 ? (
            <span className="absolute bottom-1 right-1 min-w-7 rounded-full bg-bg/90 px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-fg shadow-1">
              ×{it.count}
            </span>
          ) : null}
        </button>
      }
    />
  )
}

function ListRow({ it, props, menu }: { it: Item; props: Props; menu: MenuItem[] }) {
  const { t } = useTranslation()
  const { section, lang, add, remove } = props
  const name = cardName(it.card, lang, it.id)
  const alt = altName(it.card, lang)
  return (
    <div
      data-testid="deck-row"
      data-card-id={it.id}
      data-issue={it.issue?.code}
      className={cn('flex items-center gap-1 rounded-md border px-1 py-1', it.issue ? 'border-danger bg-danger/10' : 'border-transparent')}
    >
      <Menu
        align="start"
        items={menu}
        trigger={
          <button type="button" aria-label={t('deck.cardMenu', { name })} className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 text-left hover:bg-surface-2">
            <CardThumb id={it.id} name={name} className="w-9" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-fg">{name}</span>
              <span className="block truncate text-sm text-muted">{alt ?? cardSubtitle(it.card, t)}</span>
              <span className="mt-0.5 flex flex-wrap gap-1">
                {it.issue ? <IssuePill issue={it.issue} /> : <BanStatusBadge status={it.status} />}
              </span>
            </span>
          </button>
        }
      />
      <div className="flex shrink-0 items-center">
        <IconButton label={t('deck.action.removeNamed', { name })} icon={<Minus size={18} />} onClick={() => remove(section, it.id)} />
        <span className="min-w-6 text-center font-semibold tabular-nums" aria-label={t('deck.copies', { count: it.count })}>
          {it.count}
        </span>
        <IconButton label={t('deck.action.addNamed', { name })} icon={<Plus size={18} />} onClick={() => add(section, it.id)} />
      </div>
    </div>
  )
}

export function DeckSection(props: Props) {
  const { t } = useTranslation()
  const { section, view } = props
  const items = useStackItems(props)
  const menuFor = useMenuItems(props)

  if (!items.length) {
    return (
      <div data-testid={`empty-${section}`} className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
        <p className="font-medium text-fg">{t(`deck.empty.${section}.title`)}</p>
        <p className="mx-auto mt-1 max-w-[44ch] text-[15px] text-muted">{t(`deck.empty.${section}.body`)}</p>
      </div>
    )
  }

  if (view === 'grid') {
    return (
      <ul data-testid={`grid-${section}`} aria-label={t(`deck.section.${section}`)} className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
        {items.map((it) => (
          <li key={it.id}>
            <GridTile it={it} props={props} menu={menuFor(it)} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div data-testid={`list-${section}`}>
      <VirtualList
        items={items}
        rowHeight={68}
        getKey={(it) => it.id}
        label={t(`deck.section.${section}`)}
        renderRow={(it) => <ListRow it={it} props={props} menu={menuFor(it)} />}
      />
    </div>
  )
}
