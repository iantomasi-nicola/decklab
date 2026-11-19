/** Zona del campo in modalità automatica: prima dell'avvio mostra il setup (sola lettura) con il pannello "Avvia", poi il campo del motore. */
import { useState, type ReactNode } from 'react'
import Play from 'lucide-react/icons/play'
import type { ComboDoc } from '@/domain/combo/types'
import type { TurnState } from '@/domain/combo/turn'
import { AutoBoard } from './AutoBoard'
import { useDuel } from './duelStore'
import { StartPanel } from './StartPanel'
import { useEngT } from './strings'

export function AutoStage({ doc, turn, mineOnly, children }: { doc: ComboDoc; turn?: TurnState | undefined; mineOnly?: boolean; children: ReactNode }) {
  const { t } = useEngT()
  const live = useDuel((s) => s.state !== null)
  const [closed, setClosed] = useState(false)
  if (live) return <AutoBoard turn={turn} mineOnly={!!mineOnly} />
  return (
    <div className="relative h-full min-h-0">
      {children}
      {closed ? (
        <button type="button" className="eng-act absolute left-1/2 top-2 z-40 -translate-x-1/2 shadow-2" data-primary="true" onClick={() => setClosed(false)} data-testid="open-start">
          <Play aria-hidden size={18} />
          {t('start.begin')}
        </button>
      ) : (
        <StartPanel doc={doc} onClose={doc.steps.length ? () => setClosed(true) : undefined} />
      )}
    </div>
  )
}
