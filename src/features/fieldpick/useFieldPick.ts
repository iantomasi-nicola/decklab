/** Hook della selezione sul campo: stato della scelta (reducer puro `targetPick`), pubblicazione nello store del campo, tastiera. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Uid } from '@/domain/combo/types'
import { canConfirmPick, initPick, togglePick, undoPick, type PickState } from '@/domain/combo/targetPick'
import { playSound } from '@/features/sound'
import { usePickUi, type FieldPickSpec } from './pickStore'

export interface FieldPickOptions {
  candidates: readonly Uid[]
  min?: number
  max?: number
  /** scelte iniziali (auto-selezione: se i candidati sono esattamente quelli richiesti) */
  preselected?: readonly Uid[]
  /** false = obbligatoria (niente Annulla, Esc non fa nulla) */
  cancelable?: boolean
  /** con una sola scelta da fare, conferma subito al tocco */
  confirmOnPick?: boolean
  /** condizione in più per la conferma (somma, valore dei tributi) */
  validate?: ((selected: readonly Uid[]) => boolean) | undefined
  onConfirm: (selected: Uid[]) => void
  onCancel?: (() => void) | undefined
  /** carte sempre scelte (obbligatorie): il tocco le ignora */
  locked?: ReadonlySet<Uid> | undefined
  /** avviso quando si tocca oltre il massimo */
  onFull?: ((max: number) => void) | undefined
}

export interface FieldPick {
  selected: readonly Uid[]
  state: PickState
  canConfirm: boolean
  toggle: (uid: Uid) => void
  undo: () => void
  confirm: () => void
  cancel: (() => void) | undefined
}

export function useFieldPick(o: FieldPickOptions): FieldPick {
  const candKey = o.candidates.join('|')
  const cfg = useMemo(() => ({ candidates: o.candidates, ...(o.min !== undefined ? { min: o.min } : {}), ...(o.max !== undefined ? { max: o.max } : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candKey, o.min, o.max])
  const [state, setState] = useState<PickState>(() => initPick(cfg, o.preselected))
  const ref = useRef({ state, o })
  ref.current = { state, o }

  // nuovo insieme di candidati o nuovi limiti: si riparte
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    setState(initPick(cfg, ref.current.o.preselected))
  }, [cfg])

  const toggle = useCallback((uid: Uid) => {
    const { state: s, o: opt } = ref.current
    if (opt.locked?.has(uid)) {
      playSound('error')
      return
    }
    const r = togglePick(s, uid)
    if (r.change === 'ignored') return
    if (r.change === 'full') {
      playSound('error')
      opt.onFull?.(s.max)
      return
    }
    setState(r.state)
    ref.current.state = r.state
    playSound('targetSelect')
    if (opt.confirmOnPick && r.state.max === 1 && r.state.min === 1 && r.change !== 'removed') {
      playSound('targetConfirm')
      opt.onConfirm([...r.state.selected])
    }
  }, [])
  const undo = useCallback(() => setState((s) => {
    const last = s.selected[s.selected.length - 1]
    return last !== undefined && ref.current.o.locked?.has(last) ? s : undoPick(s)
  }), [])
  const okNow = (s: PickState, v: FieldPickOptions['validate']) => canConfirmPick(s) && (!v || v(s.selected))
  const confirm = useCallback(() => {
    const { state: s, o: opt } = ref.current
    if (!okNow(s, opt.validate)) return
    playSound('targetConfirm')
    opt.onConfirm([...s.selected])
  }, [])
  const cancel = useCallback(() => ref.current.o.onCancel?.(), [])
  const cancelable = o.cancelable !== false && !!o.onCancel

  // pubblicazione per il Field
  const spec = useMemo<FieldPickSpec>(() => {
    const order = new Map<Uid, number>()
    state.selected.forEach((u, i) => order.set(u, i + 1))
    return { candidates: new Set(state.candidates), chosen: new Set(state.selected), order, numbered: state.max > 1, toggle }
  }, [state, toggle])
  useEffect(() => {
    usePickUi.setState({ spec })
  }, [spec])
  useEffect(() => () => usePickUi.setState({ spec: null }), [])

  // tastiera: Invio conferma, Esc annulla, Backspace toglie l'ultima
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing || e.altKey || e.metaKey) return
      if (e.key === 'Escape' && cancelable) {
        e.preventDefault()
        e.stopPropagation()
        ref.current.o.onCancel?.()
      } else if (e.key === 'Enter' && (e.ctrlKey || el?.tagName !== 'BUTTON')) {
        if (okNow(ref.current.state, ref.current.o.validate)) {
          e.preventDefault()
          confirm()
        }
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [cancelable, confirm, undo])

  return { selected: state.selected, state, canConfirm: okNow(state, o.validate), toggle, undo, confirm, cancel: cancelable ? cancel : undefined }
}
