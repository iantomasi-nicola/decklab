/** Avvio del duello: Primo/Secondo, mano (necessarie + completamento casuale), ordine del mazzo, "Avvia" e "Rigioca con il motore". */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Dice5 from 'lucide-react/icons/dice-5'
import History from 'lucide-react/icons/history'
import Play from 'lucide-react/icons/play'
import RotateCcw from 'lucide-react/icons/rotate-ccw'
import SlidersHorizontal from 'lucide-react/icons/sliders-horizontal'
import X from 'lucide-react/icons/x'
import { decodeAnswers } from '@/engine/codec'
import type { ComboDoc } from '@/domain/combo/types'
import { useEditor } from '@/features/combos/editorStore'
import { CardFace } from '@/features/combos/CardFace'
import { HandIssueList, HandPicker } from '@/features/combos/HandPicker'
import { handSize, handTotal } from '@/features/combos/model'
import { useCards, useMediaQuery } from '@/features/combos/useCards'
import { useDocHand } from '@/features/combos/useDocHand'
import { playSound } from '@/features/sound'
import { Banner } from '@/ui/Banner'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/Dialog'
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

/** Anteprima della mano che partirà davvero: stesso piano del motore (`buildPlan`), caricato solo quando serve. */
function useHandPreview(doc: ComboDoc, seed: number, order: number[] | undefined): { hand: number[] | null; failed: boolean } {
  const [res, setRes] = useState<{ hand: number[] | null; failed: boolean }>({ hand: null, failed: false })
  const orderKey = order?.join(',') ?? ''
  useEffect(() => {
    let live = true
    if (doc.deck.main.length === 0) {
      setRes({ hand: [], failed: false })
      return
    }
    void import('@/engine/duel')
      .then(({ buildPlan }) => {
        const plan = buildPlan(requestFromDoc(doc, seed, order) as Parameters<typeof buildPlan>[0])
        const n = plan.startingDraw[plan.userTeam]
        const hand = plan.deckTop.slice(0, n).map((i) => plan.cards[i]!.code)
        if (live) setRes({ hand, failed: false })
      })
      .catch(() => live && setRes({ hand: null, failed: true }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.setup, doc.deck.main, doc.cards, seed, orderKey])
  return res
}

const btn = 'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 text-[15px] font-medium hover:bg-surface-3 aria-pressed:border-accent-text aria-pressed:bg-accent-soft aria-pressed:text-accent-text disabled:cursor-default disabled:opacity-40'

/**
 * Fascia compatta sotto il campo (mai sopra): anteprima della mano che partirà, Rimescola, "ripeti l'ultima mano", Avvia.
 * La scelta completa (turno, modalità, carte dal mazzo) si apre in un foglio su richiesta.
 */
export function StartPanel({ doc, onClose }: { doc: ComboDoc; onClose?: (() => void) | undefined }) {
  const { t } = useEngT()
  const { t: tc } = useTranslation()
  const { nameOf } = useCards()
  const wide = useMediaQuery('(min-width: 768px)')
  const status = useDuel((s) => s.status)
  const error = useDuel((s) => s.error)
  const saved = useMemo(() => savedSeed(doc), [doc])
  const [seed, setSeed] = useState(() => saved?.seed ?? newSeed())
  const [orderMode, setOrderMode] = useState<'shuffle' | 'saved'>('shuffle')
  const [sheet, setSheet] = useState(false)
  const hand = doc.setup.hand
  const store = useEditor.getState()
  const setSetup = (patch: Partial<ComboDoc['setup']>) => store.edit((d) => ({ doc: { ...d, setup: { ...d.setup, ...patch } } }))
  const loading = status === 'loading'
  const empty = doc.deck.main.length === 0
  const dh = useDocHand(doc)
  const useSavedOrder = orderMode === 'saved' && !!saved
  const effSeed = useSavedOrder && saved ? saved.seed : seed
  const effOrder = useSavedOrder ? saved?.order : undefined
  const preview = useHandPreview(doc, effSeed, effOrder)
  const required = doc.setup.hand.required
  const drawn = preview.hand ? preview.hand.slice(required.length) : undefined
  const total = handTotal(hand)
  const mode = dh.value.mode

  useEffect(() => {
    // scalda il motore mentre si decide: init + script del mazzo (mai bloccante)
    const codes = [...new Set([...doc.deck.main, ...doc.deck.extra, ...Object.values(doc.cards)])]
    if (codes.length) useDuel.getState().warm(codes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.deck.main.length])

  const begin = (replay: boolean) => {
    playSound('uiTap')
    const useSaved = replay || useSavedOrder
    void startDuelFor(doc, { seed: useSaved && saved ? saved.seed : seed, order: useSaved ? saved?.order : undefined, replay })
  }
  const reshuffle = () => {
    setOrderMode('shuffle')
    setSeed(newSeed())
  }
  const repeatLast = () => {
    if (!saved) return
    setSeed(saved.seed)
    setOrderMode((m) => (m === 'saved' ? 'shuffle' : 'saved'))
  }
  const hasManual = doc.steps.length > 0 && doc.meta.source !== 'engine'
  const previewCodes = preview.hand ?? [...dh.value.codes]
  const summary = mode === 'exact' ? tc('combos.hand.sum.exact', { count: required.length }) : mode === 'mixed' ? tc('combos.hand.sum.mixed', { n: required.length, f: Math.max(0, total - required.length), size: total }) : tc('combos.hand.sum.random', { size: total })
  const turnLabel = doc.setup.first ? t('start.first') : t('start.second')

  const sheetBody = (
    <div className="flex flex-col gap-4" data-testid="start-sheet">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted">{t('start.turnOrder')}</h3>
        <Segmented<'first' | 'second'>
          label={t('start.turnOrder')}
          fill
          value={doc.setup.first ? 'first' : 'second'}
          onValueChange={(v) => setSetup({ first: v === 'first', hand: { ...hand, size: Math.max(handSize(v === 'first'), required.length) } })}
          options={[{ value: 'first', label: t('start.first') }, { value: 'second', label: t('start.second') }]}
        />
        {!doc.setup.first ? <p className="text-sm text-muted" data-testid="second-note">{t('start.secondNote')}</p> : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-muted">{t('start.hand')}</h3>
        <HandPicker deck={doc.deck.main} value={dh.value} onChange={dh.onChange} drawn={drawn} onReshuffle={reshuffle} issues={<HandIssueList items={dh.issues} />} />
      </div>
      {saved?.order ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">{t('start.deckOrder')}</h3>
          <Segmented<'shuffle' | 'saved'>
            label={t('start.deckOrder')}
            fill
            value={orderMode}
            onValueChange={setOrderMode}
            options={[{ value: 'shuffle', label: t('start.shuffleOpt') }, { value: 'saved', label: t('start.saved') }]}
          />
        </div>
      ) : null}
      <button type="button" className="eng-btn" data-primary="true" onClick={() => setSheet(false)} data-testid="start-sheet-done">
        {t('start.done')}
      </button>
    </div>
  )

  return (
    <section aria-label={t('start.title')} className="shrink-0 rounded-lg border border-line bg-surface-1 p-2 shadow-2" data-testid="start-panel">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <button type="button" onClick={() => setSheet(true)} className="flex min-h-11 min-w-0 cursor-pointer flex-col items-start gap-1 rounded-md text-left" aria-label={t('start.edit')} data-testid="hand-edit">
          <span className="flex items-start gap-1.5" data-testid="hand-preview" aria-hidden>
            {previewCodes.map((c, i) => (
              <span key={`${c}-${i}`} data-code={c} className={cn('relative block w-8 shrink-0 rounded-[5px] sm:w-9', i < required.length ? 'ring-2 ring-accent-text' : 'opacity-80 outline-dashed outline-2 -outline-offset-2 outline-line-strong')}>
                <CardFace code={c} name={nameOf(c)} />
              </span>
            ))}
            {previewCodes.length === 0 ? <span className="grid h-[46px] place-items-center text-sm text-muted">{preview.failed ? tc('combos.hand.previewError') : '…'}</span> : null}
          </span>
          <span className="max-w-full truncate text-sm text-muted" data-testid="hand-line">
            {turnLabel} · {summary}
            <span className="max-sm:hidden"> · <span data-testid="seed">{t('start.shuffle', { seed: effSeed })}</span></span>
          </span>
        </button>

        <button type="button" className="eng-btn sm:order-3" data-primary="true" disabled={empty || loading} onClick={() => begin(false)} data-testid="start-duel">
          <Play aria-hidden size={18} />
          {t('start.begin')}
        </button>

        <div className="col-span-2 flex items-center justify-end gap-2 sm:order-2 sm:col-span-1">
          {saved ? (
            <button type="button" className={btn} aria-pressed={useSavedOrder} onClick={repeatLast} data-testid="repeat-last" aria-label={t('start.repeatLast')} title={t('start.repeatLastHint')}>
              <History aria-hidden size={18} />
              <span className="max-sm:hidden">{t('start.repeatLast')}</span>
            </button>
          ) : null}
          {mode !== 'exact' ? (
            <button type="button" className={btn} onClick={reshuffle} data-testid="reshuffle" aria-label={t('start.reshuffle')}>
              <Dice5 aria-hidden size={18} />
              <span className="max-sm:hidden">{t('start.reshuffle')}</span>
            </button>
          ) : null}
          {doc.engine?.responses.length ? (
            <button type="button" className={btn} disabled={empty || loading} onClick={() => begin(true)} data-testid="replay-engine" aria-label={t('start.replay')} title={t('start.replayHint')}>
              <RotateCcw aria-hidden size={18} />
              <span className="max-md:hidden">{t('start.replay')}</span>
            </button>
          ) : null}
          <button type="button" className={btn} onClick={() => setSheet(true)} aria-label={t('start.edit')} data-testid="hand-edit-btn">
            <SlidersHorizontal aria-hidden size={18} />
            <span className="max-sm:hidden">{t('start.edit')}</span>
          </button>
          {onClose ? (
            <button type="button" aria-label={t('sel.cancel')} className={btn} onClick={onClose} data-testid="start-close">
              <X aria-hidden size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {dh.issues.length ? <div className="mt-2"><HandIssueList items={dh.issues} /></div> : null}
      {empty ? <div className="mt-2"><Banner tone="warn" title={t('start.deckEmpty')} /></div> : null}
      {error && status === 'error' ? <div className="mt-2"><Banner tone="danger" title={t('err.title')}>{error.message}</Banner></div> : null}
      {loading ? <div className="mt-2"><LoadBar /></div> : null}
      {hasManual ? <p className="mt-2 text-sm text-muted" data-testid="replace-note">{t('start.replaceNote')}</p> : null}

      {sheet ? (
        wide ? (
          <Dialog open onOpenChange={(o) => !o && setSheet(false)} title={t('start.title')} className="max-w-xl">
            {sheetBody}
          </Dialog>
        ) : (
          <BottomSheet open onOpenChange={(o) => !o && setSheet(false)} title={t('start.title')}>
            {sheetBody}
          </BottomSheet>
        )
      ) : null}
    </section>
  )
}
