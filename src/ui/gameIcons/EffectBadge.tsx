import type { ReactNode } from 'react'
import { GameIcon } from './GameIcon'
import { iconLabel, useIconLang, type IconLang } from './labels'
import type { GameIconName } from './paths'
import './gameIcons.css'

export type BadgeKind = 'ignition' | 'quick' | 'trigger' | 'continuous' | 'activation' | 'chain'

/** Forma per tipo (silhouette distinta, leggibile anche in scala di grigi). Coordinate su viewBox 32. */
const SHAPES: Record<BadgeKind, { node: ReactNode; icon: number }> = {
  ignition: { node: <circle cx="16" cy="16" r="14.25" />, icon: 0.58 },
  quick: { node: <path d="M16 1.75 28.35 8.88v14.24L16 30.25 3.65 23.12V8.88Z" />, icon: 0.54 },
  trigger: { node: <path d="M16 1.5 30.5 16 16 30.5 1.5 16Z" />, icon: 0.44 },
  continuous: { node: <rect x="2" y="2" width="28" height="28" rx="9" />, icon: 0.56 },
  activation: { node: <rect x="6" y="1.75" width="20" height="28.5" rx="4.5" />, icon: 0.44 },
  chain: { node: <circle cx="16" cy="16" r="13.5" />, icon: 0 },
}

const KIND_ICON: Record<Exclude<BadgeKind, 'chain'>, GameIconName> = {
  ignition: 'ignition', quick: 'quick', trigger: 'trigger', continuous: 'continuous', activation: 'activation',
}

export interface EffectBadgeProps {
  kind: BadgeKind
  /** Numero dell'effetto sulla carta (1-based); per `chain` è il numero dell'anello (Catena N). */
  index?: number
  size?: 'sm' | 'md'
  className?: string
  /** Etichetta accessibile; default "Effetto Ignition 1" / "Catena 2". */
  label?: string
}

const labelFor = (kind: BadgeKind, index: number | undefined, lang: IconLang): string => {
  const base = iconLabel(kind, lang)
  return index === undefined ? base : `${base} ${index}`
}

/** Badge del tipo di effetto: colore + forma + icona. Il numero (indice effetto, o anello di catena) è un indicatore ulteriore. */
export function EffectBadge({ kind, index, size = 'md', className, label }: EffectBadgeProps) {
  const lang = useIconLang()
  const { node, icon } = SHAPES[kind]
  const px = size === 'sm' ? 28 : 36
  const text = label ?? labelFor(kind, index, lang)
  return (
    <span className={`ebadge${className ? ` ${className}` : ''}`} data-kind={kind} data-size={size} role="img" aria-label={text} title={text}>
      <svg className="ebadge-shape" viewBox="0 0 32 32" aria-hidden focusable="false">
        {node}
      </svg>
      {kind === 'chain' ? (
        <span className="ebadge-num" aria-hidden>{index ?? ''}</span>
      ) : (
        <GameIcon name={KIND_ICON[kind]} size={Math.round(px * icon)} label={false} className="ebadge-icon" />
      )}
      {kind !== 'chain' && index !== undefined ? <span className="ebadge-pip" aria-hidden>{index}</span> : null}
    </span>
  )
}
