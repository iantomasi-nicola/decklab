import { create } from 'zustand'
import type { SoundCategory } from './names'

export interface SoundSettings {
  volume: number // 0..1
  muted: boolean
  categories: Record<SoundCategory, boolean>
  vibrate: boolean
}

export const SOUND_STORAGE_KEY = 'combolab.sound'

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  volume: 0.7,
  muted: false,
  categories: { game: true, ui: true, feedback: true },
  vibrate: false,
}

const clamp01 = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d)

/** Valida un valore arbitrario (JSON salvato) completando i campi mancanti con i predefiniti. */
export function sanitizeSoundSettings(raw: unknown): SoundSettings {
  const d = DEFAULT_SOUND_SETTINGS
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const c = (o.categories && typeof o.categories === 'object' ? o.categories : {}) as Record<string, unknown>
  const b = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def)
  return {
    volume: clamp01(o.volume, d.volume),
    muted: b(o.muted, d.muted),
    categories: { game: b(c.game, true), ui: b(c.ui, true), feedback: b(c.feedback, true) },
    vibrate: b(o.vibrate, d.vibrate),
  }
}

export function loadSoundSettings(): SoundSettings {
  try {
    const s = localStorage.getItem(SOUND_STORAGE_KEY)
    if (s) return sanitizeSoundSettings(JSON.parse(s))
  } catch {
    /* storage non disponibile o JSON corrotto */
  }
  return sanitizeSoundSettings(null)
}

export function saveSoundSettings(s: SoundSettings) {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* storage non disponibile */
  }
}

interface Store extends SoundSettings {
  set: (patch: Partial<Omit<SoundSettings, 'categories'>> & { categories?: Partial<SoundSettings['categories']> }) => void
  reload: () => void
}

const pick = (s: Store): SoundSettings => ({ volume: s.volume, muted: s.muted, categories: s.categories, vibrate: s.vibrate })

export const useSoundSettings = create<Store>((set, get) => ({
  ...loadSoundSettings(),
  set: (patch) => {
    const cur = get()
    const next = sanitizeSoundSettings({ ...pick(cur), ...patch, categories: { ...cur.categories, ...patch.categories } })
    set(next)
    saveSoundSettings(next)
  },
  reload: () => set(loadSoundSettings()),
}))
