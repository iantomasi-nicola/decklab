/**
 * Set di icone di gioco: un solo stile (tratto, 24px, terminali e giunzioni arrotondati, niente riempimenti).
 * Ogni voce è il contenuto SVG di un viewBox 24x24; lo spessore a schermo lo fissa <GameIcon> (1.75px).
 * Convenzione: area utile 3..21, "carta" = rettangolo 10x16 con raggio 2.
 */
import type { ReactNode } from 'react'

export const ICON_NAMES = [
  // tipi di effetto
  'ignition', 'quick', 'trigger', 'continuous', 'activation', 'chain',
  // esiti
  'negate', 'destroy', 'search', 'draw', 'discard', 'toGY', 'banish', 'toHand', 'toDeck',
  // evocazioni
  'normalSummon', 'tributeSummon', 'setMonster', 'flipSummon', 'specialSummon',
  // metodi
  'fusion', 'synchro', 'xyz', 'link', 'ritual', 'pendulum',
  // posizioni e campo
  'posAtk', 'posDef', 'posFacedown', 'counter', 'equip', 'attack',
  // fasi
  'phaseDraw', 'phaseStandby', 'phaseMain1', 'phaseMain2', 'phaseBattle', 'phaseEnd',
  // promemoria / interfaccia di gioco
  'once', 'check', 'target',
] as const
export type GameIconName = (typeof ICON_NAMES)[number]

const CARD = 'M8.5 3.5h7a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z'

export const ICON_PATHS: Record<GameIconName, ReactNode> = {
  ignition: <path d="M12 3c.7 3.2 5.5 5.6 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.1 1-3.6 2.3-4.7.3 1.4 1 2.3 1.9 2.7C10.3 8.6 10.9 5.7 12 3Z" />,
  quick: <path d="M13.5 3 6 13.2h5.4L10.5 21 18 10.8h-5.4L13.5 3Z" />,
  trigger: (
    <>
      <path d="M4.5 4v5.5a4 4 0 0 0 4 4H13" />
      <path d="m10.5 10.5 3 3-3 3" />
      <circle cx="18" cy="13.5" r="3" />
    </>
  ),
  continuous: <path d="M12 12c-2-3-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1 5.5-4Zm0 0c2 3 3.5 4 5.5 4a4 4 0 0 0 0-8c-2 0-3.5 1-5.5 4Z" />,
  activation: (
    <>
      <path d={CARD} />
      <path d="m12 8.2 1.1 2.7 2.7 1.1-2.7 1.1L12 15.8l-1.1-2.7L8.2 12l2.7-1.1L12 8.2Z" />
    </>
  ),
  chain: (
    <>
      <path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-.9.9" />
      <path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l.9-.9" />
    </>
  ),

  negate: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
  destroy: (
    <>
      <path d={CARD} />
      <path d="m13.2 3.5-3.4 6.6 4.4 2.4-3.6 8" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  draw: (
    <>
      <path d="M8.5 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M12 17v4" />
      <path d="m9.5 18.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  discard: (
    <>
      <path d="M6.5 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M14.5 12h6" />
      <path d="m18 9.5 2.5 2.5-2.5 2.5" />
    </>
  ),
  toGY: (
    <>
      <path d="M7 20.5V9.5a5 5 0 0 1 10 0v11" />
      <path d="M12 9v6M9.5 11.5h5" />
      <path d="M4 20.5h16" />
    </>
  ),
  banish: (
    <>
      <path d={CARD} strokeDasharray="2.6 3" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  toHand: (
    <>
      <path d="M14 3h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M16 15.5V17a3 3 0 0 1-3 3H5.5" />
      <path d="M8.5 16.5 5 20l3.5 3.5" />
    </>
  ),
  toDeck: (
    <>
      <path d="M12 3v7" />
      <path d="m9 7.5 3 3 3-3" />
      <path d="M6 14h12M6 17.5h12M6 21h12" />
    </>
  ),

  normalSummon: (
    <>
      <path d={CARD} />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  tributeSummon: (
    <>
      <path d={CARD} />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  setMonster: (
    <>
      <path d={CARD} />
      <path d="m12 8 4 4-4 4-4-4 4-4Z" />
    </>
  ),
  flipSummon: (
    <>
      <path d="M17.5 8.5A6.5 6.5 0 0 0 6 10" />
      <path d="M6 5.5V10h4.5" />
      <path d="M6.5 15.5A6.5 6.5 0 0 0 18 14" />
      <path d="M18 18.5V14h-4.5" />
    </>
  ),
  specialSummon: (
    <>
      <path d="m10.5 6 2 5.5 5.5 2-5.5 2-2 5.5-2-5.5L3 13.5l5.5-2 2-5.5Z" />
      <path d="M18.5 3v4M16.5 5h4" />
    </>
  ),

  fusion: (
    <>
      <path d="M5 4c0 5 7 5 7 10v7" />
      <path d="M19 4c0 5-7 5-7 10" />
    </>
  ),
  synchro: (
    <>
      <path d="M19.5 11A7.5 7.5 0 0 0 6.2 7" />
      <path d="M5.5 3.5V8H10" />
      <path d="M4.5 13A7.5 7.5 0 0 0 17.8 17" />
      <path d="M18.5 20.5V16H14" />
    </>
  ),
  xyz: (
    <>
      <path d="m12 3-8 4.5 8 4.5 8-4.5L12 3Z" />
      <path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 9.5h5v5h-5Z" />
      <path d="M14 4h6v6M20 4l-5.5 5.5" />
      <path d="M10 20H4v-6M4 20l5.5-5.5" />
    </>
  ),
  ritual: (
    <>
      <circle cx="12" cy="12.25" r="9.25" />
      <path d="M12 5.5l1.8 4.6 4.9.2-3.8 3.1 1.2 4.8-4.1-2.7-4.1 2.7 1.2-4.8-3.8-3.1 4.9-.2Z" />
    </>
  ),
  pendulum: (
    <>
      <path d="M12 3 7.2 16.2" />
      <circle cx="6.2" cy="18.7" r="2.4" />
      <path d="M12.9 19.5A16.5 16.5 0 0 0 20.3 17.3" />
    </>
  ),

  posAtk: (
    <>
      <path d="M12 3l2.5 3v8h-5V6Z" />
      <path d="M7.5 14h9M12 14v4.5M10.2 20.5h3.6" />
    </>
  ),
  posDef: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" />,
  posFacedown: (
    <>
      <path d={CARD} />
      <path d="M9.5 9.5h5v5h-5Z" />
    </>
  ),
  counter: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  equip: (
    <>
      <path d="M8 4h6a2 2 0 0 1 2 2v6" />
      <path d="M13 20H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="m17 13 4 4-4 4-4-4 4-4Z" />
    </>
  ),
  attack: (
    <>
      <path d="M19 4 5 18M5 4l14 14" />
      <path d="m6.5 12.5 4 4M17.5 12.5l-4 4" />
    </>
  ),

  phaseDraw: (
    <>
      <path d="M7 3h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M11 17v4" />
      <path d="m8.5 18.5 2.5 2.5 2.5-2.5" />
    </>
  ),
  phaseStandby: (
    <>
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v3a4 4 0 0 0 4 4 4 4 0 0 0 4-4V3" />
      <path d="M8 21v-3a4 4 0 0 1 4-4 4 4 0 0 1 4 4v3" />
    </>
  ),
  phaseMain1: (
    <>
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="m10 9.5 2-1.5v8" />
    </>
  ),
  phaseMain2: (
    <>
      <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M9.8 9.2A2.3 2.3 0 0 1 14.3 10c0 2.2-4.5 3.8-4.5 6h4.7" />
    </>
  ),
  phaseBattle: null,
  phaseEnd: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2.5 3.7L17 12.5H6" />
    </>
  ),

  once: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m10.3 9.8 2.2-1.6v7.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.2" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </>
  ),
}
ICON_PATHS.phaseBattle = ICON_PATHS.attack
