import { create } from 'zustand'

export type ThemePref = 'system' | 'dark' | 'light'
const STORAGE_KEY = 'combolab.theme'
const META_COLORS = { dark: '#0e1015', light: '#f5f6fa' } as const

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* storage non disponibile */
  }
  return 'dark' // predefinito: scuro; "Sistema" è una scelta esplicita
}

const mq = () => (typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null)

export function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref
  return mq()?.matches ? 'light' : 'dark'
}

/** Scrive data-theme su <html> (sempre il valore risolto) e aggiorna theme-color. */
export function applyTheme(pref: ThemePref) {
  const resolved = resolveTheme(pref)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[resolved])
}

interface ThemeState {
  pref: ThemePref
  setPref: (p: ThemePref) => void
}

export const useTheme = create<ThemeState>((set) => ({
  pref: readPref(),
  setPref: (pref) => {
    try {
      localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      /* ignora */
    }
    set({ pref })
    applyTheme(pref)
  },
}))

export function initTheme() {
  applyTheme(useTheme.getState().pref)
  // Con "Sistema" segue i cambi del dispositivo in tempo reale.
  mq()?.addEventListener('change', () => {
    if (useTheme.getState().pref === 'system') applyTheme('system')
  })
}
