import type { SVGProps } from 'react'
import { ICON_PATHS, type GameIconName } from './paths'
import { iconLabel, useIconLang } from './labels'

export interface GameIconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height' | 'children'> {
  name: GameIconName
  /** Lato in px (default 24). Lo spessore del tratto resta 1,75px a ogni dimensione. */
  size?: number
  /** Etichetta accessibile; default = nome localizzato. `false` = decorativa (nascosta agli screen reader). */
  label?: string | false
}

/** Icona di gioco: tratto 1,75px, `currentColor`, viewBox 24. */
export function GameIcon({ name, size = 24, label, strokeWidth, ...rest }: GameIconProps) {
  const lang = useIconLang()
  const text = label === false ? undefined : (label ?? iconLabel(name, lang))
  const sw = strokeWidth ?? (1.75 * 24) / size
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={text ? 'img' : undefined}
      aria-label={text}
      aria-hidden={text ? undefined : true}
      focusable="false"
      {...rest}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
