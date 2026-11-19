import type { EffectKind } from '@/domain/combo/types'
import { effectAvailability, usesOfCard, type EffectUse, type TurnState } from '@/domain/combo/turn'
import type { Uid } from '@/domain/combo/types'
import { GameIcon } from '@/ui/gameIcons'
import { useTurnT } from './strings'
import './turn.css'

export interface OncePerTurnMarkProps {
  /** `used` = già attivato in questo turno; `available` = ancora attivabile. */
  state: 'used' | 'available'
  /** Numero dell'effetto sulla carta (1-based). */
  index?: number | null
  /** Quante volte è stato attivato (> 1 = incoerenza: marcatura di avviso). */
  count?: number
  /** True se la regola è per nome carta (tutte le copie): lo segnala nell'etichetta. */
  byName?: boolean
  kind?: EffectKind
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Marcatura "una volta per turno" da posare su una carta (posizionala con il tuo layout: è un elemento inline di 24px o 20px).
 * Disponibile = anello con "1"; usato = disco pieno con spunta (forma e riempimento diversi: non dipende dal colore);
 * usato più volte = disco di avviso con "×N".
 */
export function OncePerTurnMark({ state, index, count = state === 'used' ? 1 : 0, byName, size = 'md', className }: OncePerTurnMarkProps) {
  const { t } = useTurnT()
  const hasI = index !== null && index !== undefined
  const over = state === 'used' && count > 1
  const base = over
    ? t('mark.usedTimes', { i: hasI ? index : '', n: count })
    : state === 'used'
      ? hasI ? t('mark.used', { i: index }) : t('mark.usedNoIndex')
      : hasI ? t('mark.open', { i: index }) : t('mark.openNoIndex')
  const text = byName ? `${base}, ${t('mark.byName')}` : base
  const px = size === 'sm' ? 20 : 24
  return (
    <span className={`opt-mark${className ? ` ${className}` : ''}`} data-state={over ? 'over' : state} data-size={size} role="img" aria-label={text} title={text}>
      <GameIcon name={state === 'used' ? 'check' : 'once'} size={Math.round(px * (state === 'used' ? 0.62 : 0.9))} label={false} />
      {hasI ? <span className="opt-mark-i" aria-hidden>{index}</span> : null}
      {over ? <span className="opt-mark-n" aria-hidden>×{count}</span> : null}
    </span>
  )
}

export interface CardOptMarksProps {
  turn: TurnState
  uid: Uid
  code?: number
  /** Indici degli effetti OPT noti della carta: quelli non ancora usati compaiono come "disponibili". */
  indices?: readonly number[]
  size?: 'sm' | 'md'
  className?: string
}

/** Tutte le marcature OPT di una carta nello stato del turno: gli effetti usati e, se `indices` è dato, anche i disponibili. */
export function CardOptMarks({ turn, uid, code, indices, size, className }: CardOptMarksProps) {
  const used: EffectUse[] = usesOfCard(turn, uid, code)
  const items: { index: number | null; used: boolean; count: number; byName: boolean }[] = used.map((u) => ({ index: u.index, used: true, count: u.count, byName: u.scope === 'name' }))
  for (const i of indices ?? []) {
    if (!effectAvailability(turn, { uid, ...(code !== undefined ? { code } : {}), index: i }).used) items.push({ index: i, used: false, count: 0, byName: false })
  }
  if (!items.length) return null
  items.sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
  return (
    <span className={`opt-marks${className ? ` ${className}` : ''}`}>
      {items.map((m) => (
        <OncePerTurnMark key={m.index ?? 'x'} state={m.used ? 'used' : 'available'} index={m.index} count={m.count} byName={m.byName} {...(size ? { size } : {})} />
      ))}
    </span>
  )
}
