import { useTranslation } from 'react-i18next'
import type { HandResult, TournamentResult } from '@/domain/stats'
import { Legend, SplitBar } from './charts/SplitBar'
import { dec, pct } from './format'
import { Progress, StatTile, useLang } from './parts'

/** Il numero che interessa: quante mani di partenza si giocano. Un solo elemento in evidenza, il resto resta quieto. */
export function Hero({
  hand,
  other,
  tour,
  rounds,
  progress,
  running,
}: {
  hand: HandResult
  other: HandResult | undefined
  tour: TournamentResult
  rounds: number
  progress: number
  running: boolean
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const playable = pct(hand.playable, lang)
  const brick = pct(hand.brick, lang)
  return (
    <section data-testid="stats-hero" aria-busy={running} className="rounded-lg border border-line bg-surface-1 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] text-muted">{t('statsLab.hero.caption', { count: hand.handSize })}</p>
          <p className="viz-hero mt-2 text-fg" data-testid="hero-playable">
            {playable}
          </p>
          <p className="mt-2 text-base font-medium text-fg">{t('statsLab.hero.playable')}</p>
        </div>
        <p className="max-w-[34ch] text-[15px] text-muted md:text-right">
          {t(hand.blanks ? 'statsLab.hero.deckAssumed' : 'statsLab.hero.deck', { size: hand.deckSize, blanks: hand.blanks, count: hand.ruleCount })}
        </p>
      </div>
      <div className="mt-6">
        <SplitBar
          ariaLabel={t('statsLab.hero.barLabel', { playable, brick })}
          parts={[
            { key: 'p', label: t('statsLab.playable'), value: hand.playable, color: 'var(--viz-playable)', text: playable },
            { key: 'b', label: t('statsLab.brick'), value: hand.brick, color: 'var(--viz-brick)', text: brick },
          ]}
        />
        <div className="mt-3">
          <Legend
            items={[
              { key: 'p', label: t('statsLab.playable'), color: 'var(--viz-playable)' },
              { key: 'b', label: t('statsLab.brick'), color: 'var(--viz-brick)' },
            ]}
          />
        </div>
        <div className="mt-2">
          <Progress value={progress} active={running} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label={t('statsLab.hero.tileHand', { count: hand.handSize })} value={pct(hand.brick, lang)} hint={t('statsLab.hero.tileBrick')} emphasis />
        {other ? <StatTile label={t('statsLab.hero.tileHand', { count: other.handSize })} value={pct(other.brick, lang)} hint={t('statsLab.hero.tileBrick')} /> : null}
        <StatTile
          label={t('statsLab.hero.tileTournament', { count: rounds })}
          value={pct(tour.pAtLeast1, lang)}
          hint={t('statsLab.hero.tileTournamentHint', { n: dec(tour.expectedBricks, lang) })}
        />
      </div>
    </section>
  )
}
