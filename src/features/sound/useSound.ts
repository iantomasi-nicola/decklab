import { useCallback } from 'react'
import type { Step } from '@/domain/combo/types'
import { playSound, soundEngine } from './engine'
import type { SoundName } from './names'
import { soundForAction } from './names'
import { useSoundSettings } from './settings'

/** Hook di integrazione: `play(name, arg?)`, `playForStep(step)`, più le impostazioni correnti. */
export function useSound() {
  const settings = useSoundSettings()
  const play = useCallback((name: SoundName, arg?: number) => playSound(name, arg), [])
  const playForStep = useCallback((step: Step) => {
    const n = soundForAction(step)
    if (n) playSound(n, n === 'chainLink' ? step.chain?.link : undefined)
    return n
  }, [])
  const preview = useCallback((name: SoundName) => soundEngine.play(name, name === 'chainLink' ? 3 : undefined, { force: true }), [])
  return { play, playForStep, preview, soundForAction, settings }
}
