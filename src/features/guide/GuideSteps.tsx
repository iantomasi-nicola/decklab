/** Elenco dei passi numerati con catene, ordine libero, handtrap (rami) e marcatori di divergenza. */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import CircleDot from 'lucide-react/icons/circle-dot'
import Link2 from 'lucide-react/icons/link-2'
import Shuffle from 'lucide-react/icons/shuffle'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import GitBranch from 'lucide-react/icons/git-branch'
import ChevronDown from 'lucide-react/icons/chevron-down'
import Flag from 'lucide-react/icons/flag'
import ListTree from 'lucide-react/icons/list-tree'
import { CardImage } from '@/features/cards/CardImage'
import type { Branch, ComboDoc, Step } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { normalizeName } from '@/domain/deck/cardIndex'
import { useMediaQuery } from '@/features/combos/useCards'
import { Button } from '@/ui/Button'
import { BottomSheet } from '@/ui/BottomSheet'
import { inputBase } from '@/ui/Input'
import { SearchField } from '@/ui/SearchField'
import { buildListItems, buildOutline, matchSteps, pickLoc, stepDetails, type GuideStep, type ListItem, type VariantRow } from './guideModel'
import { TocBody } from './GuideToc'
import { NoteText } from './GuideParts'
import { headlineText, stepHeadline } from './stepText'
import { noteToPlain, parseNote, type NoteResolver } from './notes'

export interface GuideCtx {
  doc: ComboDoc
  lang: 'it' | 'en'
  nameOf: (code: number) => string
  nameOfUid: (uid: string) => string
  resolver: NoteResolver
  flagged: ReadonlySet<string>
}

function Thumb({ code, name, className }: { code: number | undefined; name: string; className?: string }) {
  if (code === undefined) {
    return (
      <div aria-hidden className={cn('grid h-10 place-items-center rounded-[6px] border border-dashed border-line-strong text-subtle', className)}>
        <CircleDot size={18} />
      </div>
    )
  }
  return <CardImage id={code} alt={name} size="small" className={className} />
}

/** Numero (linea principale) o lettera (ramo) del passo `id`. */
function refLabel(doc: ComboDoc, id: string): string {
  const i = doc.steps.findIndex((s) => s.id === id)
  if (i >= 0) return String(i + 1)
  for (const b of doc.branches) {
    const j = b.steps.findIndex((s) => s.id === id)
    if (j >= 0) return String.fromCharCode(97 + (j % 26))
  }
  return ''
}

function StepBody({ step, ctx }: { step: Step; ctx: GuideCtx }) {
  const { t } = useTranslation()
  const { nameOfUid } = ctx
  const h = stepHeadline(step, t, nameOfUid)
  const refNo = step.action === 'resolve' && step.ref ? refLabel(ctx.doc, step.ref) : ''
  if (refNo) h.sub = [h.sub, t('guide.steps.resolves', { n: refNo })].filter(Boolean).join(' · ')
  const details = stepDetails(step)
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-base leading-6">
        <span className="font-semibold text-fg">{h.verb}</span>
        {h.card ? <span className="text-fg"> {h.card}</span> : null}
        {h.sub ? <span className="text-muted"> ({h.sub})</span> : null}
      </p>
      <NoteText note={step.note} lang={ctx.lang} resolver={ctx.resolver} nameOf={ctx.nameOf} />
      {details.length ? (
        <dl className="flex flex-col gap-0.5 text-sm">
          {details.map((d, i) => (
            <div key={i} className="flex gap-1.5">
              <dt className="shrink-0 text-subtle">{d.label ? `${t(`guide.detail.${d.kind}`)} (${d.label})` : t(`guide.detail.${d.kind}`)}:</dt>
              <dd className="min-w-0 text-muted [overflow-wrap:anywhere]">{d.uids.map((u) => nameOfUid(u)).join(', ')}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Tags step={step} flagged={ctx.flagged.has(step.id)} />
    </div>
  )
}

function Tags({ step, flagged }: { step: Step; flagged: boolean }) {
  const { t } = useTranslation()
  const tags: { key: string; icon: ReactNode; text: string; tone?: 'warn' }[] = []
  if (step.chain) tags.push({ key: 'chain', icon: <Link2 size={14} />, text: `${t('guide.steps.chain')} · ${t('guide.steps.link', { n: step.chain.link })}` })
  if (step.group) tags.push({ key: 'group', icon: <Shuffle size={14} />, text: t('guide.steps.free') })
  if (step.optional) tags.push({ key: 'opt', icon: null, text: t('guide.steps.optional') })
  if (flagged) tags.push({ key: 'ban', icon: <TriangleAlert size={14} />, text: t('guide.steps.banlist'), tone: 'warn' })
  if (!tags.length) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((g) => (
        <li key={g.key} className={cn('inline-flex h-6 items-center gap-1 rounded-full border border-line bg-surface-2 px-2 text-xs font-medium', g.tone === 'warn' ? 'text-warn' : 'text-muted')}>
          {g.icon ? <span aria-hidden className="inline-flex">{g.icon}</span> : null}
          {g.text}
        </li>
      ))}
    </ul>
  )
}

function BranchBlock({ branch, ctx }: { branch: Branch; ctx: GuideCtx }) {
  const { t } = useTranslation()
  const { doc } = ctx
  const opp = branch.condition.opponent
  const title = pickLoc(branch.title, ctx.lang)
  const rejoinNo = branch.rejoin ? doc.steps.findIndex((s) => s.id === branch.rejoin) + 1 : 0
  return (
    <aside data-testid="guide-branch" data-branch={branch.id} className="scroll-mt-[8.25rem] rounded-lg border border-line border-l-2 border-l-warn bg-surface-1 p-3 sm:p-4">
      <header className="flex items-start gap-3">
        <div className="w-12 shrink-0 sm:w-14">
          <Thumb code={opp.code} name={ctx.nameOf(opp.code)} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="flex items-start gap-1.5 text-base font-semibold leading-6">
            <GitBranch aria-hidden size={18} className="mt-[3px] shrink-0 text-warn" />
            <span className="[overflow-wrap:anywhere]">
              {t('guide.branch.title', { card: ctx.nameOf(opp.code) })}
              <span className="font-normal text-muted"> {t(`guide.branch.${branch.condition.window}`)}</span>
            </span>
          </h4>
          {title ? <p className="mt-0.5 text-[15px] font-medium text-fg">{title}</p> : null}
          <NoteText note={branch.note} lang={ctx.lang} resolver={ctx.resolver} nameOf={ctx.nameOf} className="mt-0.5" />
        </div>
      </header>
      {branch.steps.length ? (
        <ol className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          {branch.steps.map((s, j) => (
            <li key={s.id} className="flex gap-3">
              <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full border border-warn text-xs font-semibold text-warn">
                {String.fromCharCode(97 + (j % 26))}
              </span>
              <div className="w-10 shrink-0 sm:w-12">
                <Thumb code={s.card ? doc.cards[s.card] : undefined} name={s.card ? ctx.nameOfUid(s.card) : ''} />
              </div>
              <StepBody step={s} ctx={ctx} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-muted">{t('guide.branch.noSteps')}</p>
      )}
      {rejoinNo > 0 ? <p className="mt-3 text-sm font-medium text-fg">{t('guide.branch.rejoin', { n: rejoinNo })}</p> : null}
    </aside>
  )
}


/* ------------------------------------------------------------------ elenco con navigazione */
const SCROLL_MT = 'scroll-mt-[8.25rem]' // altezza barra alta (57 px) + barra di navigazione (60 px) + respiro

const StepItem = memo(function StepItem({ gs, ctx, variants, last, flash, inChain }: { gs: GuideStep; ctx: GuideCtx; variants: VariantRow[]; last: boolean; flash: boolean; inChain: boolean }) {
  const { t } = useTranslation()
  const here = variants.filter((v) => v.afterStepId === gs.step.id)
  return (
    <li data-step={gs.number} className={cn('relative flex gap-3 pb-5 [contain-intrinsic-size:auto_9rem] [content-visibility:auto] sm:gap-4', SCROLL_MT)}>
      {/* binario: numero + linea continua */}
      <div className="flex w-8 shrink-0 flex-col items-center">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold tabular-nums text-accent-fg">{gs.number}</span>
        {!last ? <span aria-hidden className="mt-1 w-px flex-1 bg-line-strong/60" /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div
          data-flash={flash || undefined}
          className={cn(
            'flex gap-3 rounded-sm border-l-2 pl-3 transition-colors duration-500',
            gs.chain || inChain ? 'border-warn' : gs.group ? 'border-dashed border-accent-text' : 'border-transparent',
            flash && 'bg-accent-soft',
          )}
        >
          <div className="w-14 shrink-0 sm:w-16">
            <Thumb code={gs.step.card ? ctx.doc.cards[gs.step.card] : undefined} name={gs.step.card ? ctx.nameOfUid(gs.step.card) : ''} />
          </div>
          <StepBody step={gs.step} ctx={ctx} />
        </div>
        {gs.branches.map((b) => (
          <BranchBlock key={b.id} branch={b} ctx={ctx} />
        ))}
        {here.map((v) => (
          <p key={v.id} className="text-sm text-muted">
            <Link to="/combo/$comboId/guida" params={{ comboId: v.id }} className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-2">
              {t('guide.steps.variantHere', { title: pickLoc(v.title, ctx.lang) ?? '—' })}
            </Link>
          </p>
        ))}
      </div>
    </li>
  )
})

function Rail({ last, children }: { last: boolean; children: ReactNode }) {
  return (
    <div className="flex w-8 shrink-0 flex-col items-center">
      {children}
      {!last ? <span aria-hidden className="mt-1 w-px flex-1 bg-line-strong/60" /> : null}
    </div>
  )
}

function ChainHeader({ item, last, onToggle }: { item: Extract<ListItem, { kind: 'chain' }>; last: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  return (
    <li data-chain-header={item.id} className="flex gap-3 pb-3 sm:gap-4">
      <Rail last={last}>
        <span aria-hidden className="grid size-8 place-items-center rounded-full border border-warn text-warn">
          <Link2 size={16} />
        </span>
      </Rail>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={!item.collapsed}
          aria-label={`${t('guide.nav.chainBlock', { count: item.links, from: item.from, to: item.to })} — ${item.collapsed ? t('guide.nav.chainExpand') : t('guide.nav.chainCollapse')}`}
          onClick={onToggle}
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md border border-line border-l-2 border-l-warn bg-surface-1 px-3 text-left text-[15px] font-medium text-fg transition-colors duration-150 hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t('guide.nav.chainBlock', { count: item.links, from: item.from, to: item.to })}</span>
          <ChevronDown aria-hidden size={18} className={cn('shrink-0 text-muted transition-transform duration-150', item.collapsed && '-rotate-90')} />
        </button>
      </div>
    </li>
  )
}

function PhaseHeading({ phase }: { phase: string }) {
  const { t } = useTranslation()
  return (
    <li data-phase={phase} className="flex items-center gap-3 pb-3 pt-1 sm:gap-4">
      <span aria-hidden className="grid w-8 shrink-0 place-items-center text-accent-text">
        <Flag size={16} />
      </span>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{t(`guide.phase.${phase}`)}</h3>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </li>
  )
}

/** Sezione "Passi": barra di navigazione fissa (sommario, ricerca, vai al passo) + elenco con fasi e catene comprimibili. */
export function StepsSection({ ctx, variants }: { ctx: GuideCtx; variants: VariantRow[] }) {
  const { t } = useTranslation()
  const { doc } = ctx
  const total = doc.steps.length
  const wide = useMediaQuery('(min-width: 768px)')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [flash, setFlash] = useState<number | null>(null)
  const [tocOpen, setTocOpen] = useState(false)
  const [pending, setPending] = useState<{ kind: 'step'; n: number } | { kind: 'id'; id: string } | { kind: 'branch'; id: string } | null>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const jumpRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const firstQuery = useRef(true)

  const searching = query.trim() !== ''
  const hay = useMemo(() => {
    if (!searching) return []
    const names = (uids: readonly string[]) => uids.map((u) => ctx.nameOfUid(u)).join(' ')
    return doc.steps.map((s) => {
      const note = pickLoc(s.note, ctx.lang)
      const noteText = note ? noteToPlain(parseNote(note, ctx.resolver), ctx.nameOf) : ''
      const details = stepDetails(s).map((d) => names(d.uids)).join(' ')
      return normalizeName([headlineText(stepHeadline(s, t, ctx.nameOfUid)), noteText, details].join(' '))
    })
  }, [searching, doc.steps, ctx, t])
  const matches = useMemo(() => (searching ? matchSteps(hay, query, normalizeName) : null), [searching, hay, query])
  const items = useMemo(() => buildListItems(doc, collapsed, matches), [doc, collapsed, matches])
  const outline = useMemo(() => buildOutline(doc), [doc])

  const toggleChain = useCallback((id: string) => setCollapsed((c) => { const x = new Set(c); if (x.has(id)) x.delete(id); else x.add(id); return x }), [])

  /** Porta in vista un passo/ramo/sezione: apre ciò che serve, poi scorre (due volte: le righe fuori schermo hanno altezza stimata). */
  const request = useCallback(
    (req: NonNullable<typeof pending>) => {
      setTocOpen(false)
      if (req.kind === 'step') {
        const n = Math.min(Math.max(req.n, 1), total)
        const step = doc.steps[n - 1]
        const cid = step?.chain?.id ?? (step?.action === 'resolve' ? doc.steps.find((x) => x.id === step.ref)?.chain?.id : undefined)
        if (cid) setCollapsed((c) => (c.has(cid) ? new Set([...c].filter((x) => x !== cid)) : c))
        if (matches && !matches.has(n)) setQuery('')
        setPending({ kind: 'step', n })
      } else setPending(req)
    },
    [doc.steps, matches, total],
  )
  useEffect(() => {
    if (!pending) return
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const find = () =>
      pending.kind === 'step'
        ? document.querySelector<HTMLElement>(`[data-step="${pending.n}"]`)
        : pending.kind === 'branch'
          ? document.querySelector<HTMLElement>(`[data-branch="${pending.id}"]`)
          : document.getElementById(pending.id)
    const go = () => find()?.scrollIntoView({ block: 'start', behavior: 'auto' })
    go()
    const h1 = requestAnimationFrame(() => requestAnimationFrame(go))
    const h2 = setTimeout(go, 120)
    if (pending.kind === 'step') {
      setFlash(pending.n)
      const h3 = setTimeout(() => setFlash(null), reduce ? 1200 : 1800)
      return () => { cancelAnimationFrame(h1); clearTimeout(h2); clearTimeout(h3) }
    }
    return () => { cancelAnimationFrame(h1); clearTimeout(h2) }
  }, [pending])

  // cambia la ricerca: se la lista è già scorsa sotto la barra, si riparte dall'inizio dei risultati
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false
      return
    }
    const ol = listRef.current
    if (ol && ol.getBoundingClientRect().top < 125) ol.scrollIntoView({ block: 'start', behavior: 'auto' })
  }, [query])

  // scorciatoie: "/" cerca, "G" vai al passo
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable || el?.closest('[role="menu"], [role="dialog"]')) return
      if (e.key === '/') { e.preventDefault(); searchRef.current?.querySelector('input')?.focus() }
      else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); jumpRef.current?.focus(); jumpRef.current?.select() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  // sommario affiancato (>= 768): si chiude con Esc o toccando fuori
  useEffect(() => {
    if (!tocOpen || !wide) return
    const down = (e: PointerEvent) => { if (toolbar.current && !toolbar.current.contains(e.target as Node)) setTocOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setTocOpen(false) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [tocOpen, wide])

  if (total === 0) return <p className="text-[15px] text-muted">{t('guide.steps.empty')}</p>

  const toc = (
    <TocBody
      doc={doc}
      lang={ctx.lang}
      outline={outline}
      nameOfUid={ctx.nameOfUid}
      onJumpStep={(n) => request({ kind: 'step', n })}
      onJumpBranch={(id) => request({ kind: 'branch', id })}
      onJumpId={(id) => request({ kind: 'id', id })}
    />
  )
  const submitJump = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const input = jumpRef.current
    const n = Number(input?.value)
    if (Number.isInteger(n) && n >= 1) request({ kind: 'step', n })
    input?.blur()
  }
  const lastIdx = items.length - 1
  return (
    <>
      <div ref={toolbar} data-testid="guide-toolbar" className="sticky top-[57px] z-20 -mx-1 bg-bg px-1 py-2">
        <div className="flex items-center gap-2">
          <Button
            icon={<ListTree size={18} />}
            aria-label={t('guide.nav.tocTitle')}
            aria-expanded={tocOpen}
            data-testid="guide-toc-button"
            onClick={() => setTocOpen((o) => !o)}
            className={cn('w-11 shrink-0 px-0 sm:w-auto sm:px-4', tocOpen && 'bg-surface-3')}
          >
            <span className="hidden sm:inline">{t('guide.nav.toc')}</span>
          </Button>
          <div ref={searchRef} className="min-w-0 flex-1">
            <SearchField value={query} onValueChange={setQuery} label={t('guide.nav.search')} placeholder={t('guide.nav.searchPlaceholder')} data-testid="guide-search" />
          </div>
          <form onSubmit={submitJump} className="w-[4.75rem] shrink-0 sm:w-24">
            <input
              ref={jumpRef}
              type="number"
              inputMode="numeric"
              enterKeyHint="go"
              min={1}
              max={total}
              aria-label={t('guide.nav.jump')}
              placeholder={t('guide.nav.jumpPlaceholder')}
              data-testid="guide-jump"
              className={cn(inputBase, 'px-2 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
            />
          </form>
        </div>
        {tocOpen && wide ? (
          <div className="absolute inset-x-1 top-full max-h-[min(65dvh,32rem)] overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface-1 p-2 shadow-2" data-testid="guide-toc-panel">
            {toc}
          </div>
        ) : null}
      </div>
      {!wide ? (
        <BottomSheet open={tocOpen} onOpenChange={setTocOpen} title={t('guide.nav.tocTitle')}>
          {toc}
        </BottomSheet>
      ) : null}

      <div ref={listRef} className={cn('flex flex-col gap-3', SCROLL_MT)}>
      {matches ? (
        <p aria-live="polite" className="text-sm text-muted" data-testid="guide-results">
          {matches.size ? t('guide.nav.results', { count: matches.size }) : t('guide.nav.noResults', { q: query.trim() })}
        </p>
      ) : null}
      <ol className="flex flex-col" data-testid="guide-steps">
        {items.map((it, i) => {
          const last = i === lastIdx
          if (it.kind === 'phase') return <PhaseHeading key={`ph-${it.phase}-${i}`} phase={it.phase} />
          if (it.kind === 'chain') return <ChainHeader key={`ch-${it.id}`} item={it} last={last} onToggle={() => toggleChain(it.id)} />
          return <StepItem key={it.gs.step.id} gs={it.gs} ctx={ctx} variants={variants} last={last} flash={flash === it.gs.number} inChain={it.inChain} />
        })}
      </ol>
      </div>
    </>
  )
}
