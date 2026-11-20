import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/ui/cn'

export interface PopItem {
  id: string
  label: string
  icon?: ReactNode
  hint?: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

/** Menu al punto di rilascio / del clic destro. Frecce per scegliere, Invio per confermare, Esc o clic fuori per chiudere. */
export interface PopAnchor { left: number; right: number; top: number; bottom: number }

/** Con `anchor` (rettangolo della carta) il menu sta attaccato alla carta: sotto se c'è posto, altrimenti sopra; non la copre mai. */
export function PopMenu({ x, y, items, title, onClose, anchor }: { x: number; y: number; items: PopItem[]; title?: string; onClose: () => void; anchor?: PopAnchor | undefined }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const m = 8
    if (anchor) {
      const cx = (anchor.left + anchor.right) / 2
      const below = anchor.bottom + 6
      const top = below + r.height <= window.innerHeight - m ? below : anchor.top - r.height - 6
      setPos({ left: Math.max(m, Math.min(cx - r.width / 2, window.innerWidth - r.width - m)), top: Math.max(m, top) })
    } else {
      setPos({
        left: Math.max(m, Math.min(x - r.width / 2, window.innerWidth - r.width - m)),
        top: Math.max(m, Math.min(y + 8, window.innerHeight - r.height - m)),
      })
    }
    el.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus()
  }, [x, y, items.length])

  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    // il rilascio che ha aperto il menu non deve chiuderlo subito
    const t = setTimeout(() => document.addEventListener('pointerdown', away, true), 0)
    document.addEventListener('keydown', key, true)
    return () => {
      clearTimeout(t)
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    const n = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length
    els[n]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      data-pop-menu
      onKeyDown={onKey}
      className="anim-pop fixed z-[65] min-w-52 max-w-[calc(100vw-16px)] rounded-md border border-line bg-surface-1 p-1 shadow-2"
      style={{ left: pos.left, top: pos.top }}
    >
      {title ? <div className="px-3 pb-1 pt-2 text-sm font-medium text-muted">{title}</div> : null}
      {items.map((it) => (
        <button
          key={it.id}
          role="menuitem"
          type="button"
          disabled={it.disabled}
          data-action={it.id}
          onClick={() => {
            onClose()
            it.onSelect()
          }}
          className={cn(
            'flex min-h-11 w-full cursor-pointer select-none items-center gap-3 rounded-sm px-3 text-left text-[15px] text-fg outline-none hover:bg-surface-3 focus-visible:bg-surface-3 disabled:pointer-events-none disabled:opacity-50',
            it.danger && 'text-danger',
          )}
        >
          {it.icon ? <span aria-hidden className="inline-flex text-muted">{it.icon}</span> : null}
          <span className="flex-1">{it.label}</span>
          {it.hint ? <span className="text-sm text-subtle">{it.hint}</span> : null}
        </button>
      ))}
    </div>,
    document.body,
  )
}
