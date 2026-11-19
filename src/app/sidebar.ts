import { create } from 'zustand'

const KEY = 'combolab.sidebar'
type Pref = 'collapsed' | 'expanded' | null

function read(): Pref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'collapsed' || v === 'expanded' ? v : null
  } catch {
    return null
  }
}

/** Preferenza dell'utente sul menu laterale; null = automatico (compatto nell'editor combo, esteso altrove). */
export const useSidebar = create<{ pref: Pref; setPref: (p: Exclude<Pref, null>) => void }>((set) => ({
  pref: read(),
  setPref: (pref) => {
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      /* ignora */
    }
    set({ pref })
  },
}))

export const isEditorRoute = (pathname: string) => /^\/combo\/[^/]+/.test(pathname)
