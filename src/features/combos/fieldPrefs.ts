import { create } from 'zustand'

const KEY = 'combolab.field.fanPiles'

/** Preferenze di visualizzazione del campo (ricordate sul dispositivo). */
interface FieldPrefs {
  /** Cimitero e Bandite mostrano le ultime 10 carte a ventaglio (altrimenti: solo la carta in cima + contatore) */
  fanPiles: boolean
  setFanPiles: (v: boolean) => void
  /** Pannello laterale con Cimitero e Bandite di entrambi i giocatori. null = predefinito (acceso da 768 px, spento sul telefono) */
  pilesPanel: boolean | null
  setPilesPanel: (v: boolean) => void
  /** "Il mio campo" (telefono verticale): solo il campo del giocatore, quello avversario ridotto. null = predefinito (acceso sul telefono) */
  mineOnly: boolean | null
  setMineOnly: (v: boolean) => void
}

const PANEL_KEY = 'combolab.field.pilesPanel'
function readPanel(): boolean | null {
  try {
    const v = localStorage.getItem(PANEL_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

/** Valore effettivo della preferenza del pannello pile. */
export function pilesPanelEnabled(pref: boolean | null): boolean {
  return pref ?? (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

const MINE_KEY = 'combolab.field.mineOnly'
function readMine(): boolean | null {
  try {
    const v = localStorage.getItem(MINE_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

export const useFieldPrefs = create<FieldPrefs>((set) => ({
  fanPiles: read(),
  setFanPiles: (fanPiles) => {
    try {
      localStorage.setItem(KEY, fanPiles ? '1' : '0')
    } catch {
      /* storage non disponibile */
    }
    set({ fanPiles })
  },
  mineOnly: readMine(),
  setMineOnly: (mineOnly) => {
    try {
      localStorage.setItem(MINE_KEY, mineOnly ? '1' : '0')
    } catch {
      /* storage non disponibile */
    }
    set({ mineOnly })
  },
  pilesPanel: readPanel(),
  setPilesPanel: (pilesPanel) => {
    try {
      localStorage.setItem(PANEL_KEY, pilesPanel ? '1' : '0')
    } catch {
      /* storage non disponibile */
    }
    set({ pilesPanel })
  },
}))
