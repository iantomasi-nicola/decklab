import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Archetype, Banlist, Variant } from '@/domain/types'
import { diffLegality, type LegalityDiffEntry } from '@/domain/legality/checkDeck'
import { repos } from '@/data/repo'
import { localized } from '@/i18n'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { toast } from '@/ui/Toast'
import { banlistLabel, findBanlist, isOlder, latestBanlist, type CardsReady } from './cardData'
import { useIssueText } from './LegalityBanner'

const KEY = 'combolab.banlistNotice.dismissed'

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

interface Group {
  latest: Banlist
  items: { variant: Variant; entry: LegalityDiffEntry }[]
}

/** Calcola, per formato, le varianti che con l'ultima banlist diventano illegali (usa domain/legality `diffLegality`). */
export function computeBanlistGroups(variants: readonly Variant[], cards: Pick<CardsReady, 'banlists' | 'index'>): Group[] {
  const out = new Map<Banlist['format'], Group>()
  for (const v of variants) {
    const latest = latestBanlist(cards.banlists, v.banlist.format)
    if (!latest || !isOlder(v.banlist, latest)) continue
    const prev = findBanlist(cards.banlists, v.banlist)
    if (!prev) continue
    const [entry] = diffLegality(prev, latest, [{ id: v.id, kind: 'variant', deck: v.deck, rules: v.rules }], cards.index)
    if (!entry || !entry.becameIllegal) continue
    const g = out.get(latest.format) ?? { latest, items: [] }
    g.items.push({ variant: v, entry })
    out.set(latest.format, g)
  }
  return [...out.values()]
}

interface Props {
  variants: readonly Variant[]
  archetypes: readonly Archetype[]
  cards: CardsReady
  lang: 'it' | 'en'
}

export function NewBanlistNotice({ variants, archetypes, cards, lang }: Props) {
  const { t } = useTranslation()
  const [dismissed, setDismissed] = useState(readDismissed)
  const text = useIssueText(cards.index, lang)
  const groups = useMemo(() => computeBanlistGroups(variants, cards), [variants, cards])
  const visible = groups.filter((g) => dismissed[g.latest.format] !== g.latest.id)
  if (!visible.length) return null

  const dismiss = (g: Group) => {
    const next = { ...dismissed, [g.latest.format]: g.latest.id }
    setDismissed(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignora */
    }
  }

  const archName = (id: string) => localized(archetypes.find((a) => a.id === id)?.name, lang, t('archetypes.untitled'))

  return (
    <div className="flex flex-col gap-3" data-testid="banlist-notices">
      {visible.map((g) => {
        const label = banlistLabel(g.latest)
        return (
          <Banner
            key={g.latest.format}
            tone="warn"
            title={t('banlistNotice.title', { banlist: label, count: g.items.length })}
            onDismiss={() => dismiss(g)}
          >
            <p>{t('banlistNotice.body', { banlist: label })}</p>
            <ul className="mt-3 flex flex-col gap-2" data-testid="banlist-notice-list">
              {g.items.map(({ variant, entry }) => (
                <li key={variant.id} className="rounded-md border border-line bg-surface-2 p-3">
                  <Link
                    to="/mazzi/$variantId"
                    params={{ variantId: variant.id }}
                    className="inline-flex min-h-11 max-w-full items-center font-medium text-accent-text underline-offset-2 hover:underline"
                  >
                    <span className="[overflow-wrap:anywhere]">
                      {archName(variant.archetypeId)} / {localized(variant.name, lang, t('decks.defaultVariantName'))}
                    </span>
                  </Link>
                  <ul className="mt-1 flex flex-col gap-1 text-[15px] text-fg">
                    {entry.newIssues.slice(0, 3).map((i, k) => (
                      <li key={k} className="[overflow-wrap:anywhere]">
                        {text(i)}
                      </li>
                    ))}
                    {entry.newIssues.length > 3 ? <li className="text-muted">{t('banlistNotice.more', { count: entry.newIssues.length - 3 })}</li> : null}
                  </ul>
                  <Button
                    className="mt-2"
                    onClick={async () => {
                      await repos.variants.update(variant.id, { banlist: { format: g.latest.format, id: g.latest.id } })
                      toast(t('banlistNotice.updated', { banlist: label }), { tone: 'ok' })
                    }}
                  >
                    {t('banlistNotice.switch', { banlist: label })}
                  </Button>
                </li>
              ))}
            </ul>
          </Banner>
        )
      })}
    </div>
  )
}
