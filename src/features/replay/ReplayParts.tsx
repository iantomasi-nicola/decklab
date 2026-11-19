/** Parti del replay: descrizione del passo, timeline a chip, elenco passi (pannello laterale), barra di controllo. */
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ChevronDown from 'lucide-react/icons/chevron-down'
import ChevronUp from 'lucide-react/icons/chevron-up'
import Flag from 'lucide-react/icons/flag'
import Pause from 'lucide-react/icons/pause'
import Play from 'lucide-react/icons/play'
import SkipBack from 'lucide-react/icons/skip-back'
import SkipForward from 'lucide-react/icons/skip-forward'
import StepBack from 'lucide-react/icons/step-back'
import StepForward from 'lucide-react/icons/step-forward'
import { NoteText } from '@/features/guide/GuideParts'
import type { NoteResolver } from '@/features/guide/notes'
import { headlineText, stepHeadline } from '@/features/guide/stepText'
import { cn } from '@/ui/cn'
import { Tooltip } from '@/ui/Tooltip'
import type { Frame } from './replayModel'
import { prefersReducedMotion } from './useFlip'

export interface Names {
  nameOf: (code: number) => string
  nameOfUid: (uid: string) => string
  resolver: NoteResolver
  lang: 'it' | 'en'
}

const chipLabel = (f: Frame) => (f.inBranch ? String.fromCharCode(96 + (((f.label - 1) % 26) + 1)) : String(f.label))

/* ------------------------------------------------------------------ descrizione del passo corrente */
export function StepInfo({ frame, names, clamp }: { frame: Frame; names: Names; clamp?: boolean }) {
  const { t } = useTranslation()
  if (!frame.step)
    return (
      <div data-testid="replay-info" className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[15px] font-semibold leading-6 text-fg">{t('replay.start')}</p>
      </div>
    )
  const h = stepHeadline(frame.step, t, names.nameOfUid)
  const chain = frame.chain.length > 1 ? frame.chain.map((u) => names.nameOfUid(u)).join(' → ') : ''
  return (
    <div data-testid="replay-info" className="flex min-w-0 flex-col gap-0.5">
      <p className={cn('text-[15px] leading-6', clamp && 'line-clamp-2')}>
        <span className={cn('mr-1.5 inline-grid h-6 min-w-6 place-items-center rounded-full px-1.5 align-top text-xs font-semibold tabular-nums', frame.inBranch ? 'border border-warn text-warn' : 'bg-accent text-accent-fg')}>
          {chipLabel(frame)}
        </span>
        <span className="font-semibold text-fg">{h.verb}</span>
        {h.card ? <span className="text-fg"> {h.card}</span> : null}
        {h.sub ? <span className="text-muted"> ({h.sub})</span> : null}
      </p>
      <NoteText note={frame.step.note} lang={names.lang} resolver={names.resolver} nameOf={names.nameOf} className={cn('text-sm leading-5', clamp && 'line-clamp-2')} />
      {chain ? <p className="text-sm text-warn [overflow-wrap:anywhere]">{t('replay.chainOf', { cards: chain })}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ timeline a chip */
export function Timeline({ frames, index, branchStart, onSeek }: { frames: Frame[]; index: number; branchStart: number; onSeek: (i: number) => void }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="step"]')
    const c = box.current
    if (!el || !c) return
    const left = el.offsetLeft - c.clientWidth / 2 + el.clientWidth / 2
    c.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [index])
  return (
    <div ref={box} role="group" aria-label={t('replay.timeline')} data-testid="replay-timeline" className="-mx-1 flex gap-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:thin]">
      {frames.map((f, i) => {
        const cur = i === index
        const branch = i >= branchStart
        return (
          <button
            key={i}
            type="button"
            data-frame={i}
            aria-current={cur ? 'step' : undefined}
            aria-label={i === 0 ? t('replay.goToStart') : t('replay.goTo', { n: chipLabel(f) })}
            onClick={() => onSeek(i)}
            className={cn(
              'inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-md border text-sm font-semibold tabular-nums transition-colors duration-150',
              cur ? 'border-transparent bg-accent text-accent-fg' : i < index ? 'border-line bg-surface-2 text-fg hover:bg-surface-3' : 'border-line text-muted hover:bg-surface-2',
              branch && !cur && 'border-warn/60',
              branch && 'first:ml-0',
              i === branchStart && 'ml-2',
            )}
          >
            {i === 0 ? <Flag aria-hidden size={16} /> : chipLabel(f)}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ elenco passi (pannello laterale) */
export function StepList({ frames, index, branchStart, names, onSeek }: { frames: Frame[]; index: number; branchStart: number; names: Names; onSeek: (i: number) => void }) {
  const { t } = useTranslation()
  const box = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="step"]')
    const c = box.current
    if (!el || !c) return
    const top = el.offsetTop - c.clientHeight / 2 + el.clientHeight / 2
    c.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [index])
  return (
    <ol ref={box} aria-label={t('replay.timeline')} data-testid="replay-steplist" className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
      {frames.map((f, i) => {
        const cur = i === index
        const h = f.step ? headlineText(stepHeadline(f.step, t, names.nameOfUid)) : t('replay.start')
        return (
          <li key={i}>
            <button
              type="button"
              data-frame={i}
              aria-current={cur ? 'step' : undefined}
              onClick={() => onSeek(i)}
              className={cn(
                'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border px-2 py-1.5 text-left text-[15px] leading-5 transition-colors duration-150',
                cur ? 'border-accent-text bg-accent-soft text-fg' : 'border-transparent text-muted hover:bg-surface-2 hover:text-fg',
                i === branchStart && 'mt-2',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                  cur ? 'bg-accent text-accent-fg' : i > 0 && i >= branchStart ? 'border border-warn text-warn' : 'border border-line-strong text-muted',
                )}
              >
                {i === 0 ? <Flag size={14} /> : chipLabel(f)}
              </span>
              <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{h}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ barra di controllo */
const roundBtn = 'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40'

function Tool({ label, onClick, disabled, children, className, testid }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; className?: string; testid?: string }) {
  return (
    <Tooltip label={label}>
      <button type="button" aria-label={label} data-testid={testid} onClick={onClick} disabled={disabled} className={cn(roundBtn, 'text-fg hover:bg-surface-3', className)}>
        {children}
      </button>
    </Tooltip>
  )
}

export function ControlBar({
  index,
  last,
  playing,
  speed,
  label,
  expanded,
  hasSteps,
  onToggle,
  onPrev,
  onNext,
  onFirst,
  onLast,
  onPlay,
  onSpeed,
  onExpand,
}: {
  index: number
  last: number
  playing: boolean
  speed: number
  label: string
  expanded: boolean
  hasSteps: boolean
  onToggle: () => void
  onPrev: () => void
  onNext: () => void
  onFirst: () => void
  onLast: () => void
  onPlay: () => void
  onSpeed: () => void
  onExpand: () => void
}) {
  const { t } = useTranslation()
  void onToggle
  return (
    <div role="group" aria-label={t('replay.controls')} data-testid="replay-controls" className="flex min-h-14 items-center gap-1 rounded-lg border border-line bg-surface-1 px-1.5">
      <Tool label={t('replay.first')} onClick={onFirst} disabled={index === 0} className="hidden sm:inline-flex" testid="rp-first">
        <SkipBack aria-hidden size={20} />
      </Tool>
      <Tool label={t('replay.prev')} onClick={onPrev} disabled={index === 0} testid="rp-prev">
        <StepBack aria-hidden size={20} />
      </Tool>
      <Tooltip label={`${playing ? t('replay.pause') : t('replay.play')} (␣)`}>
        <button
          type="button"
          aria-label={playing ? t('replay.pause') : t('replay.play')}
          data-testid="rp-play"
          data-playing={playing}
          onClick={onPlay}
          disabled={!hasSteps}
          className={cn(roundBtn, 'bg-accent text-accent-fg shadow-1 hover:bg-accent-hover')}
        >
          {playing ? <Pause aria-hidden size={20} /> : <Play aria-hidden size={20} />}
        </button>
      </Tooltip>
      <Tool label={t('replay.next')} onClick={onNext} disabled={index >= last} testid="rp-next">
        <StepForward aria-hidden size={20} />
      </Tool>
      <Tool label={t('replay.last')} onClick={onLast} disabled={index >= last} className="hidden sm:inline-flex" testid="rp-last">
        <SkipForward aria-hidden size={20} />
      </Tool>
      <Tooltip label={t('replay.speed', { speed })}>
        <button
          type="button"
          aria-label={t('replay.speed', { speed })}
          data-testid="rp-speed"
          onClick={onSpeed}
          className="inline-flex h-11 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface-2 px-2 text-sm font-semibold tabular-nums text-fg transition-colors duration-150 hover:bg-surface-3"
        >
          {speed}×
        </button>
      </Tooltip>
      <p data-testid="rp-counter" role="status" className="min-w-0 flex-1 truncate px-2 text-right text-sm tabular-nums text-muted sm:text-left">
        {label}
      </p>
      <Tooltip label={expanded ? t('replay.collapse') : t('replay.expand')}>
        <button
          type="button"
          aria-label={expanded ? t('replay.collapse') : t('replay.expand')}
          aria-expanded={expanded}
          data-testid="rp-expand"
          onClick={onExpand}
          className={cn(roundBtn, 'text-muted hover:bg-surface-3 hover:text-fg')}
        >
          {expanded ? <ChevronDown aria-hidden size={20} /> : <ChevronUp aria-hidden size={20} />}
        </button>
      </Tooltip>
    </div>
  )
}
