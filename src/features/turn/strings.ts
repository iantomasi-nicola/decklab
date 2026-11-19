/**
 * Testi (it/en) dello stato del turno. Autonomi dai file it.json/en.json per poter lavorare in parallelo agli altri;
 * le chiavi seguono la stessa forma, quindi si possono spostare in JSON più avanti senza cambiare i componenti.
 * Plurali: `chiave_one` / `chiave_other` scelti da `{n}` (1 = singolare).
 */
import { useTranslation } from 'react-i18next'
import type { IconLang } from '@/ui/gameIcons'

const it = {
  'bar.label': 'Fasi del turno',
  'bar.turn': 'Turno {n}',
  'bar.current': '{p}, fase corrente',
  'bar.go': 'Passa a {p}',
  'bar.past': '{p}, già passata',
  'bar.locked': '{p}, non raggiungibile da qui',
  'bar.shortcuts': 'Alt+1…6 salta a una fase, Alt+N va alla successiva',
  'phase.draw': 'Draw',
  'phase.standby': 'Standby',
  'phase.main1': 'Main 1',
  'phase.battle': 'Battle',
  'phase.main2': 'Main 2',
  'phase.end': 'End',

  'status.label': 'Stato del turno',
  'status.normalDone': 'Normale fatta',
  'status.normalOpen': 'Normale disponibile',
  'status.normalDoneCount': 'Normali {n} su {m}',
  'status.normalTitleDone': 'Evocazione Normale già usata in questo turno',
  'status.normalTitleOpen': 'Evocazione Normale ancora disponibile',
  'status.opt': 'OPT {n} usati',
  'status.optOf': 'OPT {n} su {m} usati',
  'status.optTitle': 'Effetti "una volta per turno" già attivati',
  'status.optOver': 'Ripetuti: {n}',
  'status.attacked_one': '{n} ha attaccato',
  'status.attacked_other': '{n} hanno attaccato',
  'status.counters_one': '{n} segnalino',
  'status.counters_other': '{n} segnalini',
  'status.pendulum': 'Pendulum fatta',
  'status.specials_one': '{n} Speciale',
  'status.specials_other': '{n} Speciali',
  'status.reminder': 'Già fatto in questo turno',
  'status.reminderCount': '{n}',
  'status.empty': 'Ancora niente in questo turno.',
  'status.jump': 'Vai al passo {n}',
  'log.effect': 'Effetto {i}',
  'log.effectNoIndex': 'Effetto',
  'log.opt': 'una volta per turno',
  'log.repeat': 'usato di nuovo',
  'log.phase': 'Passa a {p}',
  'log.turn': 'Fine del turno',
  'log.step': 'Passo {n}',

  'mark.used': 'Effetto {i} già usato in questo turno',
  'mark.usedNoIndex': 'Effetto già usato in questo turno',
  'mark.usedTimes': 'Effetto {i} usato {n} volte (una volta per turno)',
  'mark.open': 'Effetto {i} disponibile (una volta per turno)',
  'mark.openNoIndex': 'Effetto disponibile (una volta per turno)',
  'mark.byName': 'per nome carta',

  'pick.title': 'Scegli {n} di {m}',
  'pick.titleRange': 'Scegli da {min} a {n} di {m}',
  'pick.chosen': '{c} su {n} scelti',
  'pick.chosenMin': '{c} scelti, almeno {min}',
  'pick.confirm': 'Conferma',
  'pick.cancel': 'Annulla',
  'pick.full': 'Hai già scelto {n}: tocca una carta scelta per toglierla.',
  'pick.hint': 'Frecce per muoverti, Spazio per scegliere, Ctrl+Invio per confermare, Esc per annullare.',
  'pick.offField': 'Non visibili sul campo',
  'pick.cand': '{name}, candidata',
  'pick.candSel': '{name}, scelta numero {k}',
  'pick.announceAdd': 'Scelta {k} di {n}: {name}',
  'pick.announceRemove': 'Tolta: {name}',
  'pick.dialog': 'Scelta dei bersagli',
}

const en: typeof it = {
  'bar.label': 'Turn phases',
  'bar.turn': 'Turn {n}',
  'bar.current': '{p}, current phase',
  'bar.go': 'Go to {p}',
  'bar.past': '{p}, already passed',
  'bar.locked': '{p}, not reachable from here',
  'bar.shortcuts': 'Alt+1…6 jumps to a phase, Alt+N goes to the next one',
  'phase.draw': 'Draw',
  'phase.standby': 'Standby',
  'phase.main1': 'Main 1',
  'phase.battle': 'Battle',
  'phase.main2': 'Main 2',
  'phase.end': 'End',

  'status.label': 'Turn status',
  'status.normalDone': 'Normal used',
  'status.normalOpen': 'Normal available',
  'status.normalDoneCount': 'Normals {n} of {m}',
  'status.normalTitleDone': 'Normal Summon already used this turn',
  'status.normalTitleOpen': 'Normal Summon still available',
  'status.opt': 'OPT {n} used',
  'status.optOf': 'OPT {n} of {m} used',
  'status.optTitle': '"Once per turn" effects already activated',
  'status.optOver': 'Repeated: {n}',
  'status.attacked_one': '{n} has attacked',
  'status.attacked_other': '{n} have attacked',
  'status.counters_one': '{n} counter',
  'status.counters_other': '{n} counters',
  'status.pendulum': 'Pendulum used',
  'status.specials_one': '{n} Special',
  'status.specials_other': '{n} Specials',
  'status.reminder': 'Already done this turn',
  'status.reminderCount': '{n}',
  'status.empty': 'Nothing yet this turn.',
  'status.jump': 'Go to step {n}',
  'log.effect': 'Effect {i}',
  'log.effectNoIndex': 'Effect',
  'log.opt': 'once per turn',
  'log.repeat': 'used again',
  'log.phase': 'Go to {p}',
  'log.turn': 'End of turn',
  'log.step': 'Step {n}',

  'mark.used': 'Effect {i} already used this turn',
  'mark.usedNoIndex': 'Effect already used this turn',
  'mark.usedTimes': 'Effect {i} used {n} times (once per turn)',
  'mark.open': 'Effect {i} available (once per turn)',
  'mark.openNoIndex': 'Effect available (once per turn)',
  'mark.byName': 'by card name',

  'pick.title': 'Choose {n} of {m}',
  'pick.titleRange': 'Choose {min} to {n} of {m}',
  'pick.chosen': '{c} of {n} chosen',
  'pick.chosenMin': '{c} chosen, at least {min}',
  'pick.confirm': 'Confirm',
  'pick.cancel': 'Cancel',
  'pick.full': 'You already chose {n}: tap a chosen card to remove it.',
  'pick.hint': 'Arrow keys to move, Space to choose, Ctrl+Enter to confirm, Esc to cancel.',
  'pick.offField': 'Not visible on the field',
  'pick.cand': '{name}, candidate',
  'pick.candSel': '{name}, chosen number {k}',
  'pick.announceAdd': 'Chosen {k} of {n}: {name}',
  'pick.announceRemove': 'Removed: {name}',
  'pick.dialog': 'Target selection',
}

type RawKey = keyof typeof it
export type TurnKey = RawKey extends infer K ? (K extends `${infer B}_${'one' | 'other'}` ? B : K) : never
export const TURN_STRINGS: Record<IconLang, Record<RawKey, string>> = { it, en }

export type TurnVars = Record<string, string | number>
export function turnText(lang: IconLang, key: TurnKey, vars?: TurnVars): string {
  const dict = TURN_STRINGS[lang]
  const n = vars?.n
  const plural = (typeof n === 'number' ? `${key}_${n === 1 ? 'one' : 'other'}` : undefined) as RawKey | undefined
  const raw = (plural && plural in dict ? dict[plural] : undefined) ?? dict[key as RawKey]
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : raw
}

/** Hook: `t(chiave, vars)` nella lingua corrente dell'app. */
export function useTurnT() {
  const { i18n } = useTranslation()
  const lang: IconLang = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  return { lang, t: (key: TurnKey, vars?: TurnVars) => turnText(lang, key, vars) }
}
