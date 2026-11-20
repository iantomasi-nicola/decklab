/**
 * Scelta guidata della mano di partenza (unica per creazione, scheda Configurazione e pannello Avvia).
 * Lavora solo su passcode: chi la usa decide come salvarli (`setHand` del modello).
 * Un tocco su una carta del mazzo la aggiunge; un tocco su una carta della mano la toglie.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ChevronDown from 'lucide-react/icons/chevron-down'
import ChevronUp from 'lucide-react/icons/chevron-up'
import Dice5 from 'lucide-react/icons/dice-5'
import Eraser from 'lucide-react/icons/eraser'
import Minus from 'lucide-react/icons/minus'
import Plus from 'lucide-react/icons/plus'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'
import { CardFace } from './CardFace'
import { MAX_HAND, type HandMode } from './model'
import { useCards } from './useCards'

export interface HandValue {
  codes: number[]
  mode: HandMode
  size: number
}

export interface HandPickerProps {
  /** main deck della variante (con le copie) */
  deck: readonly number[]
  value: HandValue
  onChange: (next: HandValue) => void
  /** carte che il motore pescherà a caso con il mescolamento attuale (anteprima nel pannello Avvia) */
  drawn?: readonly number[] | undefined
  /** nuovo mescolamento (solo dove c'è un seme: pannello Avvia) */
  onReshuffle?: (() => void) | undefined
  /** avvisi già calcolati (carta non nel mazzo, mano vuota…) */
  issues?: ReactNode
  /** lista del mazzo aperta all'inizio */
  defaultOpen?: boolean
  className?: string
}

export function HandPicker({ deck, value, onChange, drawn, onReshuffle, issues, defaultOpen = true, className }: HandPickerProps) {
  const { t } = useTranslation()
  const { nameOf } = useCards()
  const [open, setOpen] = useState(defaultOpen)
  const [q, setQ] = useState('')
  const stash = useRef<number[]>([])
  const { codes, mode, size } = value
  const cap = mode === 'exact' ? MAX_HAND : Math.max(size, 1)
  const full = codes.length >= cap

  const tiles = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of deck) m.set(c, (m.get(c) ?? 0) + 1)
    return [...m]
  }, [deck])
  const chosen = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of codes) m.set(c, (m.get(c) ?? 0) + 1)
    return m
  }, [codes])
  const needle = q.trim().toLowerCase()
  const shown = needle ? tiles.filter(([c]) => nameOf(c).toLowerCase().includes(needle)) : tiles

  const set = (patch: Partial<HandValue>) => onChange({ ...value, ...patch })
  const setMode = (m: HandMode) => {
    if (m === mode) return
    if (m === 'random') {
      stash.current = codes
      set({ mode: m, codes: [] })
    } else set({ mode: m, codes: codes.length === 0 ? stash.current.slice(0, m === 'exact' ? MAX_HAND : size) : codes })
  }
  const add = (code: number) => {
    const n = chosen.get(code) ?? 0
    const max = tiles.find(([c]) => c === code)?.[1] ?? 0
    if (n >= max) {
      // tutte le copie sono in mano: un altro tocco ne toglie una (con una sola copia è un interruttore)
      const i = codes.lastIndexOf(code)
      if (i >= 0) set({ codes: codes.filter((_, k) => k !== i) })
      return
    }
    if (full) return
    set({ codes: [...codes, code], mode: mode === 'random' ? 'mixed' : mode })
  }
  const remove = (i: number) => set({ codes: codes.filter((_, k) => k !== i) })

  const nRandom = mode === 'exact' ? 0 : Math.max(0, size - codes.length)
  const summary =
    mode === 'exact'
      ? t('combos.hand.sum.exact', { count: codes.length })
      : mode === 'mixed'
        ? t('combos.hand.sum.mixed', { n: codes.length, f: nRandom, size: Math.max(size, codes.length) })
        : t('combos.hand.sum.random', { size })

  // carte a caso mostrate come anteprima (solo quelle in più delle scelte)
  const preview = mode === 'exact' ? [] : (drawn ?? []).slice(0, nRandom)
  const placeholders = mode === 'exact' ? 0 : Math.max(0, nRandom - preview.length)
  const slot = 'relative min-w-0 max-w-16 flex-1 basis-0'

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)} data-testid="hand-picker">
      <Segmented<HandMode>
        label={t('combos.hand.mode')}
        fill
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 'exact', label: t('combos.hand.exact') },
          { value: 'mixed', label: t('combos.hand.mixed') },
          { value: 'random', label: t('combos.hand.random') },
        ]}
      />
      <p className="text-sm text-muted">{t(`combos.hand.desc.${mode}`)}</p>

      <ul className="flex min-h-[5.5rem] items-start gap-2" aria-label={t('combos.hand.slots')} data-testid="hand-slots">
        {codes.map((c, i) => (
          <li key={`${c}-${i}`} className={slot}>
            <button
              type="button"
              aria-label={t('combos.hand.remove', { name: nameOf(c) })}
              data-hand-card={c}
              onClick={() => remove(i)}
              className="relative block w-full cursor-pointer rounded-[8px] ring-2 ring-accent-text outline-offset-2 transition-transform duration-150 active:scale-95"
            >
              <CardFace code={c} name={nameOf(c)} />
            </button>
          </li>
        ))}
        {preview.map((c, i) => (
          <li key={`d${c}-${i}`} className={slot} data-hand-drawn={c}>
            <div className="relative rounded-[8px] opacity-80 outline-dashed outline-2 -outline-offset-2 outline-line-strong" aria-label={t('combos.hand.drawn', { name: nameOf(c) })} role="img">
              <CardFace code={c} name={nameOf(c)} />
              <span aria-hidden className="absolute left-1 top-1 grid size-5 place-items-center rounded-full bg-surface-1 text-muted shadow-1">
                <Dice5 size={13} />
              </span>
            </div>
          </li>
        ))}
        {Array.from({ length: placeholders }, (_, i) => (
          <li key={`p${i}`} className={slot}>
            <div aria-label={t('combos.hand.randomSlot')} role="img" className="grid w-full place-items-center rounded-[8px] border-2 border-dashed border-line-strong text-muted" style={{ aspectRatio: '59 / 86' }}>
              <Dice5 aria-hidden size={18} />
            </div>
          </li>
        ))}
        {codes.length + preview.length + placeholders === 0 ? <li className="flex min-h-[5.5rem] flex-1 items-center text-sm text-muted">{t('combos.hand.empty')}</li> : null}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        {mode !== 'exact' ? (
          <div className="flex items-center gap-1" role="group" aria-label={t('combos.hand.size')}>
            <button type="button" className="grid size-11 cursor-pointer place-items-center rounded-md border border-line-strong bg-surface-2 hover:bg-surface-3 disabled:cursor-default disabled:opacity-40" aria-label={`${t('combos.hand.size')} −`} disabled={size <= Math.max(1, codes.length)} onClick={() => set({ size: size - 1 })}>
              <Minus aria-hidden size={18} />
            </button>
            <p className="min-w-[7.5rem] text-center text-[15px] font-semibold tabular-nums" data-testid="hand-size">{t('combos.hand.size')}: {size}</p>
            <button type="button" className="grid size-11 cursor-pointer place-items-center rounded-md border border-line-strong bg-surface-2 hover:bg-surface-3 disabled:cursor-default disabled:opacity-40" aria-label={`${t('combos.hand.size')} +`} disabled={size >= MAX_HAND} onClick={() => set({ size: size + 1 })}>
              <Plus aria-hidden size={18} />
            </button>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {codes.length > 0 ? (
            <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-[15px] font-medium hover:bg-surface-3" onClick={() => set({ codes: [] })} data-testid="hand-clear">
              <Eraser aria-hidden size={18} />
              {t('combos.hand.clear')}
            </button>
          ) : null}
          {onReshuffle && mode !== 'exact' ? (
            <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 px-3 text-[15px] font-medium hover:bg-surface-3" onClick={onReshuffle} data-testid="reshuffle">
              <Dice5 aria-hidden size={18} />
              {t('combos.hand.reshuffle')}
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-[15px] font-medium" data-testid="hand-summary" role="status">{summary}</p>
      {issues}

      {tiles.length === 0 ? (
        <p className="flex items-start gap-2 text-sm text-muted"><TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0 text-warn" />{t('combos.hand.noDeck')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-3 text-[15px] font-medium hover:bg-surface-3"
            data-testid="hand-pick-toggle"
          >
            <span>{t('combos.hand.pick')}</span>
            {open ? <ChevronUp aria-hidden size={18} /> : <ChevronDown aria-hidden size={18} />}
          </button>
          {open ? (
            <>
              {tiles.length > 12 ? <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('combos.hand.filter')} aria-label={t('combos.hand.filter')} /> : null}
              {full && mode !== 'exact' ? <p className="text-sm text-muted" data-testid="hand-full">{t('combos.hand.full')}</p> : null}
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2" data-testid="hand-deck" aria-label={t('combos.hand.pick')}>
                {shown.map(([c, max]) => {
                  const n = chosen.get(c) ?? 0
                  const blocked = full && n === 0
                  return (
                    <li key={c} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={n > 0}
                        aria-disabled={blocked}
                        aria-label={t('combos.hand.tile', { name: nameOf(c), n, max })}
                        data-deck-card={c}
                        onClick={() => !blocked && add(c)}
                        className={cn('relative block w-full cursor-pointer rounded-[8px] outline-offset-2 transition-opacity duration-150 hover:ring-2 hover:ring-accent-text', n > 0 && 'ring-2 ring-accent-text', blocked && 'cursor-default opacity-40')}
                      >
                        <CardFace code={c} name={nameOf(c)} />
                        {max > 1 || n > 0 ? (
                          <span className={cn('absolute right-1 top-1 rounded-full border px-1.5 text-xs font-semibold tabular-nums', n > 0 ? 'border-accent-text bg-accent text-accent-fg' : 'border-line-strong bg-surface-1 text-fg')}>
                            {n > 0 ? `${n}/${max}` : `×${max}`}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {shown.length === 0 ? <p className="py-3 text-center text-sm text-muted">{t('combos.pileSheet.empty')}</p> : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Avvisi della mano (carta non nel mazzo, mano vuota…) in forma compatta. */
export function HandIssueList({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-1" data-testid="hand-issues" role="alert">
      {items.map((m) => (
        <li key={m} className="flex items-start gap-2 text-sm text-fg">
          <TriangleAlert aria-hidden size={18} className="mt-0.5 shrink-0 text-warn" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{m}</span>
        </li>
      ))}
    </ul>
  )
}
