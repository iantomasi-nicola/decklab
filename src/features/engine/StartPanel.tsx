/** Avvio del duello: Primo/Secondo, mano (necessarie + completamento casuale), ordine del mazzo, "Avvia" e "Rigioca con il motore". */
import { useEffect, useMemo, useState } from 'react'
import Dice5 from 'lucide-react/icons/dice-5'
import Minus from 'lucide-react/icons/minus'
import Play from 'lucide-react/icons/play'
import Plus from 'lucide-react/icons/plus'
import RotateCcw from 'lucide-react/icons/rotate-ccw'
import X from 'lucide-react/icons/x'
import { decodeAnswers } from '@/engine/codec'
import type { ComboDoc } from '@/domain/combo/types'
import { useEditor } from '@/features/combos/editorStore'
import { handSize } from '@/features/combos/model'
import { playSound } from '@/features/sound'
import { Banner } from '@/ui/Banner'
import { Segmented } from '@/ui/Segmented'
import { LoadBar } from './AutoDock'
import { useDuel } from './duelStore'
import { requestFromDoc, savedSeed } from './sync'
import { useEngT } from './strings'

const newSeed = () => (Math.floor(Math.random() * 0x7fffffff) + 1) | 0

export async function startDuelFor(doc: ComboDoc, opts: { seed: number; order?: number[] | undefined; replay?: boolean }): Promise<boolean> {
  const s = useDuel.getState()
  // punto di ritorno per l'annulla del manuale: i passi registrati a mano non si perdono
  if (doc.steps.length > 0 && doc.meta.source !== 'engine') useEditor.getState().edit((d) => ({ doc: d }))
  const replay = opts.replay && doc.engine ? { answers: decodeAnswers(doc.engine.responses) } : undefined
  return s.start(requestFromDoc(doc, opts.seed, opts.order), replay)
}

export function StartPanel({ doc, onClose }: { doc: ComboDoc; onClose?: (() => void) | undefined }) {
  const { t } = useEngT()
  const status = useDuel((s) => s.status)
  const error = useDuel((s) => s.error)
  const saved = useMemo(() => savedSeed(doc), [doc])
  const [seed, setSeed] = useState(() => saved?.seed ?? newSeed())
  const [orderMode, setOrderMode] = useState<'shuffle' | 'saved'>('shuffle')
  const hand = doc.setup.hand
  const req = hand.required.length
  const store = useEditor.getState()
  const setSetup = (patch: Partial<ComboDoc['setup']>) => store.edit((d) => ({ doc: { ...d, setup: { ...d.setup, ...patch } } }))
  const loading = status === 'loading'
  const empty = doc.deck.main.length === 0
  const fill = hand.fill === 'none' ? 0 : Math.max(0, hand.size - req)

  useEffect(() => {
    // scalda il motore mentre si decide: init + script del mazzo (mai bloccante)
    const codes = [...new Set([...doc.deck.main, ...doc.deck.extra, ...Object.values(doc.cards)])]
    if (codes.length) useDuel.getState().warm(codes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.deck.main.length])

  const begin = (replay: boolean) => {
    playSound('uiTap')
    const useSaved = replay || (orderMode === 'saved' && saved)
    void startDuelFor(doc, { seed: useSaved && saved ? saved.seed : seed, order: useSaved ? saved?.order : undefined, replay })
  }
  const hasManual = doc.steps.length > 0 && doc.meta.source !== 'engine'

  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto p-3" data-testid="start-panel" style={{ background: 'color-mix(in srgb, var(--bg) 70%, transparent)' }}>
      <section aria-labelledby="start-title" className="flex max-h-full w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-lg border border-line bg-surface-1 p-4 shadow-3">
        <div className="flex items-start justify-between gap-2">
          <h2 id="start-title" className="text-lg font-semibold leading-6">{t('start.title')}</h2>
          {onClose ? <button type="button" aria-label={t('sel.cancel')} className="-mr-2 -mt-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:text-fg" onClick={onClose} data-testid="start-close"><X aria-hidden size={20} /></button> : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{t('start.turnOrder')}</h3>
          <Segmented<'first' | 'second'>
            label={t('start.turnOrder')}
            fill
            value={doc.setup.first ? 'first' : 'second'}
            onValueChange={(v) => setSetup({ first: v === 'first', hand: { ...hand, size: Math.max(handSize(v === 'first'), req) } })}
            options={[{ value: 'first', label: t('start.first') }, { value: 'second', label: t('start.second') }]}
          />
          {!doc.setup.first ? <p className="text-sm text-muted" data-testid="second-note">{t('start.secondNote')}</p> : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{t('start.hand')}</h3>
          <div className="flex items-center gap-2">
            <button type="button" className="grid size-11 place-items-center rounded-md border border-line-strong bg-surface-2 disabled:opacity-40" aria-label={`${t('start.handSize')} −`} disabled={hand.size <= Math.max(1, req)} onClick={() => setSetup({ hand: { ...hand, size: hand.size - 1 } })}><Minus aria-hidden size={18} /></button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-base font-semibold tabular-nums" data-testid="hand-size">{t('start.handSize')}: {hand.size}</p>
              <p className="text-sm text-muted">{t('start.handSummary', { r: req, f: fill })}</p>
            </div>
            <button type="button" className="grid size-11 place-items-center rounded-md border border-line-strong bg-surface-2 disabled:opacity-40" aria-label={`${t('start.handSize')} +`} disabled={hand.size >= 10} onClick={() => setSetup({ hand: { ...hand, size: hand.size + 1 } })}><Plus aria-hidden size={18} /></button>
          </div>
          <Segmented<'random' | 'none'>
            label={t('start.hand')}
            fill
            value={hand.fill}
            onValueChange={(v) => setSetup({ hand: { ...hand, fill: v } })}
            options={[{ value: 'random', label: t('start.handFill') }, { value: 'none', label: t('start.handFillOff') }]}
          />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{t('start.deckOrder')}</h3>
          {saved?.order ? (
            <Segmented<'shuffle' | 'saved'>
              label={t('start.deckOrder')}
              fill
              value={orderMode}
              onValueChange={setOrderMode}
              options={[{ value: 'shuffle', label: t('start.shuffleOpt') }, { value: 'saved', label: t('start.saved') }]}
            />
          ) : null}
          {orderMode === 'shuffle' ? (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-[15px] tabular-nums" data-testid="seed">{t('start.shuffle', { seed })}</p>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-[15px] font-medium hover:bg-surface-3" onClick={() => setSeed(newSeed())} data-testid="reshuffle">
                <Dice5 aria-hidden size={18} />
                {t('start.reshuffle')}
              </button>
            </div>
          ) : null}
        </div>

        {empty ? <Banner tone="warn" title={t('start.deckEmpty')} /> : null}
        {error && status === 'error' ? <Banner tone="danger" title={t('err.title')}>{error.message}</Banner> : null}
        {loading ? <LoadBar /> : null}

        <div className="flex flex-col gap-2">
          <button type="button" className="eng-btn" data-primary="true" disabled={empty || loading} onClick={() => begin(false)} data-testid="start-duel">
            <Play aria-hidden size={18} />
            {t('start.begin')}
          </button>
          {doc.engine?.responses.length ? (
            <button type="button" className="eng-btn" disabled={empty || loading} onClick={() => begin(true)} data-testid="replay-engine" title={t('start.replayHint')}>
              <RotateCcw aria-hidden size={18} />
              {t('start.replay')}
            </button>
          ) : null}
          {hasManual ? <p className="text-sm text-muted" data-testid="replace-note">{t('start.replaceNote')}</p> : null}
        </div>
      </section>
    </div>
  )
}
