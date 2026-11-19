import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Uid } from '@/domain/combo/types'
import type { TurnLogEntry, TurnState } from '@/domain/combo/turn'
import { GameIcon, iconForAction, iconForEffect, iconLabel, METHOD_ICON, PHASE_ICON, type GameIconName } from '@/ui/gameIcons'
import { useTurnT } from './strings'
import './turn.css'

export interface TurnStatusProps {
  turn: TurnState
  /** Totale degli effetti OPT della combo (`optTotalInDoc(doc)`): mostra "usati su totali". Omesso = solo gli usati. */
  optTotal?: number
  /** Nome leggibile di una carta (nella lingua corrente). Default: l'uid. */
  cardName?: (uid: Uid, code?: number) => string
  /** Se dato, ogni riga del promemoria è un pulsante che salta a quel passo (0-based). */
  onJumpToStep?: (stepIndex: number) => void
  /** Promemoria aperto all'inizio. */
  defaultOpen?: boolean
  className?: string
}

function Chip({ tone, icon, children, title }: { tone: 'done' | 'open' | 'info' | 'warn'; icon: GameIconName; children: ReactNode; title?: string }) {
  return (
    <li className="tchip" data-tone={tone} title={title}>
      <GameIcon name={icon} size={16} label={false} />
      <span>{children}</span>
    </li>
  )
}

/** Icona e testo di una voce del promemoria. */
function useLogRow() {
  const { t, lang } = useTurnT()
  return (e: TurnLogEntry, name: (uid: Uid, code?: number) => string) => {
    const who = e.uid ? name(e.uid, e.code) : ''
    let icon: GameIconName = 'check'
    let what = ''
    switch (e.type) {
      case 'normalSummon': case 'tributeSummon': case 'setMonster': case 'flipSummon': case 'specialSummon':
        icon = iconForAction(e.type) ?? 'check'
        what = iconLabel(icon, lang)
        break
      case 'pendulum':
        icon = METHOD_ICON.pendulum ?? 'pendulum'
        what = iconLabel('pendulum', lang)
        break
      case 'effect':
        icon = iconForEffect(e.kind) ?? 'activation'
        what = e.index != null ? t('log.effect', { i: e.index }) : t('log.effectNoIndex')
        break
      case 'attack': icon = 'attack'; what = iconLabel('attack', lang); break
      case 'phase': icon = e.phase ? PHASE_ICON[e.phase] : 'check'; what = t('log.phase', { p: e.phase ? t(`phase.${e.phase}`) : '' }); break
      case 'turn': icon = 'phaseEnd'; what = t('log.turn'); break
    }
    if (e.type === 'specialSummon' && e.method && METHOD_ICON[e.method]) {
      icon = METHOD_ICON[e.method]!
      what = `${iconLabel('specialSummon', lang)} · ${iconLabel(icon, lang)}`
    }
    const tags: string[] = []
    if (e.type === 'effect' && e.opt) tags.push(e.repeat ? t('log.repeat') : t('log.opt'))
    return { icon, what, who, tags, warn: !!e.repeat }
  }
}

/** Chip di stato del turno (Evocazione Normale, effetti OPT, attacchi, segnalini) + promemoria espandibile di ciò che è già stato fatto. */
export function TurnStatus({ turn, optTotal, cardName, onJumpToStep, defaultOpen = false, className }: TurnStatusProps) {
  const { t } = useTurnT()
  const row = useLogRow()
  const [open, setOpen] = useState(defaultOpen)
  const listId = useId()
  const name = cardName ?? ((u: Uid) => u)
  const multi = turn.normalSummonsMax > 1
  const log = turn.log.filter((e) => e.type !== 'phase')
  const attackedN = turn.attacked.length

  return (
    <section className={`tstat${className ? ` ${className}` : ''}`} aria-label={t('status.label')}>
      <ul className="tstat-chips">
        {turn.normalSummonUsed ? (
          <Chip tone="done" icon="check" title={t('status.normalTitleDone')}>{t('status.normalDone')}</Chip>
        ) : (
          <Chip tone="open" icon="normalSummon" title={t('status.normalTitleOpen')}>
            {multi && turn.normalSummonsDone > 0 ? t('status.normalDoneCount', { n: turn.normalSummonsDone, m: turn.normalSummonsMax }) : t('status.normalOpen')}
          </Chip>
        )}
        <Chip tone={turn.optUsedCount > 0 ? 'done' : 'open'} icon="once" title={t('status.optTitle')}>
          {optTotal !== undefined ? t('status.optOf', { n: turn.optUsedCount, m: Math.max(optTotal, turn.optUsedCount) }) : t('status.opt', { n: turn.optUsedCount })}
        </Chip>
        {turn.optOverused.length > 0 ? <Chip tone="warn" icon="negate">{t('status.optOver', { n: turn.optOverused.length })}</Chip> : null}
        {turn.pendulumSummonUsed ? <Chip tone="done" icon="pendulum">{t('status.pendulum')}</Chip> : null}
        {turn.specialSummons > 0 ? <Chip tone="info" icon="specialSummon">{t('status.specials', { n: turn.specialSummons })}</Chip> : null}
        {attackedN > 0 ? <Chip tone="info" icon="attack">{t('status.attacked', { n: attackedN })}</Chip> : null}
        {turn.counterTotal > 0 ? <Chip tone="info" icon="counter">{t('status.counters', { n: turn.counterTotal })}</Chip> : null}
      </ul>
      <button type="button" className="tstat-more" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
        <GameIcon name="check" size={20} label={false} />
        <span className="tstat-more-label">{t('status.reminder')}</span>
        <span className="tstat-more-count">{log.length}</span>
        <ChevronDown size={20} strokeWidth={1.75} aria-hidden className="tstat-chev" />
      </button>
      {open ? (
        <div id={listId} className="tlog" role="region" aria-label={t('status.reminder')}>
          {log.length === 0 ? (
            <p className="tlog-empty">{t('status.empty')}</p>
          ) : (
            <ol>
              {log.map((e, i) => {
                const r = row(e, name)
                const body = (
                  <>
                    <GameIcon name={r.icon} size={20} label={false} />
                    <span className="tlog-text">
                      <span className="tlog-what">{r.what}</span>
                      {r.who ? <span className="tlog-who">{r.who}</span> : null}
                      {r.tags.map((x) => <span key={x} className="tlog-tag" data-warn={r.warn || undefined}>{x}</span>)}
                    </span>
                    <span className="tlog-n">{e.stepIndex + 1}</span>
                  </>
                )
                return (
                  <li key={`${e.stepId}-${i}`}>
                    {onJumpToStep ? (
                      <button type="button" className="tlog-row" aria-label={`${r.what} ${r.who}. ${t('status.jump', { n: e.stepIndex + 1 })}`} onClick={() => onJumpToStep(e.stepIndex)}>{body}</button>
                    ) : (
                      <div className="tlog-row" data-static>{body}</div>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  )
}
