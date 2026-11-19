import { create } from 'zustand'

const KEY = 'combolab.field.fanPiles'

/** Preferenze di visualizzazione del campo (ricordate sul dispositivo). */
interface FieldPrefs {
  /** Cimitero e Bandite mostrano le ultime 10 carte a ventaglio (altrimenti: solo la carta in cima + contatore) */
  fanPiles: boolean
  setFanPiles: (v: boolean) => void
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
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
}))
