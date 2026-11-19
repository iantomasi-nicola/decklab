import { useTranslation } from 'react-i18next'
import type { HandResult, SideDiff, TournamentResult } from '@/domain/stats'
import { Legend, SplitBar } from './charts/SplitBar'
import { dec, pct, signedPts } from './format'
import { Progress, StatTile, useLang } from './parts'

/** Il numero che interessa: quante mani di partenza si giocano. Un solo elemento in evidenza, il resto resta quieto. */
export function Hero({
  hand,
  other,
  tour,
  rounds,
  progress,
  running,
  tourMax,
  side,
  onConfirm,
}: {
  hand: HandResult
  other: HandResult | undefined
  tour: TournamentResult
  rounds: number
  progress: number
  running: boolean
  /** Torneo nel caso peggiore (le mani da confermare contano come brick). */
  tourMax: TournamentResult
  /** Confronto con il pre-side quando è scelto un piano. */
  side: { matchup: string; diff: SideDiff } | null
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const playable = pct(hand.playable, lang)
  const brick = pct(hand.brick, lang)
  const unknown = hand.unknown > 1e-9
  const maxPlayable = pct(hand.playable + hand.unknown, lang)
  const unknownTxt = pct(hand.unknown, lang)
  return (
    <section data-testid="stats-hero" aria-busy={running} className="rounded-lg border border-line bg-surface-1 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] text-muted">{t('statsLab.hero.caption', { count: hand.handSize })}</p>
          <p className="viz-hero mt-2 text-fg" data-testid="hero-playable">
            {playable}
          </p>
          <p className="mt-2 text-base font-medium text-fg">{t('statsLab.hero.playable')}</p>
          {unknown ? (
            <p className="mt-2 max-w-[44ch] text-[15px] text-muted" data-testid="hero-range">
              {t('statsLab.hero.range', { max: maxPlayable })}{' '}
              <button type="button" onClick={onConfirm} className="inline min-h-11 cursor-pointer font-medium text-accent-text underline underline-offset-2 hover:text-fg">
                {t('statsLab.hero.confirm')}
              </button>
            </p>
          ) : null}
        </div>
        <p className="max-w-[34ch] text-[15px] text-muted lg:text-right">
          {t(hand.blanks ? 'statsLab.hero.deckAssumed' : 'statsLab.hero.deck', { size: hand.deckSize, blanks: hand.blanks, count: hand.ruleCount })}
        </p>
      </div>
      {side ? (
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface-2 px-3 py-2 text-[15px] text-fg" data-testid="hero-side">
          <span className="font-medium">{t('statsLab.side.heroTitle', { matchup: side.matchup })}</span>
          <span className="text-muted">{t('statsLab.side.dPlayable', { d: signedPts(side.diff.dPlayable, lang) })}</span>
          <span className="text-muted">{t('statsLab.side.dBrick', { d: signedPts(side.diff.dBrick, lang) })}</span>
        </p>
      ) : null}
      <div className="mt-6">
        <SplitBar
          ariaLabel={t('statsLab.hero.barLabel', { playable, brick, unknown: unknownTxt })}
          parts={[
            { key: 'p', label: t('statsLab.playable'), value: hand.playable, color: 'var(--viz-playable)', text: playable },
            { key: 'u', label: t('statsLab.unknown'), value: hand.unknown, color: 'var(--viz-unknown)', text: unknownTxt, hatch: true },
            { key: 'b', label: t('statsLab.brick'), value: hand.brick, color: 'var(--viz-brick)', text: brick },
          ]}
        />
        <div className="mt-3">
          <Legend
            items={[
              { key: 'p', label: t('statsLab.playable'), color: 'var(--viz-playable)' },
              ...(unknown ? [{ key: 'u', label: t('statsLab.unknown'), color: 'var(--viz-unknown)' }] : []),
              { key: 'b', label: t('statsLab.brick'), color: 'var(--viz-brick)' },
            ]}
          />
        </div>
        <div className="mt-2">
          <Progress value={progress} active={running} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label={t('statsLab.hero.tileHand', { count: hand.handSize })} value={pct(hand.brick, lang)} hint={unknown ? t('statsLab.hero.tileBrickMax', { max: pct(hand.brick + hand.unknown, lang) }) : t('statsLab.hero.tileBrick')} emphasis />
        {other ? <StatTile label={t('statsLab.hero.tileHand', { count: other.handSize })} value={pct(other.brick, lang)} hint={other.unknown > 1e-9 ? t('statsLab.hero.tileBrickMax', { max: pct(other.brick + other.unknown, lang) }) : t('statsLab.hero.tileBrick')} /> : null}
        <StatTile
          className="col-span-2 lg:col-span-1"
          label={t('statsLab.hero.tileTournament', { count: rounds })}
          value={pct(tour.pAtLeast1, lang)}
          hint={tourMax.pAtLeast1 - tour.pAtLeast1 > 1e-6 ? t('statsLab.hero.tileTournamentMax', { max: pct(tourMax.pAtLeast1, lang) }) : t('statsLab.hero.tileTournamentHint', { n: dec(tour.expectedBricks, lang) })}
        />
      </div>
    </section>
  )
}
