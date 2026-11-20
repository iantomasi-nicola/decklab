import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { create } from 'zustand'
import type { Lang, Localized } from '@/domain/types'
import it from './it.json'
import en from './en.json'

export const LANGS: readonly Lang[] = ['it', 'en']
export type LangPref = Lang | 'system'

const STORAGE_KEY = 'combolab.lang'

function readPref(): LangPref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'it' || v === 'en') return v
  } catch {
    /* storage non disponibile */
  }
  return 'system'
}

/** Lingua da navigator.language (primo match tra le preferite), default en. */
export function detectLang(): Lang {
  const list = typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language])
  for (const l of list) {
    const base = l?.toLowerCase().split('-')[0]
    if (base === 'it' || base === 'en') return base
  }
  return 'en'
}

export function resolveLang(pref: LangPref): Lang {
  return pref === 'system' ? detectLang() : pref
}

interface LangState {
  pref: LangPref
  setPref: (p: LangPref) => void
}

export const useLangPref = create<LangState>((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      if (pref === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      /* ignora */
    }
    set({ pref })
    void applyLang(resolveLang(pref))
  },
}))

async function applyLang(lang: Lang) {
  await i18next.changeLanguage(lang)
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}

export const i18n = i18next

export function initI18n() {
  if (!i18next.isInitialized) {
    const lang = resolveLang(readPref())
    void i18next.use(initReactI18next).init({
      resources: { it: { translation: it }, en: { translation: en } },
      lng: lang,
      fallbackLng: 'en',
      supportedLngs: [...LANGS],
      interpolation: { escapeValue: false },
      returnNull: false,
    })
    if (typeof document !== 'undefined') document.documentElement.lang = lang
  }
  return i18next
}

/** Testo localizzato di un dato (es. nome carta): lingua richiesta, poi l'altra. */
export function localized(value: Localized | undefined, lang: Lang, fallback = ''): string {
  if (!value) return fallback
  return value[lang] ?? value.en ?? value.it ?? fallback
}

/**
 * Scrittura di un testo a campo unico: sostituisce la chiave che la lettura mostra
 * (lingua corrente, poi en, poi it); se il testo e' vuoto la chiave viene tolta.
 * Le altre lingue gia' presenti restano intatte (nessuna perdita di dati).
 */
export function setLocalized(old: Localized | undefined, lang: Lang, text: string): Localized {
  const key: Lang = old?.[lang] !== undefined ? lang : old?.en !== undefined ? 'en' : old?.it !== undefined ? 'it' : lang
  const next: Localized = { ...(old ?? {}) }
  const v = text.trim()
  if (v) next[key] = v
  else delete next[key]
  return next
}

/** Hook: restituisce una funzione `(value) => string` legata alla lingua corrente. */
export function useLocalized() {
  const { i18n: inst } = useTranslation()
  const lang: Lang = inst.resolvedLanguage === 'it' ? 'it' : 'en'
  return { lang, l: (value: Localized | undefined, fallback = '') => localized(value, lang, fallback) }
}
