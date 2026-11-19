import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import CircleCheck from 'lucide-react/icons/circle-check'
import CircleX from 'lucide-react/icons/circle-x'
import Info from 'lucide-react/icons/info'
import X from 'lucide-react/icons/x'
import { cn } from './cn'

export type ToastTone = 'info' | 'ok' | 'danger'
export interface ToastItem {
  id: number
  title: string
  description?: string
  tone: ToastTone
  /** Azione opzionale (es. "Annulla"): chiude il toast dopo il clic. */
  action?: { label: string; onClick: () => void }
}

interface ToastState {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id' | 'tone'> & { tone?: ToastTone; durationMs?: number }) => number
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: ({ durationMs = 4000, tone = 'info', ...t }) => {
    const id = nextId++
    set((s) => ({ items: [...s.items.slice(-2), { ...t, tone, id }] }))
    if (durationMs > 0) setTimeout(() => get().dismiss(id), durationMs)
    return id
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}))

export const toast = (
  title: string,
  opts?: { description?: string; tone?: ToastTone; durationMs?: number; action?: { label: string; onClick: () => void } },
) =>
  useToasts.getState().push({ title, ...opts })

const icons = { info: Info, ok: CircleCheck, danger: CircleX }
const colors = { info: 'text-accent-text', ok: 'text-ok', danger: 'text-danger' }

/** Da montare una sola volta. Sopra la barra inferiore sul telefono, in basso a destra altrove. */
export function ToastViewport() {
  const { t } = useTranslation()
  const items = useToasts((s) => s.items)
  const dismiss = useToasts((s) => s.dismiss)
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={t('common.notifications')}
      className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottomnav-h)+16px+env(safe-area-inset-bottom,0px))] z-[80] flex flex-col items-stretch gap-2 md:inset-x-auto md:bottom-4 md:right-4 md:w-96"
    >
      {items.map((it) => {
        const Icon = icons[it.tone]
        return (
          <div
            key={it.id}
            className="anim-toast pointer-events-auto flex items-start gap-3 rounded-md border border-line bg-surface-3 p-3 pl-4 shadow-3"
          >
            <Icon aria-hidden size={20} className={cn('mt-0.5 shrink-0', colors[it.tone])} />
            <div className="min-w-0 flex-1 py-0.5">
              <p className="text-[15px] font-medium text-fg">{it.title}</p>
              {it.description ? <p className="text-sm text-muted">{it.description}</p> : null}
            </div>
            {it.action ? (
              <button
                type="button"
                onClick={() => {
                  it.action?.onClick()
                  dismiss(it.id)
                }}
                className="-my-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-md px-3 text-[15px] font-semibold text-accent-text hover:bg-surface-2"
              >
                {it.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label={t('common.dismiss')}
              onClick={() => dismiss(it.id)}
              className="-my-1 -mr-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:text-fg"
            >
              <X aria-hidden size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
