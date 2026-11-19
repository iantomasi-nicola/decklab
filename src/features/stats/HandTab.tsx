import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { HandResult, Label, SideDiff, Swap } from '@/domain/stats'
import { labelKey } from '@/domain/stats'
import { ROLE_PRESETS } from '@/domain/stats'
import { ChartCard } from './charts/ChartCard'
import { Columns } from './charts/Columns'
import { HBars } from './charts/HBars'
import { Button } from '@/ui/Button'
import { pct, signedPts } from './format'
import { useLang } from './parts'

const ODDS_FIRST = 10

export const roleName = (t: TFunction, role: string): string => ((ROLE_PRESETS as readonly string[]).includes(role) ? t(`statsLab.roles.${role}.name`) : role)

export interface SideView {
  matchup: string
  pre: HandResult
  diff: SideDiff
  swaps: Swap[]
}

export function HandTab({
  hand,
  name,
  onLabel,
  onOpenLabels,
  side,
}: {
  hand: HandResult
  name: (id: number) => string
  /** Etichetta una coppia in un tocco. */
  onLabel: (key: string, label: Label) => void
  onOpenLabels: () => void
  side: SideView | null
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const [allOdds, setAllOdds] = useState(false)
  const p = (v: number) => pct(v, lang, v < 0.1 ? 1 : 0)
  const odds = [...hand.cardOdds].sort((a, b) => b.p - a.p || b.count - a.count)
  const roles = [...hand.roleOdds].sort((a, b) => b.p - a.p)
  const maxBrick = Math.max(0, ...hand.topBricks.map((b) => b.p))
  const hist = hand.engineHist.map((v, i) => ({ key: i, label: String(i), value: v, title: t('statsLab.hand.histTip', { n: i, p: pct(v, lang) }) }))
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {side ? <SideCompareCard hand={hand} side={side} name={name} /> : null}
      {hand.unknownPairs.length ? <UnknownPairsCard pairs={hand.unknownPairs} name={name} onLabel={onLabel} onOpenLabels={onOpenLabels} /> : null}
      <ChartCard
        testId="chart-engine"
        title={t('statsLab.hand.histTitle')}
        subtitle={t('statsLab.hand.histSub', { count: hand.handSize })}
        table={{ head: [t('statsLab.hand.histCol'), t('statsLab.col.prob')], rows: hand.engineHist.map((v, i) => [i, pct(v, lang)]) }}
      >
        <Columns data={hist} format={(v) => pct(v, lang, 0)} ariaLabel={t('statsLab.hand.histTitle')} />
      </ChartCard>

      <ChartCard
        testId="chart-roles"
        title={t('statsLab.hand.rolesTitle')}
        subtitle={t('statsLab.hand.rolesSub')}
        table={{ head: [t('statsLab.col.role'), t('statsLab.col.copies'), t('statsLab.col.prob')], rows: roles.map((r) => [roleName(t, r.role), r.copies, pct(r.p, lang)]) }}
      >
        {roles.length ? (
          <HBars rows={roles.map((r) => ({ key: r.role, label: roleName(t, r.role), sub: `×${r.copies}`, value: r.p, text: p(r.p) }))} max={1} />
        ) : (
          <p className="text-[15px] text-muted">{t('statsLab.hand.noRoles')}</p>
        )}
      </ChartCard>

      <ChartCard
        testId="chart-odds"
        title={t('statsLab.hand.oddsTitle')}
        subtitle={t('statsLab.hand.oddsSub', { count: hand.handSize })}
        table={{ head: [t('statsLab.col.card'), t('statsLab.col.copies'), t('statsLab.col.prob')], rows: odds.map((o) => [name(o.id), o.count, pct(o.p, lang)]) }}
      >
        <HBars rows={(allOdds ? odds : odds.slice(0, ODDS_FIRST)).map((o) => ({ key: o.id, label: name(o.id), sub: `×${o.count}`, value: o.p, text: p(o.p) }))} max={1} />
        {odds.length > ODDS_FIRST ? (
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setAllOdds((v) => !v)}>
              {allOdds ? t('statsLab.hand.showFewer') : t('statsLab.hand.showAll', { count: odds.length - ODDS_FIRST })}
            </Button>
          </div>
        ) : null}
      </ChartCard>

      <ChartCard
        testId="chart-bricks"
        title={t('statsLab.hand.bricksTitle')}
        subtitle={t('statsLab.hand.bricksSub')}
        table={{
          head: [t('statsLab.col.hand'), t('statsLab.col.prob')],
          rows: hand.topBricks.map((b) => [describe(b, name, t), pct(b.p, lang)]),
        }}
      >
        {hand.topBricks.length ? (
          <ol className="flex flex-col gap-3">
            {hand.topBricks.map((b, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1">
                <span className="min-w-0 text-[15px] text-fg">{describe(b, name, t)}</span>
                <span className="text-[15px] font-semibold tabular-nums text-fg">{pct(b.p, lang)}</span>
                <span aria-hidden className="col-span-2 block h-1 rounded-full bg-surface-3">
                  <span className="block h-full rounded-full" style={{ width: `${maxBrick ? (b.p / maxBrick) * 100 : 0}%`, background: 'var(--viz-brick)' }} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[15px] text-muted">{t('statsLab.hand.noBricks')}</p>
        )}
      </ChartCard>
    </div>
  )
}

function describe(b: HandResult['topBricks'][number], name: (id: number) => string, t: TFunction): string {
  const parts = b.cards.map((c) => (c.n > 1 ? `${name(c.id)} ×${c.n}` : name(c.id)))
  if (b.fill > 0) parts.push(t('statsLab.hand.fillCards', { count: b.fill }))
  return parts.join(' + ')
}

const FIRST_PAIRS = 6

/** Coppie C2 che nessuna fonte copre: etichettabili in un tocco (Giocabile / Brick), le più probabili per prime. */
function UnknownPairsCard({
  pairs,
  name,
  onLabel,
  onOpenLabels,
}: {
  pairs: HandResult['unknownPairs']
  name: (id: number) => string
  onLabel: (key: string, label: Label) => void
  onOpenLabels: () => void
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const [all, setAll] = useState(false)
  const shown = all ? pairs : pairs.slice(0, FIRST_PAIRS)
  return (
    <section data-testid="unknown-pairs" className="min-w-0 rounded-lg border border-line bg-surface-1 p-4 md:p-6 lg:col-span-2">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">{t('statsLab.unknownPairs.title', { count: pairs.length })}</h3>
          <p className="mt-1 max-w-[64ch] text-sm text-muted">{t('statsLab.unknownPairs.hint')}</p>
        </div>
        <Button variant="secondary" onClick={onOpenLabels}>
          {t('statsLab.unknownPairs.matrix')}
        </Button>
      </header>
      <ul className="flex flex-col divide-y divide-line">
        {shown.map((p) => {
          const key = labelKey(p.ids)
          const label = p.ids.map(name).join(' + ')
          return (
            <li key={key} className="grid gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="break-words text-[15px] font-medium text-fg">{label}</p>
                <p className="text-sm text-muted">{t('statsLab.unknownPairs.inHand', { p: pct(p.p, lang) })}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" aria-label={t('statsLab.unknownPairs.markPlayable', { names: label })} onClick={() => onLabel(key, 'PLAYABLE')}>
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: 'var(--viz-playable)' }} />
                  {t('statsLab.playable')}
                </Button>
                <Button variant="secondary" aria-label={t('statsLab.unknownPairs.markBrick', { names: label })} onClick={() => onLabel(key, 'BRICK')}>
                  <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: 'var(--viz-brick)' }} />
                  {t('statsLab.brick')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
      {pairs.length > FIRST_PAIRS ? (
        <div className="mt-4">
          <Button variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? t('statsLab.hand.showFewer') : t('statsLab.unknownPairs.more', { count: pairs.length - FIRST_PAIRS })}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

/** Pre-side contro post-side: variazioni e mani brick che cambiano. */
function SideCompareCard({ hand, side, name }: { hand: HandResult; side: SideView; name: (id: number) => string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const pre = side.pre
  const grouped = [...side.swaps.reduce((m, sw) => m.set(`${sw.out}-${sw.in}`, { ...sw, n: (m.get(`${sw.out}-${sw.in}`)?.n ?? 0) + 1 }), new Map<string, { out: number; in: number; n: number }>()).values()]
  const rows: { key: string; label: string; pre: number; post: number; d: number }[] = [
    { key: 'p', label: t('statsLab.playable'), pre: pre.playable, post: hand.playable, d: side.diff.dPlayable },
    ...(pre.unknown > 1e-9 || hand.unknown > 1e-9 ? [{ key: 'u', label: t('statsLab.unknown'), pre: pre.unknown, post: hand.unknown, d: side.diff.dUnknown }] : []),
    { key: 'b', label: t('statsLab.brick'), pre: pre.brick, post: hand.brick, d: side.diff.dBrick },
  ]
  const hands = (b: { cards: { id: number; n: number }[]; fill: number }) => {
    const parts = b.cards.map((c) => (c.n > 1 ? `${name(c.id)} ×${c.n}` : name(c.id)))
    if (b.fill > 0) parts.push(t('statsLab.hand.fillCards', { count: b.fill }))
    return parts.join(' + ')
  }
  return (
    <section data-testid="side-compare" className="min-w-0 rounded-lg border border-line bg-surface-1 p-4 md:p-6 lg:col-span-2">
      <h3 className="text-base font-semibold text-fg">{t('statsLab.side.title', { matchup: side.matchup })}</h3>
      <p className="mt-1 text-sm text-muted">{t('statsLab.side.subtitle', { count: hand.handSize })}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-[15px]">
          <caption className="sr-only">{t('statsLab.side.title', { matchup: side.matchup })}</caption>
          <thead>
            <tr className="border-b border-line text-sm text-muted">
              <th scope="col" className="py-2 text-left font-medium" />
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">{t('statsLab.side.colPre')}</th>
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">{t('statsLab.side.colPost')}</th>
              <th scope="col" className="whitespace-nowrap py-2 pl-3 text-right font-medium">{t('statsLab.side.colDelta')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-2 text-left font-medium text-fg">{r.label}</th>
                <td className="py-2 pl-3 text-right tabular-nums text-muted">{pct(r.pre, lang)}</td>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums text-fg">{pct(r.post, lang)}</td>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums text-fg">{signedPts(r.d, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-fg">{t('statsLab.side.swaps')}</h4>
          <ul className="mt-2 flex flex-col gap-1 text-[15px] text-muted" data-testid="side-swaps">
            {grouped.map((g) => (
              <li key={`${g.out}-${g.in}`} className="break-words">
                {g.out ? <span className="text-fg">−{g.n} {name(g.out)}</span> : null}
                {g.out && g.in ? <span aria-hidden> → </span> : null}
                {g.in ? <span className="text-fg">+{g.n} {name(g.in)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h4 className="text-[15px] font-semibold text-fg">{t('statsLab.side.bricks')}</h4>
          {side.diff.bricks.length ? (
            <ul className="mt-2 flex flex-col gap-3" data-testid="side-bricks">
              {side.diff.bricks.slice(0, 6).map((b, i) => (
                <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 text-[15px]">
                  <span className="min-w-0 break-words text-fg">{hands(b)}</span>
                  <span className="whitespace-nowrap tabular-nums text-muted">
                    {b.pre === null ? '—' : pct(b.pre, lang)} → <span className="font-semibold text-fg">{b.post === null ? '—' : pct(b.post, lang)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[15px] text-muted">{t('statsLab.side.noBrickChange')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
