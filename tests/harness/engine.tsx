/** Pagina di prova (solo dev/e2e) della modalità automatica con un motore finto: ?req=<kind di esempio> | ?scenario=flow | ?view=start|notices. */
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { initI18n } from '../../src/i18n'
import { allStates } from '../../src/domain/combo/state'
import type { ComboDoc } from '../../src/domain/combo/types'
import { turnTimeline } from '../../src/domain/combo/turn'
import { useEditor } from '../../src/features/combos/editorStore'
import { Board } from '../../src/features/combos/Board'
import { AutoBoard } from '../../src/features/engine/AutoBoard'
import { AutoDock, AutoNotices } from '../../src/features/engine/AutoDock'
import { AutoStage } from '../../src/features/engine/AutoStage'
import { useDuel } from '../../src/features/engine/duelStore'
import { requestFromDoc } from '../../src/features/engine/sync'
import { TooltipProvider } from '../../src/ui/Tooltip'
import { ToastViewport } from '../../src/ui/Toast'
import { useCards } from '../../src/features/combos/useCards'
import { makeState, sampleBoard, sampleRequests, scenarioClient, CODE, ref, opt } from '../mocks/engineClient'
import base from '../fixtures/combo/v1.json'

initI18n()
const params = new URLSearchParams(location.search)
const doc = structuredClone(base) as unknown as ComboDoc
doc.deck = { main: Array(40).fill(CODE.ash), extra: [CODE.xyz], side: [] }
doc.cards = { u1: CODE.ash, u2: CODE.tengu }
doc.setup.hand = { required: ['u1', 'u2'], size: 5, fill: 'random' }

function flowStates() {
  const reqs = sampleRequests()
  const idle = reqs.idle!
  const b = sampleBoard()
  const summoned = ref('u1', CODE.tengu, 'mzone', 3, 'FACEUP_ATK')
  const after = makeState(idle, {
    piles: [{ ...b.piles[0], hand: b.hand.filter((h) => h.uid !== 'u1'), handCount: 4 }, b.piles[1]],
    endboard: { ...b.endboard, own: { lp: 8000, places: [...b.endboard.own.places, { uid: 'u1', place: summoned.place }] } },
    steps: [{ id: 's1', action: 'normalSummon', card: 'u1', phase: 'main1', moves: [{ uid: 'u1', from: { loc: 'hand', seq: 0 }, to: summoned.place, why: 'summon' }] }],
    cards: { ...b.cards },
  })
  return [makeState(idle), makeState(reqs.place!), after]
}

function Harness() {
  const [ready, setReady] = useState(false)
  const cards = useCards()
  const view = params.get('view')
  useEffect(() => {
    const req = params.get('req')
    const reqs = sampleRequests()
    const states = params.get('scenario') === 'flow' ? flowStates() : [makeState(reqs[req ?? 'idle'] ?? reqs.idle!), makeState(reqs.idle!)]
    const fake = scenarioClient(states)
    ;(window as unknown as Record<string, unknown>).__fake = fake
    ;(window as unknown as Record<string, unknown>).__duel = useDuel
    useEditor.getState().open(doc, 'harness')
    useDuel.getState().setClientFactory(() => fake)
    if (view === 'start') return setReady(true)
    void useDuel.getState().start(requestFromDoc(doc, 1)).then(() => {
      if (view === 'notices') {
        const kind = params.get('kind')
        if (kind === 'error') useDuel.setState({ error: { kind: 'core', message: 'Errore di prova' } })
        if (kind === 'unsupported') useDuel.setState({ unsupported: [CODE.ash] })
        if (kind === 'loading') useDuel.setState({ busy: true, load: { done: 12, total: 40 } })
      }
      setReady(true)
    })
  }, [view])
  void opt
  if (!ready) return null
  const states = allStates(doc)
  const turn = turnTimeline(doc)[0]
  return (
    <TooltipProvider>
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }} data-combo-stage>
        <AutoNotices onManual={() => undefined} nameOf={cards.nameOf} />
        {view === 'start' ? null : <AutoDock turn={turn} />}
        <div style={{ position: 'relative', minHeight: 0, flex: 1, containerType: 'size' }}>
          <div style={{ position: 'relative', height: '100%' }}>
            {view === 'start' ? (
              <AutoStage doc={doc} turn={turn}>
                <Board doc={doc} state={states.main[0]!} mode="steps" cursor={0} readOnly turn={turn} />
              </AutoStage>
            ) : (
              <AutoBoard turn={turn} />
            )}
          </div>
        </div>
      </div>
      <ToastViewport />
    </TooltipProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
