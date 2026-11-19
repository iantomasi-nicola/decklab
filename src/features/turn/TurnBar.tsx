import { useEffect, useRef, type KeyboardEvent } from 'react'
import { PHASES, legalTransitions, phaseIndex, type Phase, type PhaseTransition, type TransitionKind } from '@/domain/combo/turn'
import { GameIcon, PHASE_ICON } from '@/ui/gameIcons'
import { useTurnT } from './strings'
import './turn.css'

export interface TurnBarProps {
  phase: Phase
  /** Transizioni disponibili (default: quelle valide dalla fase corrente, `TurnState.phaseTransitions`). */
  transitions?: readonly PhaseTransition[]
  /** Chiamata quando l'utente sceglie una fase raggiungibile. */
  onPhaseChange?: (to: Phase, kind: TransitionKind) => void
  /** Abilita ogni fase (modifica libera). Default: solo le transizioni valide. */
  free?: boolean
  disabled?: boolean
  /** Numero del turno da mostrare a sinistra (omesso = nascosto). */
  turn?: number
  /** Scorciatoie globali Alt+1…6 (salta alla fase) e Alt+N (successiva). Default: attive. */
  shortcuts?: boolean
  className?: string
}

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

/** Barra delle fasi del turno: sei pulsanti (≥44px), fase corrente evidente, compatta su telefono (icona sopra, etichetta sotto). */
export function TurnBar({ phase, transitions, onPhaseChange, free, disabled, turn, shortcuts = true, className }: TurnBarProps) {
  const { t } = useTurnT()
  const trans = transitions ?? legalTransitions(phase)
  const ref = useRef<HTMLDivElement>(null)
  const cur = phaseIndex(phase)
  const reach = (p: Phase): PhaseTransition | undefined => trans.find((x) => x.to === p)
  const canGo = (p: Phase) => !disabled && p !== phase && (free || !!reach(p))
  const go = (p: Phase) => {
    if (canGo(p)) onPhaseChange?.(p, reach(p)?.kind ?? (phaseIndex(p) === cur + 1 ? 'next' : 'skip'))
  }

  // refs per leggere l'ultimo stato dentro il listener globale senza ri-registrarlo a ogni render
  const latest = useRef({ go, trans, phase, disabled })
  latest.current = { go, trans, phase, disabled }
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return
      const L = latest.current
      const m = /^Digit([1-6])$/.exec(e.code)
      if (m) {
        const p = PHASES[Number(m[1]) - 1]!
        e.preventDefault()
        L.go(p)
      } else if (e.code === 'KeyN') {
        const next = L.trans.find((x) => x.kind === 'next')
        if (next) {
          e.preventDefault()
          L.go(next.to)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcuts])

  const onToolbarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key)) return
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (!btns.length) return
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length
    e.preventDefault()
    btns[n]?.focus()
  }

  return (
    <div className={`tbar-wrap${className ? ` ${className}` : ''}`}>
      {turn !== undefined ? <span className="tbar-turn">{t('bar.turn', { n: turn })}</span> : null}
      <div ref={ref} className="tbar" role="toolbar" aria-label={t('bar.label')} title={shortcuts ? t('bar.shortcuts') : undefined} onKeyDown={onToolbarKey}>
        {PHASES.map((p, i) => {
          const isCur = p === phase
          const ok = canGo(p)
          const state = isCur ? 'current' : i < cur ? 'past' : ok ? 'next' : 'locked'
          const name = t(`phase.${p}`)
          const aria = isCur ? t('bar.current', { p: name }) : ok ? t('bar.go', { p: name }) : i < cur ? t('bar.past', { p: name }) : t('bar.locked', { p: name })
          return (
            <button
              key={p}
              type="button"
              className="tbar-btn"
              data-phase={p}
              data-state={state}
              aria-current={isCur ? 'step' : undefined}
              aria-label={aria}
              title={`${i + 1} · ${name}`}
              disabled={!isCur && !ok}
              aria-disabled={isCur ? true : undefined}
              onClick={() => go(p)}
            >
              <GameIcon name={PHASE_ICON[p]} size={20} label={false} />
              <span className="tbar-num" aria-hidden>{i + 1}</span>
              <span className="tbar-label">{name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
