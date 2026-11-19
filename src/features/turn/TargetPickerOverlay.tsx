import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Uid } from '@/domain/combo/types'
import { canConfirmPick, initPick, pickCounter, pickOrder, stepCandidate, togglePick, undoPick, type PickState } from '@/domain/combo/targetPick'
import { GameIcon } from '@/ui/gameIcons'
import { useTurnT } from './strings'
import './turn.css'

export interface TargetPickerOverlayProps {
  /** Carte tra cui scegliere. Gli elementi sul campo si trovano da `findElement` (default: `[data-card="uid"]`). */
  candidates: readonly Uid[]
  /** Quante scegliere: `max` (default 1) e, per un intervallo, `min` (default = max). */
  min?: number
  max?: number
  /** Riga sopra il contatore, es. il nome dell'effetto. */
  title?: string
  /** Nome leggibile di una carta (per screen reader e per i candidati non visibili sul campo). */
  cardName?: (uid: Uid) => string
  /** Selezione iniziale. */
  defaultSelected?: readonly Uid[]
  onChange?: (selected: Uid[]) => void
  onConfirm: (selected: Uid[]) => void
  onCancel: () => void
  /** Con max = 1 conferma subito alla scelta (flusso veloce, senza il tocco su Conferma). */
  confirmOnPick?: boolean
  /** Elemento DOM di una carta; default `document.querySelector('[data-card="uid"]')`. */
  findElement?: (uid: Uid) => Element | null
  /** Posizione del pannello: 'auto' sceglie il lato che copre meno candidati. */
  placement?: 'auto' | 'top' | 'bottom'
}

interface R { x: number; y: number; w: number; h: number }
const same = (a: R | undefined, b: R | undefined) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
const defaultFind = (uid: Uid): Element | null => document.querySelector(`[data-card="${uid.replace(/["\\]/g, '\\$&')}"]`)
function measure(candidates: readonly Uid[], find: (u: Uid) => Element | null): Record<Uid, R> {
  const out: Record<Uid, R> = {}
  for (const u of candidates) {
    const el = find(u)
    if (!el) continue
    const b = el.getBoundingClientRect()
    if (b.width < 1 || b.height < 1) continue
    out[u] = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
  }
  return out
}
const MIN_HIT = 44
const PAD = 3

/**
 * Selezione dei bersagli a tutto schermo: candidati evidenziati con anello (e un respiro sobrio), il resto oscurato,
 * contatore "Scegli N di M", numero d'ordine sulle carte scelte, Conferma/Annulla grandi. Mouse, touch e tastiera
 * (frecce = muovi, Spazio/Invio = scegli, Backspace = togli l'ultima, Ctrl+Invio = conferma, Esc = annulla).
 * Non modifica il campo: legge la posizione degli elementi `data-card` e ci disegna sopra.
 */
export function TargetPickerOverlay({
  candidates, min, max, title, cardName, defaultSelected, onChange, onConfirm, onCancel, confirmOnPick, findElement = defaultFind, placement = 'auto',
}: TargetPickerOverlayProps) {
  const { t } = useTurnT()
  const name = useCallback((u: Uid) => cardName?.(u) ?? u, [cardName])
  const candKey = candidates.join('|')
  const [pick, setPick] = useState<PickState>(() => initPick({ candidates, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }, defaultSelected))
  const [rects, setRects] = useState<Record<Uid, R>>(() => measure(candidates, findElement))
  const [panelH, setPanelH] = useState(160)
  const [side, setSide] = useState<'top' | 'bottom'>('bottom')
  const [live, setLive] = useState('')
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hits = useRef<Map<Uid, HTMLButtonElement>>(new Map())
  const confirmRef = useRef<HTMLButtonElement>(null)
  const lastFocus = useRef<Element | null>(null)
  const pickRef = useRef(pick)
  pickRef.current = pick

  // reinizializza se cambia l'insieme dei candidati o i limiti
  const limitsKey = `${candKey}#${min ?? ''}#${max ?? ''}`
  const prevLimits = useRef(limitsKey)
  useEffect(() => {
    if (prevLimits.current === limitsKey) return
    prevLimits.current = limitsKey
    setPick(initPick({ candidates, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) }, defaultSelected))
  }, [limitsKey, candidates, min, max, defaultSelected])

  // posizione degli elementi: rilettura a ogni frame, setState solo se qualcosa si è mosso (scroll, ridimensionamento, animazioni)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const next = measure(pickRef.current.candidates, findElement)
      setRects((prev) => {
        const ks = Object.keys(next)
        return ks.length === Object.keys(prev).length && ks.every((k) => same(prev[k], next[k])) ? prev : next
      })
      setVp((p) => (p.w === window.innerWidth && p.h === window.innerHeight ? p : { w: window.innerWidth, h: window.innerHeight }))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [findElement, candKey])

  useLayoutEffect(() => {
    const h = panelRef.current?.offsetHeight
    if (h && h !== panelH) setPanelH(h)
  })

  // lato del pannello: quello che copre meno candidati (con isteresi: si cambia solo se il lato attuale ne copre)
  useEffect(() => {
    if (placement !== 'auto') return setSide(placement)
    if (!vp.h) return
    const M = 8
    const area = (s: 'top' | 'bottom') => {
      const y0 = s === 'top' ? M : vp.h - panelH - M
      let a = 0
      for (const r of Object.values(rects)) {
        const ox = Math.max(0, Math.min(r.x + r.w, vp.w - M) - Math.max(r.x, M))
        const oy = Math.max(0, Math.min(r.y + r.h, y0 + panelH) - Math.max(r.y, y0))
        a += ox * oy
      }
      return a
    }
    setSide((cur) => {
      const here = area(cur)
      if (here === 0) return cur
      const other = cur === 'top' ? 'bottom' : 'top'
      return area(other) < here ? other : cur
    })
  }, [rects, vp, panelH, placement])

  // focus: al primo candidato (o a Conferma); al termine ripristina
  useEffect(() => {
    lastFocus.current = document.activeElement
    const first = pickRef.current.candidates.map((u) => hits.current.get(u)).find(Boolean)
    ;(first ?? confirmRef.current)?.focus()
    return () => {
      if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus()
    }
  }, [])

  const apply = useCallback((uid: Uid) => {
    const r = togglePick(pickRef.current, uid)
    if (r.change === 'ignored') return
    if (r.change === 'full') {
      setLive(t('pick.full', { n: r.state.max }))
      return
    }
    setPick(r.state)
    onChange?.([...r.state.selected])
    const k = r.state.selected.indexOf(uid) + 1
    setLive(k ? t('pick.announceAdd', { k, n: r.state.max, name: name(uid) }) : t('pick.announceRemove', { name: name(uid) }))
    if (confirmOnPick && r.state.max === 1 && k) onConfirm([uid])
  }, [confirmOnPick, name, onChange, onConfirm, t])

  const confirm = () => {
    if (canConfirmPick(pickRef.current)) onConfirm([...pickRef.current.selected])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      confirm()
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      const s = undoPick(pickRef.current)
      if (s !== pickRef.current) {
        setPick(s)
        onChange?.([...s.selected])
      }
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      const cur = [...hits.current.entries()].find(([, el]) => el === document.activeElement)?.[0]
      const visible = pickRef.current.candidates.filter((u) => hits.current.has(u))
      if (!visible.length) return
      e.preventDefault()
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
      const next = stepCandidate({ ...pickRef.current, candidates: visible }, cur, dir)
      if (next) hits.current.get(next)?.focus()
    } else if (e.key === 'Tab') {
      // trappola del focus dentro l'overlay
      const f = [...(rootRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
      if (!f.length) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1
      e.preventDefault()
      f[n]?.focus()
    }
  }

  const counter = pickCounter(pick)
  const visible = pick.candidates.filter((u) => rects[u])
  const offField = pick.candidates.filter((u) => !rects[u])
  const titleText = counter.range ? t('pick.titleRange', { min: counter.min, n: counter.max, m: counter.total }) : t('pick.title', { n: counter.max, m: counter.total })
  const progress = counter.range && counter.chosen < counter.min ? t('pick.chosenMin', { c: counter.chosen, min: counter.min }) : t('pick.chosen', { c: counter.chosen, n: counter.max })
  const ok = canConfirmPick(pick)
  const holes = useMemo(() => visible.map((u) => ({ u, r: rects[u]! })), [visible, rects])
  const maskId = useMemo(() => `tpm-${Math.random().toString(36).slice(2, 8)}`, [])

  return createPortal(
    <div ref={rootRef} className="tpick" role="dialog" aria-modal="true" aria-label={title ?? t('pick.dialog')} onKeyDown={onKeyDown} data-testid="target-picker">
      <svg className="tpick-scrim" aria-hidden focusable="false">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="#fff" />
            {holes.map(({ u, r }) => <rect key={u} x={r.x - PAD} y={r.y - PAD} width={r.w + PAD * 2} height={r.h + PAD * 2} rx="8" fill="#000" />)}
          </mask>
        </defs>
        <rect width="100%" height="100%" mask={`url(#${maskId})`} className="tpick-scrim-fill" />
      </svg>

      {holes.map(({ u, r }) => {
        const k = pickOrder(pick, u)
        const hw = Math.max(r.w, MIN_HIT)
        const hh = Math.max(r.h, MIN_HIT)
        return (
          <div key={u}>
            <div
              className="tpick-ring"
              data-selected={k ? '' : undefined}
              style={{ left: r.x - PAD, top: r.y - PAD, width: r.w + PAD * 2, height: r.h + PAD * 2 }}
            >
              {k ? (
                <span className="tpick-num" aria-hidden>
                  {pick.max > 1 ? k : <GameIcon name="check" size={16} label={false} />}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className="tpick-hit"
              ref={(el) => { if (el) hits.current.set(u, el); else hits.current.delete(u) }}
              aria-pressed={!!k}
              aria-label={k ? t('pick.candSel', { name: name(u), k }) : t('pick.cand', { name: name(u) })}
              style={{ left: r.x + r.w / 2 - hw / 2, top: r.y + r.h / 2 - hh / 2, width: hw, height: hh }}
              onClick={() => apply(u)}
            />
          </div>
        )
      })}

      <div
        ref={panelRef}
        className="tpick-panel"
        data-side={side}
        style={side === 'top' ? { top: 'max(8px, env(safe-area-inset-top))' } : { bottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        {title ? <p className="tpick-title">{title}</p> : null}
        <div className="tpick-head">
          <p className="tpick-count">{titleText}</p>
          <p className="tpick-progress" data-testid="pick-progress">{progress}</p>
        </div>
        {offField.length > 0 ? (
          <div className="tpick-off" role="group" aria-label={t('pick.offField')}>
            <p className="tpick-off-label">{t('pick.offField')}</p>
            <div className="tpick-off-list">
              {offField.map((u) => {
                const k = pickOrder(pick, u)
                return (
                  <button
                    key={u}
                    type="button"
                    className="tpick-chip"
                    ref={(el) => { if (el) hits.current.set(u, el); else hits.current.delete(u) }}
                    aria-pressed={!!k}
                    data-selected={k ? '' : undefined}
                    onClick={() => apply(u)}
                  >
                    {k && pick.max > 1 ? <span className="tpick-chip-n" aria-hidden>{k}</span> : k ? <GameIcon name="check" size={16} label={false} /> : null}
                    <span>{name(u)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
        <p className="tpick-hint">{t('pick.hint')}</p>
        <div className="tpick-actions">
          <button type="button" className="tpick-btn" data-variant="secondary" onClick={onCancel}>{t('pick.cancel')}</button>
          <button type="button" ref={confirmRef} className="tpick-btn" data-variant="primary" disabled={!ok} onClick={confirm}>
            {t('pick.confirm')}
          </button>
        </div>
      </div>
      <div className="sr-only" aria-live="polite" role="status">{live}</div>
    </div>,
    document.body,
  )
}
