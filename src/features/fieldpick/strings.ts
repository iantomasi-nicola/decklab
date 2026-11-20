/** Testi (it/en) della selezione sul campo. Autonomi da it.json/en.json (usati sia dal manuale sia dall'automatica). */
import { useTranslation } from 'react-i18next'

const it = {
  'bar.cancel': 'Annulla',
  'bar.confirm': 'Conferma',
  'bar.undo': 'Togli l’ultima',
  'bar.hint': 'Tocca le carte evidenziate sul campo',
  'bar.hintBand': 'Tocca le carte evidenziate sul campo o nella fascia',
  'bar.full': 'Hai già scelto il massimo ({n})',
  'bar.zoneOne': 'Scegli la zona',
  'bar.zoneN': 'Scegli {n} zone',
  'lbl.cards': 'Carte',
  'lbl.materials': 'Materiali',
  'lbl.tribute': 'Tributi',
  'lbl.targets': 'Bersagli',
  'lbl.level': 'Livello',
  'lbl.zones': 'Zone',
  'lbl.counters': 'Segnalini',
  'lbl.chosen': '{label} {c}/{n}',
  'lbl.chosenRange': '{label} {c}/{min}–{n}',
  'lbl.chosenOpen': '{label} {c}',
  'lbl.chosenMax': '{label} {c} (max {n})',
  'title.cards': 'Scegli le carte',
  'title.materials': 'Scegli i materiali',
  'title.materialsFor': 'Materiali per {name}',
  'title.tribute': 'Scegli i tributi',
  'title.tributeFor': 'Tributi per {name}',
  'title.targets': 'Scegli i bersagli',
  'title.sum': 'Scegli le carte per la somma',
  'sum.over': 'Troppo: {n}',
  'sum.ok': 'Somma raggiunta',
  'band.close': 'Chiudi',
  'band.expand': 'Ingrandisci',
  'band.shrink': 'Riduci',
  'band.resize': 'Ridimensiona la fascia',
  'band.search': 'Cerca per nome',
  'band.empty': 'Nessuna carta',
  'band.count': '{n} carte',
  'band.legalHint': 'Tocca una carta evidenziata',
  'band.notNow': 'Questa carta non si può usare ora.',
  'band.offField': 'Fuori dal campo',
  'info.close': 'Chiudi la scheda',
  'info.menu': 'Azioni',
  'info.loading': 'Carico il testo…',
  'info.noText': 'Testo non disponibile.',
  'info.level': 'Liv. {n}',
  'info.rank': 'Rango {n}',
  'info.link': 'Link {n}',
}
const en: Record<keyof typeof it, string> = {
  'bar.cancel': 'Cancel',
  'bar.confirm': 'Confirm',
  'bar.undo': 'Remove last',
  'bar.hint': 'Tap the highlighted cards on the field',
  'bar.hintBand': 'Tap the highlighted cards on the field or in the tray',
  'bar.full': 'You already picked the maximum ({n})',
  'bar.zoneOne': 'Choose a zone',
  'bar.zoneN': 'Choose {n} zones',
  'lbl.cards': 'Cards',
  'lbl.materials': 'Materials',
  'lbl.tribute': 'Tributes',
  'lbl.targets': 'Targets',
  'lbl.level': 'Level',
  'lbl.zones': 'Zones',
  'lbl.counters': 'Counters',
  'lbl.chosen': '{label} {c}/{n}',
  'lbl.chosenRange': '{label} {c}/{min}–{n}',
  'lbl.chosenOpen': '{label} {c}',
  'lbl.chosenMax': '{label} {c} (max {n})',
  'title.cards': 'Choose cards',
  'title.materials': 'Choose materials',
  'title.materialsFor': 'Materials for {name}',
  'title.tribute': 'Choose tributes',
  'title.tributeFor': 'Tributes for {name}',
  'title.targets': 'Choose targets',
  'title.sum': 'Choose cards for the total',
  'sum.over': 'Too much: {n}',
  'sum.ok': 'Total reached',
  'band.close': 'Close',
  'band.expand': 'Enlarge',
  'band.shrink': 'Shrink',
  'band.resize': 'Resize the tray',
  'band.search': 'Search by name',
  'band.empty': 'No cards',
  'band.count': '{n} cards',
  'band.legalHint': 'Tap a highlighted card',
  'band.notNow': 'This card can’t be used now.',
  'band.offField': 'Off the field',
  'info.close': 'Close card details',
  'info.menu': 'Actions',
  'info.loading': 'Loading text…',
  'info.noText': 'Text not available.',
  'info.level': 'Lv {n}',
  'info.rank': 'Rank {n}',
  'info.link': 'Link {n}',
}
export type FpKey = keyof typeof it
export type FpVars = Record<string, string | number>
export type FpT = (key: FpKey, vars?: FpVars) => string
export const FIELDPICK_STRINGS = { it, en }

export function fpText(lang: 'it' | 'en', key: FpKey, vars?: FpVars): string {
  const raw = FIELDPICK_STRINGS[lang][key] ?? key
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : raw
}

export function useFpT() {
  const { i18n } = useTranslation()
  const lang: 'it' | 'en' = i18n.resolvedLanguage === 'it' ? 'it' : 'en'
  const t: FpT = (key, vars) => fpText(lang, key, vars)
  return { lang, t }
}
