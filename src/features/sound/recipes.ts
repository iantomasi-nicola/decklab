/** Ricette di sintesi: dati puri (nessun WebAudio qui). Tonalità unica: La minore pentatonica (A C D E G), da A3 = 220 Hz. */
import type { SoundName } from './names'

export interface Note {
  at: number // secondi dall'inizio del suono
  deg: number // grado nella scala (0 = A3, 5 = A4, 10 = A5; negativi = più gravi)
  dur: number // durata totale (inviluppo incluso), s
  wave: 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise'
  gain: number // 0..1 (prima del master)
  a?: number // attacco, s (default 0.006)
  lp?: number // taglio passa-basso, Hz
  hp?: number // taglio passa-alto, Hz (solo rumore)
  glide?: number // fattore di frequenza finale (es. 0.5 = scende di un'ottava)
  detune?: number // cent
  send?: number // quantità di riverbero 0..1
}

const SCALE = [0, 3, 5, 7, 10]
/** Frequenza del grado `deg` della scala pentatonica (ottava ogni 5 gradi). */
export function degreeFreq(deg: number): number {
  const oct = Math.floor(deg / 5)
  const semis = oct * 12 + SCALE[((deg % 5) + 5) % 5]!
  return 220 * Math.pow(2, semis / 12)
}

const T = 'triangle', S = 'sine'
const n = (at: number, deg: number, dur: number, gain: number, o: Partial<Note> = {}, wave: Note['wave'] = S): Note =>
  ({ at, deg, dur, gain, wave, ...o })

/** Arpeggio di gradi con passo temporale `step`. */
const arp = (degs: number[], step: number, dur: number, gain: number, o: Partial<Note> = {}, wave: Note['wave'] = T): Note[] =>
  degs.map((d, i) => n(i * step, d, dur, gain, { lp: 3200, send: 0.25, ...o }, wave))

const summon = (degs: number[], gain = 0.16): Note[] => [
  ...arp(degs, 0.04, 0.22, gain),
  n(0, degs[0]! - 5, 0.28, gain * 0.7, { lp: 900, send: 0.1 }),
]

export const RECIPES: Record<SoundName, (arg?: number) => Note[]> = {
  summonNormal: () => [n(0, 5, 0.22, 0.2, { lp: 2400, send: 0.15 }, T), n(0, 0, 0.26, 0.16, { lp: 700 })],
  summonSet: () => [n(0, -2, 0.2, 0.2, { lp: 600, glide: 0.8 }), n(0.02, 0, 0.12, 0.08, { lp: 1200 }, T)],
  summonSpecial: () => summon([5, 7, 10]),
  summonFusion: () => [...summon([3, 5, 7, 10], 0.15), n(0.05, 12, 0.3, 0.07, { lp: 3600, send: 0.4, detune: 6 }, T)],
  summonSynchro: () => [...summon([5, 8, 10, 12], 0.15), n(0.12, 15, 0.27, 0.06, { lp: 4000, send: 0.4 })],
  summonXyz: () => [...summon([7, 5, 3, 5], 0.15), n(0.12, 10, 0.27, 0.08, { lp: 3000, send: 0.35 }, T)],
  summonLink: () => [...summon([5, 7, 10, 12, 14], 0.14), n(0.14, 15, 0.25, 0.07, { lp: 4200, send: 0.45 })],
  summonRitual: () => [...summon([0, 3, 5, 7], 0.15), n(0.1, 5, 0.3, 0.09, { lp: 1800, send: 0.5 }, T)],
  summonPendulum: () => [...summon([5, 10, 7, 12], 0.15), n(0.08, 9, 0.3, 0.06, { lp: 3600, send: 0.45, detune: -8 })],
  activate: () => [n(0, 7, 0.2, 0.16, { lp: 3600, send: 0.3 }, T), n(0.06, 10, 0.26, 0.14, { lp: 3600, send: 0.35 }, T)],
  chainLink: (k = 1) => {
    const d = 3 + Math.min(Math.max(1, Math.round(k)) - 1, 11) // sale di un grado per anello, tetto 12 gradi
    return [n(0, d, 0.18, 0.2, { lp: 3000, send: 0.2 }, T), n(0.01, d + 5, 0.12, 0.05, { lp: 4000 })]
  },
  chainResolve: () => [n(0, 10, 0.18, 0.16, { lp: 2800, send: 0.25 }, T), n(0.08, 5, 0.26, 0.15, { lp: 2000, send: 0.3 }, T)],
  negate: () => [n(0, 5, 0.26, 0.15, { lp: 1800, glide: 0.5 }, 'sawtooth'), n(0.03, 4, 0.24, 0.1, { lp: 1400, glide: 0.5 }, T)],
  destroy: () => [n(0, 0, 0.32, 0.4, { wave: 'noise', lp: 1800, hp: 120, send: 0.2 } as Partial<Note>, 'noise'), n(0, -5, 0.3, 0.28, { lp: 400, glide: 0.5 })],
  sendToGY: () => [n(0, 2, 0.34, 0.16, { lp: 1200, glide: 0.6, send: 0.3 }, T), n(0.04, -3, 0.3, 0.14, { lp: 600, send: 0.2 })],
  banish: () => [n(0, 12, 0.38, 0.12, { lp: 3500, glide: 0.5, send: 0.5 }, T), n(0, 0, 0.3, 0.2, { wave: 'noise', lp: 3000, hp: 1500 } as Partial<Note>, 'noise')],
  draw: () => [n(0, 0, 0.09, 0.2, { wave: 'noise', lp: 5000, hp: 1800 } as Partial<Note>, 'noise'), n(0.02, 10, 0.14, 0.1, { lp: 3000 }, T)],
  search: () => arp([5, 7, 10], 0.06, 0.2, 0.14),
  discard: () => [n(0, 0, 0.12, 0.2, { wave: 'noise', lp: 2500, hp: 600 } as Partial<Note>, 'noise'), n(0, 2, 0.16, 0.12, { lp: 900, glide: 0.7 })],
  flip: () => [n(0, 0, 0.06, 0.18, { wave: 'noise', lp: 4500, hp: 2000 } as Partial<Note>, 'noise'), n(0.04, 7, 0.14, 0.13, { lp: 3000, send: 0.15 }, T)],
  positionChange: () => [n(0, 5, 0.1, 0.15, { lp: 2500 }, T), n(0.07, 7, 0.14, 0.15, { lp: 2500 }, T)],
  equip: () => [n(0, 3, 0.1, 0.16, { lp: 2200 }, T), n(0.06, 7, 0.2, 0.14, { lp: 2600, send: 0.2 }, T)],
  attack: () => [n(0, 0, 0.22, 0.3, { wave: 'noise', lp: 3500, hp: 300, glide: 0.4 } as Partial<Note>, 'noise'), n(0.0, 3, 0.2, 0.2, { lp: 900, glide: 0.4 }, 'sawtooth')],
  damage: () => [n(0, -5, 0.3, 0.3, { lp: 500, glide: 0.6 }), n(0, 0, 0.16, 0.2, { wave: 'noise', lp: 1400, hp: 100 } as Partial<Note>, 'noise')],
  phaseChange: () => [n(0, 5, 0.26, 0.14, { lp: 2400, send: 0.35 }), n(0.1, 10, 0.28, 0.12, { lp: 2400, send: 0.4 })],
  targetSelect: () => [n(0, 12, 0.07, 0.17, { lp: 4500, a: 0.003 }, T)],
  targetConfirm: () => [n(0, 10, 0.09, 0.16, { lp: 4000, a: 0.003 }, T), n(0.07, 14, 0.16, 0.16, { lp: 4000, send: 0.2 }, T)],
  stepNext: () => [n(0, 10, 0.1, 0.13, { lp: 3000, a: 0.004 }, T)],
  stepPrev: () => [n(0, 8, 0.1, 0.13, { lp: 3000, a: 0.004 }, T)],
  uiTap: () => [n(0, 10, 0.05, 0.12, { lp: 3500, a: 0.002 }, T)],
  uiToggle: () => [n(0, 7, 0.06, 0.12, { lp: 3500, a: 0.002 }, T), n(0.05, 10, 0.08, 0.12, { lp: 3500, a: 0.002 }, T)],
  uiOpen: () => [n(0, 7, 0.12, 0.12, { lp: 3000, glide: 1.25 }, T)],
  uiClose: () => [n(0, 10, 0.12, 0.12, { lp: 3000, glide: 0.8 }, T)],
  error: () => [n(0, 2, 0.16, 0.18, { lp: 900 }, 'square'), n(0.11, 0, 0.22, 0.18, { lp: 800 }, 'square')],
  undo: () => [n(0, 10, 0.09, 0.14, { lp: 3000 }, T), n(0.07, 7, 0.12, 0.14, { lp: 3000 }, T)],
  redo: () => [n(0, 7, 0.09, 0.14, { lp: 3000 }, T), n(0.07, 10, 0.12, 0.14, { lp: 3000 }, T)],
  comboComplete: () => [
    ...arp([5, 7, 10, 12, 15], 0.05, 0.2, 0.15, { send: 0.4 }),
    n(0.22, 5, 0.18, 0.14, { lp: 2000, send: 0.4 }, T),
    n(0.22, 12, 0.18, 0.1, { lp: 3000, send: 0.5 }, T),
  ],
}

export const recipeDuration = (notes: Note[]) => Math.max(...notes.map((x) => x.at + x.dur))
