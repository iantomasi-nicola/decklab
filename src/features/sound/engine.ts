import { categoryOf, SOUND_NAMES, type SoundName } from './names'
import { degreeFreq, RECIPES } from './recipes'
import { useSoundSettings, type SoundSettings } from './settings'

/** Sottoinsieme di WebAudio usato dal motore (permette un AudioContext simulato nei test). */
export type AudioCtxLike = AudioContext

export interface EngineDeps {
  createContext: () => AudioCtxLike | null
  /** Orologio monotono in ms (dedup/throttle). */
  clock: () => number
  isHidden: () => boolean
  vibrate: (p: number[]) => void
  getSettings: () => SoundSettings
}

export const MAX_VOICES = 20
export const DEDUP_MS = 45
export const THROTTLE_WINDOW_MS = 100
export const THROTTLE_MAX = 6

const VIBRATION: Partial<Record<SoundName, number[]>> = {
  summonNormal: [8], summonSpecial: [10], summonFusion: [12], summonSynchro: [12], summonXyz: [12], summonLink: [12],
  summonRitual: [12], summonPendulum: [12], destroy: [14], attack: [16], damage: [20], error: [18, 40, 18],
  targetConfirm: [8], comboComplete: [10, 40, 16], uiToggle: [6],
}
export const vibrationFor = (n: SoundName) => VIBRATION[n]

const defaultDeps = (): EngineDeps => ({
  createContext: () => {
    const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    try {
      return new C({ latencyHint: 'interactive' })
    } catch {
      return null
    }
  },
  clock: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  isHidden: () => typeof document !== 'undefined' && document.hidden,
  vibrate: (p) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(p)
    } catch {
      /* non supportato */
    }
  },
  getSettings: () => useSoundSettings.getState(),
})

export function createSoundEngine(overrides: Partial<EngineDeps> = {}) {
  const deps: EngineDeps = { ...defaultDeps(), ...overrides }
  let ctx: AudioCtxLike | null = null
  let master: GainNode | null = null
  let reverb: GainNode | null = null
  let noiseBuf: AudioBuffer | null = null
  let voices = 0
  let wantUnlock = false
  const lastAt = new Map<string, number>()
  const recent: number[] = []

  function ensure(): AudioCtxLike | null {
    if (ctx) return ctx
    const c = deps.createContext()
    if (!c) return null
    ctx = c
    master = c.createGain()
    const comp = c.createDynamicsCompressor()
    comp.threshold.value = -18
    comp.knee.value = 12
    comp.ratio.value = 8
    comp.attack.value = 0.003
    comp.release.value = 0.15
    const limiter = c.createDynamicsCompressor() // secondo stadio: limiter
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.08
    master.connect(comp)
    comp.connect(limiter)
    limiter.connect(c.destination)
    // riverbero sintetico: rumore con decadimento esponenziale (0.45 s)
    const len = Math.floor(c.sampleRate * 0.45)
    const ir = c.createBuffer(2, len, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
    }
    const conv = c.createConvolver()
    conv.buffer = ir
    reverb = c.createGain()
    reverb.gain.value = 0.5
    reverb.connect(conv)
    conv.connect(master)
    const nl = Math.floor(c.sampleRate * 0.5)
    noiseBuf = c.createBuffer(1, nl, c.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1
    master.gain.value = deps.getSettings().volume
    return c
  }

  /** Da chiamare in un gestore di gesto utente (iOS/Android): crea/riprende il contesto. */
  function unlock() {
    const c = ensure()
    if (c && c.state !== 'running') void c.resume?.().catch?.(() => {})
  }

  let installed = false
  /** Registra l'sblocco al primo gesto + la sospensione quando la pagina è nascosta. Idempotente. */
  function install() {
    if (installed || typeof document === 'undefined') return
    installed = true
    wantUnlock = true
    const evs = ['pointerdown', 'touchend', 'keydown', 'click'] as const
    const once = () => {
      unlock()
      if (ctx && ctx.state !== 'suspended') evs.forEach((e) => document.removeEventListener(e, once, true))
    }
    evs.forEach((e) => document.addEventListener(e, once, { capture: true, passive: true }))
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return
      if (deps.isHidden()) void ctx.suspend?.().catch?.(() => {})
      else if (wantUnlock) void ctx.resume?.().catch?.(() => {})
    })
  }

  function schedule(c: AudioCtxLike, name: SoundName, arg: number | undefined) {
    const t0 = c.currentTime + 0.005
    for (const note of RECIPES[name](arg)) {
      if (voices >= MAX_VOICES) return
      const t = t0 + note.at
      const env = c.createGain()
      const filt = c.createBiquadFilter()
      filt.type = 'lowpass'
      filt.frequency.value = note.lp ?? 6000
      filt.Q.value = 0.5
      const a = note.a ?? 0.006
      env.gain.setValueAtTime(0.0001, t)
      env.gain.linearRampToValueAtTime(note.gain, t + a)
      env.gain.exponentialRampToValueAtTime(0.0001, t + note.dur)
      let src: AudioScheduledSourceNode
      if (note.wave === 'noise') {
        const s = c.createBufferSource()
        s.buffer = noiseBuf
        s.loop = true
        if (note.hp) {
          const hp = c.createBiquadFilter()
          hp.type = 'highpass'
          hp.frequency.value = note.hp
          s.connect(hp)
          hp.connect(filt)
        } else s.connect(filt)
        if (note.glide) filt.frequency.exponentialRampToValueAtTime(Math.max(80, (note.lp ?? 6000) * note.glide), t + note.dur)
        src = s
      } else {
        const o = c.createOscillator()
        o.type = note.wave
        const f = degreeFreq(note.deg)
        o.frequency.setValueAtTime(f, t)
        if (note.glide) o.frequency.exponentialRampToValueAtTime(f * note.glide, t + note.dur)
        if (note.detune) o.detune.value = note.detune
        o.connect(filt)
        src = o
      }
      filt.connect(env)
      env.connect(master!)
      if (note.send && reverb) {
        const snd = c.createGain()
        snd.gain.value = note.send
        env.connect(snd)
        snd.connect(reverb)
      }
      voices++
      src.onended = () => {
        voices--
        env.disconnect()
      }
      src.start(t)
      src.stop(t + note.dur + 0.03)
    }
  }

  /**
   * Riproduce un suono. `arg`: per chainLink è il numero d'anello (1..).
   * `force` (pulsante "Prova"): ignora categorie e dedup/throttle, ma non il silenziamento globale.
   * Ritorna true se il suono è stato schedulato.
   */
  function play(name: SoundName, arg?: number, opts: { force?: boolean } = {}): boolean {
    const s = deps.getSettings()
    if (s.vibrate && !deps.isHidden()) {
      const v = VIBRATION[name]
      if (v && (opts.force || s.categories[categoryOf(name)])) deps.vibrate(v)
    }
    if (s.muted || s.volume <= 0) return false
    if (!opts.force && !s.categories[categoryOf(name)]) return false
    if (deps.isHidden()) return false
    if (!RECIPES[name]) return false
    const now = deps.clock()
    if (!opts.force) {
      const key = name + ':' + (arg ?? '')
      const prev = lastAt.get(key)
      if (prev !== undefined && now - prev < DEDUP_MS) return false
      while (recent.length && now - recent[0]! > THROTTLE_WINDOW_MS) recent.shift()
      if (recent.length >= THROTTLE_MAX) return false
      lastAt.set(key, now)
      recent.push(now)
    }
    const c = ensure()
    if (!c) return false
    if (c.state === 'suspended') void c.resume?.().catch?.(() => {})
    master!.gain.setTargetAtTime(s.volume, c.currentTime, 0.01)
    schedule(c, name, arg)
    return true
  }

  /** Aggiorna subito il volume master (chiamato quando cambia l'impostazione). */
  function applyVolume() {
    if (ctx && master) master.gain.setTargetAtTime(deps.getSettings().volume, ctx.currentTime, 0.01)
  }

  return { play, unlock, install, applyVolume, names: SOUND_NAMES, get voices() { return voices } }
}

export const soundEngine = createSoundEngine()
export const playSound = (name: SoundName, arg?: number) => soundEngine.play(name, arg)
useSoundSettings.subscribe(() => soundEngine.applyVolume())
