/** Navigazione del replay per combo lunghe: barra a segmenti, elenco passi raggruppato (fasi, catene), ricerca, salto e selettore. */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Flag from 'lucide-react/icons/flag'
import Link2 from 'lucide-react/icons/link-2'
import ListTree from 'lucide-react/icons/list-tree'
import Shuffle from 'lucide-react/icons/shuffle'
import { normalizeName } from '@/domain/deck/cardIndex'
import { matchSteps, pickLoc } from '@/features/guide/guideModel'
import { noteToPlain, parseNote } from '@/features/guide/notes'
import { headlineText, stepHeadline } from '@/features/guide/stepText'
import { BottomSheet } from '@/ui/BottomSheet'
import { cn } from '@/ui/cn'
import { Dialog } from '@/ui/Dialog'
import { IconButton } from '@/ui/IconButton'
import { inputBase } from '@/ui/Input'
import { SearchField } from '@/ui/SearchField'
import type { Names } from './ReplayParts'
import { chipLabel } from './ReplayParts'
import type { Frame, FrameBlock, FrameSection } from './replayModel'
import { prefersReducedMotion } from './useFlip'

/* ------------------------------------------------------------------ barra a segmenti */
const TRACK: Record<FrameBlock['kind'], string> = { steps: 'bg-line-strong/50', chain: 'bg-warn/30', group: 'bg-accent-text/30' }
const FILL: Record<FrameBlock['kind'], string> = { steps: 'bg-accent', chain: 'bg-warn', group: 'bg-accent-text' }

/** Barra "scrubber": un segmento per blocco (larghezza proporzionale ai passi). Un solo controllo (slider) alto 44 px: tocco o trascinamento per spostarsi. */
export function SegmentBar({ sections, index, last, valueText, onSeek }: { sections: FrameSection[]; index: number; last: number; valueText: string; onSeek: (i: number) => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef(false)
  const lastSeek = useRef(-1)
  const blocks = useMemo(() => sections.flatMap((s) => s.blocks.map((b) => ({ ...b, branch: s.branch }))), [sections])
  const seekAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const i = Math.round(Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * last)
    if (i !== lastSeek.current) {
      lastSeek.current = i
      onSeek(i)
    }
  }
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('replay.seek')}
      aria-valuemin={0}
      aria-valuemax={last}
      aria-valuenow={index}
      aria-valuetext={valueText}
      data-testid="replay-seek"
      className="relative flex h-11 min-w-0 flex-1 cursor-pointer touch-none select-none items-center rounded-md"
      onPointerDown={(e) => {
        drag.current = true
        lastSeek.current = -1
        e.currentTarget.setPointerCapture(e.pointerId)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => drag.current && seekAt(e.clientX)}
      onPointerUp={() => (drag.current = false)}
      onPointerCancel={() => (drag.current = false)}
    >
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {blocks.map((b) => {
          const n = b.to - b.from + 1
          const pct = Math.min(Math.max((index - b.from + 1) / n, 0), 1) * 100
          return (
            <div
              key={b.from}
              data-seg={b.from}
              style={{ flexGrow: n, flexBasis: 0 }}
              className={cn('relative min-w-0 after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:bg-surface-1 last:after:hidden', TRACK[b.kind], b.branch && 'opacity-80')}
            >
              <div className={cn('absolute inset-y-0 left-0', FILL[b.kind])} style={{ width: `${pct}%` }} />
            </div>
          )
        })}
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-1 bg-fg shadow-1"
        style={{ left: `${last > 0 ? (index / last) * 100 : 0}%` }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ ricerca + vai al passo */
export function StepNavBar({
  query,
  onQuery,
  total,
  onJump,
  jumpRef,
  autoFocusJump,
}: {
  query: string
  onQuery: (q: string) => void
  total: number
  onJump: (n: number) => void
  jumpRef?: React.RefObject<HTMLInputElement | null>
  autoFocusJump?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2" data-testid="replay-navbar">
      <SearchField className="min-w-0 flex-1" value={query} onValueChange={onQuery} label={t('replay.picker.search')} placeholder={t('replay.picker.searchPlaceholder')} data-testid="replay-search" />
      <form
        className="w-[4.75rem] shrink-0"
        onSubmit={(e) => {
          e.preventDefault()
          const input = e.currentTarget.elements.namedItem('n') as HTMLInputElement
          const n = Number(input.value)
          if (Number.isInteger(n) && n >= 1) onJump(Math.min(n, total))
        }}
      >
        <input
          ref={jumpRef}
          name="n"
          type="number"
          inputMode="numeric"
          enterKeyHint="go"
          min={1}
          max={total}
          autoFocus={autoFocusJump}
          aria-label={t('replay.picker.jump')}
          placeholder={t('replay.picker.jumpPlaceholder')}
          data-testid="replay-jump"
          className={cn(inputBase, 'px-2 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
        />
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ elenco passi raggruppato */
const Row = memo(function Row({ i, cur, text, frame, onSeek }: { i: number; cur: boolean; text: string; frame: Frame; onSeek: (i: number) => void }) {
  const branch = frame.inBranch
  return (
    <button
      type="button"
      data-frame={i}
      aria-current={cur ? 'step' : undefined}
      onClick={() => onSeek(i)}
      className={cn(
        'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border px-2 py-1.5 text-left text-[15px] leading-5 transition-colors duration-150',
        cur ? 'border-accent-text bg-accent-soft text-fg' : 'border-transparent text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
          cur ? 'bg-accent text-accent-fg' : branch ? 'border border-warn text-warn' : 'border border-line-strong text-muted',
        )}
      >
        {i === 0 ? <Flag size={14} /> : chipLabel(frame)}
      </span>
      <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{text}</span>
    </button>
  )
})

export function FrameList({
  frames,
  sections,
  index,
  names,
  query,
  playing,
  onSeek,
  className,
}: {
  frames: Frame[]
  sections: FrameSection[]
  index: number
  names: Names
  query: string
  playing?: boolean
  onSeek: (i: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const texts = useMemo(() => frames.map((f) => (f.step ? headlineText(stepHeadline(f.step, t, names.nameOfUid)) : t('replay.picker.start'))), [frames, t, names.nameOfUid])
  const searching = query.trim() !== ''
  const matches = useMemo(() => {
    if (!searching) return null
    // fotogramma 0 (partenza) escluso: i numeri trovati coincidono con gli indici dei fotogrammi
    const hay = frames.slice(1).map((f, k) => {
      const note = f.step ? pickLoc(f.step.note, names.lang) : undefined
      return normalizeName(`${texts[k + 1]} ${note ? noteToPlain(parseNote(note, names.resolver), names.nameOf) : ''}`)
    })
    return matchSteps(hay, query, normalizeName)
  }, [searching, frames, texts, query, names, t])

  // scroll automatico al passo attivo (solo se esce dalla fascia centrale; istantaneo mentre gira o per salti lunghi)
  useEffect(() => {
    const c = box.current
    if (!c) return
    const center = (): boolean => {
      const el = c.querySelector<HTMLElement>('[aria-current="step"]')
      if (!el) return false
      const cr = c.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      const margin = cr.height * 0.2
      if (er.top >= cr.top + margin && er.bottom <= cr.bottom - margin) return false
      const delta = er.top - cr.top - (cr.height / 2 - er.height / 2)
      const smooth = !playing && !prefersReducedMotion() && Math.abs(delta) < cr.height
      c.scrollTo({ top: c.scrollTop + delta, behavior: smooth ? 'smooth' : 'auto' })
      return smooth
    }
    const smooth = center()
    const h = smooth ? 0 : requestAnimationFrame(() => center())
    return () => cancelAnimationFrame(h)
  }, [index, playing, matches])

  const row = (i: number) => <Row key={i} i={i} cur={i === index} text={texts[i]!} frame={frames[i]!} onSeek={onSeek} />
  const body = () => {
    if (matches) {
      const hit = [...matches]
      if (!hit.length) return <p className="px-2 py-3 text-sm text-muted">{t('replay.picker.none', { q: query.trim() })}</p>
      return <div className="flex flex-col gap-1">{hit.map((k) => row(k))}</div>
    }
    return (
      <div className="flex flex-col gap-1">
        {row(0)}
        {sections.map((sec) => (
          <section key={sec.id} className="flex flex-col gap-1" data-section={sec.id}>
            <h3 className="px-2 pb-0.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {sec.branch ? t('replay.picker.branch') : sec.phase ? t(`guide.phase.${sec.phase}`) : t('guide.nav.chunk', { from: sec.from, to: sec.to })}
            </h3>
            {sec.blocks.map((b) => {
              const rows = Array.from({ length: b.to - b.from + 1 }, (_, k) => row(b.from + k))
              if (b.kind === 'steps') return <div key={b.from} className="flex flex-col gap-1">{rows}</div>
              const chain = b.kind === 'chain'
              return (
                <div key={b.from} className={cn('flex flex-col gap-1 border-l-2 pl-1.5', chain ? 'border-warn' : 'border-dashed border-accent-text')}>
                  <p className={cn('flex min-h-6 items-center gap-1.5 px-1 text-xs font-medium', chain ? 'text-warn' : 'text-accent-text')}>
                    {chain ? <Link2 aria-hidden size={14} /> : <Shuffle aria-hidden size={14} />}
                    {chain ? ((b.links ?? 0) > 0 ? t('replay.picker.chain', { count: b.links }) : t('replay.picker.chainResolve')) : t('replay.picker.free')}
                  </p>
                  {rows}
                </div>
              )
            })}
          </section>
        ))}
      </div>
    )
  }
  return (
    <div ref={box} data-testid="replay-steplist" aria-label={t('replay.timeline')} className={cn('relative min-h-0 overflow-y-auto overscroll-contain pr-1', className)}>
      {body()}
    </div>
  )
}

/* ------------------------------------------------------------------ selettore (telefono e G) */
export function PickerButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <IconButton variant="secondary" label={label} icon={<ListTree size={20} />} onClick={onClick} data-testid="replay-picker-open" />
}

export function StepPicker({
  open,
  onOpenChange,
  wide,
  frames,
  sections,
  index,
  names,
  onSeek,
  focusJump,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  wide: boolean
  frames: Frame[]
  sections: FrameSection[]
  index: number
  names: Names
  onSeek: (i: number) => void
  focusJump: boolean
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])
  const pick = useCallback(
    (i: number) => {
      onSeek(i)
      onOpenChange(false)
    },
    [onSeek, onOpenChange],
  )
  const content = (
    <div className="flex min-h-0 flex-col gap-3" data-testid="replay-picker">
      <StepNavBar query={query} onQuery={setQuery} total={frames.length - 1} onJump={pick} autoFocusJump={focusJump} />
      <FrameList frames={frames} sections={sections} index={index} names={names} query={query} onSeek={pick} className="max-h-[min(58dvh,30rem)]" />
    </div>
  )
  return wide ? (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('replay.picker.title')} className="max-w-xl">
      {content}
    </Dialog>
  ) : (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('replay.picker.title')}>
      {content}
    </BottomSheet>
  )
}
