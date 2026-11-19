/** Etichette accessibili delle icone di gioco (it/en). Autonome: si possono spostare in it.json/en.json senza cambiare l'API. */
import { useTranslation } from 'react-i18next'
import type { GameIconName } from './paths'

export type IconLang = 'it' | 'en'

export const ICON_LABELS: Record<IconLang, Record<GameIconName, string>> = {
  it: {
    ignition: 'Effetto Ignition', quick: 'Effetto rapido', trigger: 'Effetto Trigger', continuous: 'Effetto continuo',
    activation: 'Attivazione della carta', chain: 'Catena',
    negate: 'Negazione', destroy: 'Distruzione', search: 'Cerca', draw: 'Pesca', discard: 'Scarta', toGY: 'Manda al Cimitero',
    banish: 'Bandisci', toHand: 'Rimetti in mano', toDeck: 'Rimetti nel Deck',
    normalSummon: 'Evocazione Normale', tributeSummon: 'Evocazione Tributo', setMonster: 'Calata', flipSummon: 'Evocazione Flip',
    specialSummon: 'Evocazione Speciale',
    fusion: 'Fusione', synchro: 'Synchro', xyz: 'Xyz', link: 'Link', ritual: 'Rituale', pendulum: 'Pendulum',
    posAtk: 'Posizione di attacco', posDef: 'Posizione di difesa', posFacedown: 'Coperta', counter: 'Segnalino', equip: 'Equipaggia',
    attack: 'Attacco',
    phaseDraw: 'Draw Phase', phaseStandby: 'Standby Phase', phaseMain1: 'Main Phase 1', phaseMain2: 'Main Phase 2',
    phaseBattle: 'Battle Phase', phaseEnd: 'End Phase',
    once: 'Una volta per turno', check: 'Fatto', target: 'Bersaglio',
  },
  en: {
    ignition: 'Ignition effect', quick: 'Quick effect', trigger: 'Trigger effect', continuous: 'Continuous effect',
    activation: 'Card activation', chain: 'Chain',
    negate: 'Negate', destroy: 'Destroy', search: 'Search', draw: 'Draw', discard: 'Discard', toGY: 'Send to the GY',
    banish: 'Banish', toHand: 'Return to hand', toDeck: 'Return to the Deck',
    normalSummon: 'Normal Summon', tributeSummon: 'Tribute Summon', setMonster: 'Set', flipSummon: 'Flip Summon',
    specialSummon: 'Special Summon',
    fusion: 'Fusion', synchro: 'Synchro', xyz: 'Xyz', link: 'Link', ritual: 'Ritual', pendulum: 'Pendulum',
    posAtk: 'Attack Position', posDef: 'Defense Position', posFacedown: 'Face-down', counter: 'Counter', equip: 'Equip',
    attack: 'Attack',
    phaseDraw: 'Draw Phase', phaseStandby: 'Standby Phase', phaseMain1: 'Main Phase 1', phaseMain2: 'Main Phase 2',
    phaseBattle: 'Battle Phase', phaseEnd: 'End Phase',
    once: 'Once per turn', check: 'Done', target: 'Target',
  },
}

/** Lingua corrente (it/en) dall'i18n dell'app. */
export function useIconLang(): IconLang {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage === 'it' ? 'it' : 'en'
}

export const iconLabel = (name: GameIconName, lang: IconLang): string => ICON_LABELS[lang][name]
