import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSoundEngine, DEDUP_MS, MAX_VOICES, THROTTLE_MAX } from './engine'
import { SOUND_NAMES, soundForAction } from './names'
import { degreeFreq, RECIPES, recipeDuration } from './recipes'
import { DEFAULT_SOUND_SETTINGS, loadSoundSettings, sanitizeSoundSettings, SOUND_STORAGE_KEY, useSoundSettings } from './settings'

function param() {
  return { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }
}
function node(extra: object = {}) {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: param(), frequency: param(), detune: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), ...extra }
}
function fakeCtx() {
  const started: unknown[] = []
  const ctx = {
    currentTime: 1, sampleRate: 8000, state: 'running', destination: node(),
    resume: vi.fn(async () => {}), suspend: vi.fn(async () => {}),
    createGain: () => node(), createDynamicsCompressor: () => node(), createBiquadFilter: () => node(), createConvolver: () => node(),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createOscillator: () => node({ start: (t: number) => started.push(t), stop: vi.fn(), type: 'sine' }),
    createBufferSource: () => node({ start: (t: number) => started.push(t), stop: vi.fn() }),
  }
  return { ctx, started }
}

function setup(over: { settings?: Partial<typeof DEFAULT_SOUND_SETTINGS>; hidden?: boolean } = {}) {
  const f = fakeCtx()
  let now = 1000
  const vibrate = vi.fn()
  const settings = { ...DEFAULT_SOUND_SETTINGS, ...over.settings }
  const e = createSoundEngine({
    createContext: () => f.ctx as unknown as AudioContext,
    clock: () => now,
    isHidden: () => !!over.hidden,
    vibrate,
    getSettings: () => settings,
  })
  return { e, f, vibrate, tick: (ms: number) => (now += ms), settings }
}

describe('soundForAction', () => {
  it('mappa azioni, metodi e why', () => {
    expect(soundForAction({ action: 'normalSummon' })).toBe('summonNormal')
    expect(soundForAction({ action: 'specialSummon', method: 'synchro' })).toBe('summonSynchro')
    expect(soundForAction({ action: 'specialSummon', method: 'effect' })).toBe('summonSpecial')
    expect(soundForAction({ action: 'chainActivate' })).toBe('chainLink')
    expect(soundForAction({ action: 'custom' })).toBeNull()
    expect(soundForAction({ action: 'custom', moves: [{ uid: 'u1', to: { loc: 'gy' }, why: 'banish' }] })).toBe('banish')
    expect(soundForAction({ action: 'changeLP', lp: [{ p: 0, delta: -800 }] })).toBe('damage')
    expect(soundForAction({ action: 'changeLP', lp: [{ p: 0, delta: 800 }] })).toBeNull()
  })
  it('ogni suono ha una ricetta breve (30-400 ms)', () => {
    for (const n of SOUND_NAMES) {
      const d = recipeDuration(RECIPES[n](n === 'chainLink' ? 5 : undefined))
      expect(d, n).toBeGreaterThanOrEqual(0.03)
      expect(d, n).toBeLessThanOrEqual(0.4)
    }
  })
  it('chainLink sale con il numero di anello', () => {
    const f = (k: number) => degreeFreq(RECIPES.chainLink(k)[0]!.deg)
    expect(f(2)).toBeGreaterThan(f(1))
    expect(f(5)).toBeGreaterThan(f(3))
  })
})

describe('persistenza', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) })
  })
  it('sanifica valori corrotti', () => {
    expect(sanitizeSoundSettings({ volume: 7, muted: 'x', categories: { ui: false } })).toEqual({ ...DEFAULT_SOUND_SETTINGS, volume: 1, categories: { game: true, ui: false, feedback: true } })
    expect(sanitizeSoundSettings(null)).toEqual(DEFAULT_SOUND_SETTINGS)
  })
  it('salva e ricarica', () => {
    useSoundSettings.getState().set({ volume: 0.3, categories: { ui: false } })
    expect(JSON.parse(localStorage.getItem(SOUND_STORAGE_KEY)!).volume).toBe(0.3)
    expect(loadSoundSettings().categories.ui).toBe(false)
  })
  it('storage che lancia: nessun crash', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } })
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS)
    expect(() => useSoundSettings.getState().set({ muted: true })).not.toThrow()
  })
})

describe('motore', () => {
  it('suona e schedula con currentTime', () => {
    const { e, f } = setup()
    expect(e.play('uiTap')).toBe(true)
    expect(f.started.length).toBeGreaterThan(0)
    expect(f.started[0]).toBeGreaterThan(1)
  })
  it('dedup di suoni ravvicinati, ma non per argomenti diversi', () => {
    const { e, tick } = setup()
    expect(e.play('draw')).toBe(true)
    tick(DEDUP_MS - 10)
    expect(e.play('draw')).toBe(false)
    expect(e.play('chainLink', 1)).toBe(true)
    expect(e.play('chainLink', 2)).toBe(true)
    tick(DEDUP_MS + 60)
    expect(e.play('draw')).toBe(true)
  })
  it('throttle: massimo N suoni per finestra', () => {
    const { e } = setup()
    const names = SOUND_NAMES.slice(0, THROTTLE_MAX + 4)
    const ok = names.filter((n) => e.play(n)).length
    expect(ok).toBe(THROTTLE_MAX)
  })
  it('polifonia limitata', () => {
    const { e, tick } = setup()
    for (let i = 0; i < 12; i++) { e.play('comboComplete'); tick(200) }
    expect(e.voices).toBeLessThanOrEqual(MAX_VOICES)
  })
  it('mute, categorie, volume 0 e pagina nascosta', () => {
    expect(setup({ settings: { muted: true } }).e.play('uiTap')).toBe(false)
    expect(setup({ settings: { volume: 0 } }).e.play('uiTap')).toBe(false)
    expect(setup({ hidden: true }).e.play('uiTap')).toBe(false)
    const off = setup({ settings: { categories: { game: false, ui: true, feedback: true } } })
    expect(off.e.play('draw')).toBe(false)
    expect(off.e.play('uiTap')).toBe(true)
    expect(off.e.play('draw', undefined, { force: true })).toBe(true)
  })
  it('vibrazione separata dall\'audio', () => {
    const a = setup({ settings: { vibrate: true, muted: true } })
    a.e.play('error')
    expect(a.vibrate).toHaveBeenCalledWith([18, 40, 18])
    const b = setup()
    b.e.play('error')
    expect(b.vibrate).not.toHaveBeenCalled()
  })
  it('senza AudioContext non fallisce', () => {
    const e = createSoundEngine({ createContext: () => null, getSettings: () => DEFAULT_SOUND_SETTINGS, isHidden: () => false })
    expect(e.play('uiTap')).toBe(false)
  })
})
