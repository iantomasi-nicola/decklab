import type { ActionKind, EffectKind, SummonMethod } from '@/domain/combo/types'
import type { Phase } from '@/domain/combo/turn'
import type { GameIconName } from './paths'

export const EFFECT_ICON: Record<'ignition' | 'quick' | 'trigger' | 'continuous' | 'activation', GameIconName> = {
  ignition: 'ignition', quick: 'quick', trigger: 'trigger', continuous: 'continuous', activation: 'activation',
}
export const PHASE_ICON: Record<Phase, GameIconName> = {
  draw: 'phaseDraw', standby: 'phaseStandby', main1: 'phaseMain1', battle: 'phaseBattle', main2: 'phaseMain2', end: 'phaseEnd',
}
export const METHOD_ICON: Partial<Record<SummonMethod, GameIconName>> = {
  fusion: 'fusion', synchro: 'synchro', xyz: 'xyz', link: 'link', ritual: 'ritual', pendulum: 'pendulum',
}

/** Icona per un'azione del formato combo (con il metodo, per le Evocazioni Speciali). `undefined` = nessuna icona dedicata. */
export function iconForAction(action: ActionKind, method?: SummonMethod): GameIconName | undefined {
  switch (action) {
    case 'normalSummon': return 'normalSummon'
    case 'tributeSummon': return 'tributeSummon'
    case 'setMonster': case 'setSpellTrap': return 'setMonster'
    case 'flipSummon': return 'flipSummon'
    case 'specialSummon': return (method && METHOD_ICON[method]) || 'specialSummon'
    case 'activate': case 'chainActivate': return 'activation'
    case 'search': return 'search'
    case 'draw': return 'draw'
    case 'discard': return 'discard'
    case 'sendToGY': return 'toGY'
    case 'banish': return 'banish'
    case 'returnToHand': return 'toHand'
    case 'returnToDeck': return 'toDeck'
    case 'destroy': return 'destroy'
    case 'changePosition': return 'posAtk'
    case 'equip': return 'equip'
    case 'placeCounter': return 'counter'
    case 'attack': return 'attack'
    default: return undefined
  }
}

export function iconForEffect(kind: EffectKind | undefined): GameIconName | undefined {
  return kind && kind in EFFECT_ICON ? EFFECT_ICON[kind as keyof typeof EFFECT_ICON] : undefined
}
