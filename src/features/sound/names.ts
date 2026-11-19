import type { Step } from '@/domain/combo/types'

export type SoundCategory = 'game' | 'ui' | 'feedback'

export const SOUND_CATEGORY: Record<string, SoundCategory> = {
  summonNormal: 'game', summonSet: 'game', summonSpecial: 'game',
  summonFusion: 'game', summonSynchro: 'game', summonXyz: 'game', summonLink: 'game', summonRitual: 'game', summonPendulum: 'game',
  activate: 'game', chainLink: 'game', chainResolve: 'game', negate: 'game', destroy: 'game', sendToGY: 'game', banish: 'game',
  draw: 'game', search: 'game', discard: 'game', flip: 'game', positionChange: 'game', equip: 'game', attack: 'game', damage: 'game',
  phaseChange: 'game',
  targetSelect: 'ui', targetConfirm: 'ui', stepNext: 'ui', stepPrev: 'ui', uiTap: 'ui', uiToggle: 'ui', uiOpen: 'ui', uiClose: 'ui',
  error: 'feedback', undo: 'feedback', redo: 'feedback', comboComplete: 'feedback',
}

export const SOUND_NAMES = Object.keys(SOUND_CATEGORY) as SoundName[]

export type SoundName =
  | 'summonNormal' | 'summonSet' | 'summonSpecial'
  | 'summonFusion' | 'summonSynchro' | 'summonXyz' | 'summonLink' | 'summonRitual' | 'summonPendulum'
  | 'activate' | 'chainLink' | 'chainResolve' | 'negate' | 'destroy' | 'sendToGY' | 'banish'
  | 'draw' | 'search' | 'discard' | 'flip' | 'positionChange' | 'equip' | 'attack' | 'damage' | 'phaseChange'
  | 'targetSelect' | 'targetConfirm' | 'stepNext' | 'stepPrev' | 'uiTap' | 'uiToggle' | 'uiOpen' | 'uiClose'
  | 'error' | 'undo' | 'redo' | 'comboComplete'

export const categoryOf = (n: SoundName): SoundCategory => SOUND_CATEGORY[n] as SoundCategory

const SUMMON_BY_METHOD: Record<string, SoundName> = {
  fusion: 'summonFusion', synchro: 'summonSynchro', xyz: 'summonXyz', link: 'summonLink', ritual: 'summonRitual', pendulum: 'summonPendulum',
}

const BY_WHY: Record<string, SoundName> = {
  summon: 'summonSpecial', destroy: 'destroy', send: 'sendToGY', cost: 'sendToGY', banish: 'banish', draw: 'draw', search: 'search',
  discard: 'discard', set: 'summonSet', flip: 'flip', position: 'positionChange', equip: 'equip', return: 'draw', shuffle: 'flip',
}

/** Mappa un passo di combo al suono che lo accompagna (null = silenzio). Pura, senza effetti collaterali. */
export function soundForAction(step: Pick<Step, 'action'> & Partial<Pick<Step, 'method' | 'moves' | 'lp'>>): SoundName | null {
  switch (step.action) {
    case 'normalSummon': case 'tributeSummon': return 'summonNormal'
    case 'setMonster': case 'setSpellTrap': return 'summonSet'
    case 'flipSummon': return 'flip'
    case 'specialSummon': return (step.method && SUMMON_BY_METHOD[step.method]) || 'summonSpecial'
    case 'activate': return 'activate'
    case 'chainActivate': return 'chainLink'
    case 'search': return 'search'
    case 'draw': case 'returnToHand': return 'draw'
    case 'discard': return 'discard'
    case 'sendToGY': case 'detach': return 'sendToGY'
    case 'banish': return 'banish'
    case 'destroy': return 'destroy'
    case 'returnToDeck': case 'shuffle': return 'flip'
    case 'changePosition': return 'positionChange'
    case 'equip': case 'attach': return 'equip'
    case 'placeCounter': return 'uiTap'
    case 'changeLP': return step.lp?.some((l) => l.delta < 0) ? 'damage' : null
    case 'attack': return 'attack'
    case 'enterPhase': case 'endTurn': return 'phaseChange'
    case 'resolve': return 'chainResolve'
    case 'declare': return 'targetConfirm'
    case 'choice': return 'targetSelect'
    case 'custom': {
      const why = step.moves?.[0]?.why
      return (why && BY_WHY[why]) || null
    }
    default: return null
  }
}
