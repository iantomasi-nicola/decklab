/**
 * Fascia (vassoio) compatta in flusso sotto il campo, per le carte che NON sono sul campo (Extra Deck, Cimitero, Bandite, Deck, materiali)
 * o per scegliere una carta da una pila. Il campo resta visibile e si ridimensiona; la fascia si ridimensiona a sua volta (trascina la
 * maniglia o usa Ingrandisci). Tocco = scegli, pressione lunga = scheda della carta.
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import Maximize2 from 'lucide-react/icons/maximize-2'
import Minimize2 from 'lucide-react/icons/minimize-2'
import X from 'lucide-react/icons/x'
import { CardFace } from '@/features/combos/CardFace'
import { useFpT } from './strings'
import './fieldpick.css'

export interface BandItem {
  key: string
  code: number
  name: string
  /** cand = evidenziata e scegliibile; chosen = già scelta; dim = non scegliibile; plain = nessuno stato */
  state: 'cand' | 'chosen' | 'dim' | 'plain'
  order?: number | undefined
  /** valore mostrato in basso a sinistra (tributo ×2, livello) */
  badge?: string | undefined
}

const MIN_H = 176
const KEY = 'combolab.band.h'
const readH = (): number => {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v >= MIN_H ? v : MIN_H
  } catch { return MIN_H }
}
const maxH = () => Math.max(MIN_H, Math.round((typeof window === 'undefined' ? 800 : window.innerHeight) * 0.5))

export function PickBand({ title, sub, items, onTap, onLongPress, onAlt, onClose, searchable, children, testId = 'pick-band', empty }: {
  title: string
  sub?: string | undefined
  items: readonly BandItem[]
  onTap: (key: string, el: HTMLElement) => void
  onLongPress?: ((key: string) => void) | undefined
  /** alternativa da tastiera (Maiusc+Invio o M) */
  onAlt?: ((key: string) => void) | undefined
  onClose?: (() => void) | undefined
  searchable?: boolean | undefined
  children?: ReactNode
  testId?: string
  empty?: string | undefined
}) {
  const { t } = useFpT()
  const [h, setH] = useState(readH)
  const [q, setQ] = useState('')
  const drag = useRef<{ y: number; h: number } | null>(null)
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longFired = useRef(false)
  const listRef = useRef<HTMLUListElement>(null)
  const save = (v: number) => { try { localStorage.setItem(KEY, String(v)) } catch { /* storage non disponibile */ } }
  const clamp = (v: number) => Math.max(MIN_H, Math.min(maxH(), Math.round(v)))
  const wrap = h >= MIN_H + 72
  const needle = q.trim().toLowerCase()
  const shown = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items

  const onGripDown = (e: RPointerEvent) => {
    drag.current = { y: e.clientY, h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onGripMove = (e: RPointerEvent) => {
    if (drag.current) setH(clamp(drag.current.h + (drag.current.y - e.clientY)))
  }
  const onGripUp = () => {
    if (drag.current) save(h)
    drag.current = null
  }
  useEffect(() => () => { if (longTimer.current) clearTimeout(longTimer.current) }, [])

  const down = (key: string) => {
    longFired.current = false
    if (!onLongPress) return
    if (longTimer.current) clearTimeout(longTimer.current)
    longTimer.current = setTimeout(() => { longFired.current = true; onLongPress(key) }, 450)
  }
  const cancelLong = () => { if (longTimer.current) clearTimeout(longTimer.current); longTimer.current = null }
  const toggleSize = () => { const v = wrap ? MIN_H : clamp(Math.round(window.innerHeight * 0.4)); setH(v); save(v) }

  return (
    <section className="fp-band" style={{ height: h }} aria-label={title} data-testid={testId} data-wrap={wrap || undefined}>
      <div
        className="fp-grip" role="separator" aria-orientation="horizontal" aria-label={t('band.resize')} aria-valuemin={MIN_H} aria-valuemax={maxH()} aria-valuenow={h} tabIndex={0}
        onPointerDown={onGripDown} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={onGripUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const v = clamp(h + (e.key === 'ArrowUp' ? 24 : -24)); setH(v); save(v) }
        }}
      />
      <header className="fp-band-head">
        <h2 className="fp-band-title">{title}{sub ? <> <span className="fp-band-sub">· {sub}</span></> : null}</h2>
        {searchable ? <input className="fp-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('band.search')} aria-label={t('band.search')} /> : null}
        <button type="button" className="fp-icon" onClick={toggleSize} aria-label={wrap ? t('band.shrink') : t('band.expand')} title={wrap ? t('band.shrink') : t('band.expand')} data-testid="band-size">
          {wrap ? <Minimize2 aria-hidden size={20} /> : <Maximize2 aria-hidden size={20} />}
        </button>
        {onClose ? (
          <button type="button" className="fp-icon" onClick={onClose} aria-label={t('band.close')} title={t('band.close')} data-testid="band-close"><X aria-hidden size={22} /></button>
        ) : null}
      </header>
      {children}
      {shown.length === 0 ? (
        <p className="fp-empty">{empty ?? t('band.empty')}</p>
      ) : (
        <ul
          ref={listRef} className="fp-list" data-wrap={wrap || undefined} data-testid="band-list"
          onWheel={(e) => { const el = listRef.current; if (el && !wrap && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY }}
        >
          {shown.map((it) => (
            <li key={it.key} className="fp-item">
              <button
                type="button" className="fp-tile" data-state={it.state} data-testid={`band-${it.key}`} aria-pressed={it.state === 'chosen'} aria-label={it.name}
                onPointerDown={() => down(it.key)} onPointerUp={cancelLong} onPointerLeave={cancelLong} onPointerCancel={cancelLong}
                onContextMenu={(e) => { e.preventDefault(); onLongPress?.(it.key) }}
                onKeyDown={(e) => { if (onAlt && ((e.key === 'Enter' && e.shiftKey) || e.key === 'm' || e.key === 'M')) { e.preventDefault(); onAlt(it.key) } }}
                onClick={(e) => { if (longFired.current) { longFired.current = false; return } onTap(it.key, e.currentTarget) }}
              >
                <CardFace code={it.code} name={it.name} />
                {it.order ? <span className="fp-num" aria-hidden>{it.order}</span> : null}
                {it.badge ? <span className="fp-val" aria-hidden>{it.badge}</span> : null}
              </button>
              <span className="fp-name">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
