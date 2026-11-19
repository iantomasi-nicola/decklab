import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { DeckLists } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { ATTRIBUTES, computeStats, type ExtraKind, type Kind } from './deckStats'

function Bar({ label, value, max, tone = 'bg-accent' }: { label: string; value: number; max: number; tone?: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,7rem)_1fr_2rem] items-center gap-3 text-[15px]">
      <span className="truncate text-muted">{label}</span>
      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-3">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${max ? Math.max(4, (value / max) * 100) : 0}%` }} />
      </span>
      <span className="text-right font-semibold tabular-nums text-fg">{value}</span>
    </li>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface-1 p-4">
      <h3 className="mb-3 text-base font-semibold text-fg">{title}</h3>
      {children}
    </section>
  )
}

function Histogram({ title, data, unit }: { title: string; data: Record<number, number>; unit: string }) {
  const keys = Object.keys(data).map(Number).sort((a, b) => a - b)
  if (!keys.length) return null
  const max = Math.max(...Object.values(data))
  return (
    <Group title={title}>
      <ul className="flex flex-col gap-2">
        {keys.map((k) => (
          <Bar key={k} label={`${unit} ${k}`} value={data[k]!} max={max} />
        ))}
      </ul>
    </Group>
  )
}

export function DeckStatsPanel({ deck, index }: { deck: DeckLists; index: CardIndex }) {
  const { t } = useTranslation()
  const s = useMemo(() => computeStats(deck, index), [deck, index])
  if (s.total === 0)
    return (
      <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center">
        <p className="font-medium text-fg">{t('deck.stats.emptyTitle')}</p>
        <p className="mx-auto mt-1 max-w-[44ch] text-[15px] text-muted">{t('deck.stats.emptyBody')}</p>
      </div>
    )
  const kindMax = Math.max(...Object.values(s.kinds))
  const kinds = (Object.keys(s.kinds) as Kind[]).filter((k) => s.kinds[k] > 0)
  const extras = (Object.keys(s.extraKinds) as ExtraKind[]).filter((k) => s.extraKinds[k] > 0)
  const attrs = ATTRIBUTES.filter(([k]) => s.attributes[k])
  const attrMax = Math.max(0, ...attrs.map(([k]) => s.attributes[k]!))
  return (
    <div data-testid="deck-stats" className="grid gap-3 @lg:grid-cols-2">
      <Group title={t('deck.stats.types')}>
        <ul className="flex flex-col gap-2">
          {kinds.map((k) => (
            <Bar key={k} label={t(`deck.kind.${k}`)} value={s.kinds[k]} max={kindMax} />
          ))}
          {extras.map((k) => (
            <Bar key={k} label={t(`deck.extraKind.${k}`)} value={s.extraKinds[k]} max={kindMax} tone="bg-accent-text" />
          ))}
        </ul>
      </Group>
      {attrs.length ? (
        <Group title={t('deck.stats.attributes')}>
          <ul className="flex flex-col gap-2">
            {attrs.map(([k]) => (
              <Bar key={k} label={t(`deck.attr.${k}`)} value={s.attributes[k]!} max={attrMax} />
            ))}
          </ul>
        </Group>
      ) : null}
      <Histogram title={t('deck.stats.levels')} data={s.levels} unit={t('deck.stats.unitLevel')} />
      <Histogram title={t('deck.stats.ranks')} data={s.ranks} unit={t('deck.stats.unitRank')} />
      <Histogram title={t('deck.stats.links')} data={s.links} unit={t('deck.stats.unitLink')} />
      {s.unknown ? <p className="text-sm text-warn">{t('deck.stats.unknown', { count: s.unknown })}</p> : null}
    </div>
  )
}
