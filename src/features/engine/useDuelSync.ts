import { useEffect } from 'react'
import { useEditor } from '@/features/combos/editorStore'
import { useDuel } from './duelStore'
import { docFromDuel } from './sync'

/** Ogni nuovo stato del motore sostituisce i passi della combo aperta (senza cronologia: annulla/ripeti sono del motore). */
export function useDuelDocSync(enabled: boolean) {
  const tick = useDuel((s) => s.tick)
  useEffect(() => {
    const d = useDuel.getState()
    if (!enabled || !d.state) return
    useEditor.getState().sync((doc) => docFromDuel(doc, d.state!, d.engine))
  }, [tick, enabled])
}
