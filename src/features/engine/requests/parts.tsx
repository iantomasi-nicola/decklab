/** Pezzi comuni dei pannelli di richiesta: guscio (bottom sheet su telefono, scheda in basso su tablet/PC), pulsanti, riga effetto, tasti. */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import type { CardRef, DescRef } from '@/engine/requests'
import { CardFace } from '@/features/combos/CardFace'
import { useCards } from '@/features/combos/useCards'
import { cn } from '@/ui/cn'
import { EffectBadge, type BadgeKind } from '@/ui/gameIcons'
import '../engine.css'
import { useEngT, type EngT } from '../strings'

export interface SheetProps {
  title: string
  /** riga secondaria sotto il titolo */
  subtitle?: ReactNode
  /** a destra del titolo (contatore) */
  aside?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Esc / tocco sullo sfondo */
  onCancel?: (() => void) | undefined
  wide?: boolean
  /** niente scuro dietro: serve per scegliere sul campo (la scelta resta visibile) */
  bare?: boolean
  testId?: string
}

export function Sheet({ title, subtitle, aside, children, footer, onCancel, wide, bare, testId }: SheetProps) {
  const id = useId()
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // il focus va al primo controllo utile (il primario del piede, altrimenti la prima riga)
    const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], .eng-foot [data-primary="true"]:not(:disabled), .eng-row, .eng-foot button:not(:disabled)')
    el?.focus({ preventScroll: true })
    return () => prev?.focus?.({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (!onCancel) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCancel])
  return (
    <div className="eng-wrap" data-engine-sheet>
      <div className="eng-scrim" data-open={!bare} onPointerDown={bare ? undefined : () => onCancel?.()} aria-hidden />
      <section ref={ref} role="dialog" aria-modal={!bare} aria-labelledby={id} className="eng-sheet" data-wide={wide || undefined} data-testid={testId}>
        <div aria-hidden className="eng-grip md:hidden" />
        <header className="eng-head">
          <div className="min-w-0">
            <h2 id={id} className="text-base font-semibold leading-6 text-fg">{title}</h2>
            {subtitle ? <p className="text-sm leading-5 text-muted">{subtitle}</p> : null}
          </div>
          {aside ? <div className="shrink-0 pt-0.5">{aside}</div> : null}
        </header>
        {children ? <div className="eng-body">{children}</div> : null}
        {footer ? <footer className="eng-foot">{footer}</footer> : null}
      </section>
    </div>
  )
}

export function EngBtn({ primary, tone, children, className, ...rest }: React.ComponentProps<'button'> & { primary?: boolean; tone?: 'danger' }) {
  return (
    <button type="button" data-primary={primary || undefined} data-tone={tone} className={cn('eng-btn', className)} {...rest}>
      {children}
    </button>
  )
}

/** Scorciatoie da tastiera della richiesta (ignora i campi di testo, tranne Esc). */
export function useRequestKeys(map: { enter?: () => void; escape?: () => void; digit?: (n: number) => void; y?: () => void; n?: () => void }) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const m = ref.current
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (e.altKey || e.metaKey) return
      if (e.key === 'Enter' && !typing && (e.ctrlKey || el?.tagName !== 'BUTTON') && m.enter) {
        e.preventDefault()
        m.enter()
      } else if (e.key === 'Escape' && m.escape) {
        e.preventDefault()
        m.escape()
      } else if (!typing && !e.ctrlKey && /^[1-9]$/.test(e.key) && m.digit) {
        m.digit(Number(e.key))
      } else if (!typing && !e.ctrlKey && (e.key === 'y' || e.key === 'Y') && m.y) m.y()
      else if (!typing && !e.ctrlKey && (e.key === 'n' || e.key === 'N') && m.n) m.n()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
}

/** Testo di un effetto dal riferimento del core (le stringhe di carta del cdb non sono nel dataset: "Effetto n di <carta>"). */
export function descLabel(desc: DescRef | null | undefined, nameOf: (code: number) => string, t: EngT, fallback?: string): string {
  if (!desc) return fallback ?? ''
  if (desc.kind === 'card') return t('sel.effectOf', { n: desc.index + 1, name: nameOf(desc.code) })
  return fallback ?? t('sel.system', { n: desc.id })
}

export function effectKindOf(desc: DescRef | null | undefined, place: CardRef['place'], inChain: boolean): BadgeKind {
  void desc
  if (inChain) return 'quick'
  return place.loc === 'hand' || place.loc === 'gy' || place.loc === 'banished' ? 'activation' : 'ignition'
}

/** Carta con nome per i pannelli (immagine + riga nome). */
export function CardBox({ code, name, width = 56, pos }: { code: number; name: string; width?: number; pos?: CardRef['place']['pos'] }) {
  return (
    <div style={{ width }} className="shrink-0">
      <CardFace code={code} name={name} pos={pos} />
    </div>
  )
}

export function useNames() {
  const cards = useCards()
  const { t, lang } = useEngT()
  return { nameOf: cards.nameOf, t, lang, cards }
}

export function EffectBadgeFor({ kind, index }: { kind: BadgeKind; index?: number }) {
  return <EffectBadge kind={kind} size="sm" {...(index !== undefined ? { index } : {})} />
}
