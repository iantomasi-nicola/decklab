/** Sommario dei passi di una combo lunga: sezioni per fase (comprimibili), blocchi di catena / ordine libero / passi, rami. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ChevronDown from 'lucide-react/icons/chevron-down'
import GitBranch from 'lucide-react/icons/git-branch'
import Link2 from 'lucide-react/icons/link-2'
import Shuffle from 'lucide-react/icons/shuffle'
import type { ComboDoc } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { pickLoc, type OutlineBlock, type OutlineSection } from './guideModel'

const rowCls = 'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-[15px] leading-5 text-fg transition-colors duration-150 hover:bg-surface-2'

export function TocBody({
  doc,
  lang,
  outline,
  nameOfUid,
  onJumpStep,
  onJumpBranch,
  onJumpId,
}: {
  doc: ComboDoc
  lang: 'it' | 'en'
  outline: OutlineSection[]
  nameOfUid: (uid: string) => string
  onJumpStep: (n: number) => void
  onJumpBranch: (id: string) => void
  onJumpId: (id: string) => void
}) {
  const { t } = useTranslation()
  const [closed, setClosed] = useState<ReadonlySet<number>>(new Set())
  const range = (from: number, to: number) => (from === to ? String(from) : t('guide.nav.range', { from, to }))
  const label = (b: OutlineBlock) => {
    const card = b.uid ? nameOfUid(b.uid) : ''
    const kind = b.kind === 'chain' ? ((b.links ?? 0) > 0 ? t('guide.nav.chain', { count: b.links }) : t('guide.nav.chainResolve')) : b.kind === 'group' ? t('guide.nav.free') : ''
    return [kind, card].filter(Boolean).join(' · ') || t('guide.nav.plain')
  }
  return (
    <div className="flex flex-col gap-1" data-testid="guide-toc">
      <p className="px-2 pb-1 text-sm text-muted">{t('guide.nav.tocHint')}</p>
      <button type="button" className={rowCls} onClick={() => onJumpId('guide-hand')}>
        <span className="w-[4.5rem] shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{t('guide.nav.hand')}</span>
      </button>
      {outline.map((sec, si) => {
        const open = !closed.has(si)
        const title = sec.phase ? t(`guide.phase.${sec.phase}`) : t('guide.nav.chunk', { from: sec.from, to: sec.to })
        const n = sec.to - sec.from + 1
        return (
          <section key={si} className="flex flex-col">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setClosed((c) => { const x = new Set(c); if (x.has(si)) x.delete(si); else x.add(si); return x })}
              className={cn(rowCls, 'font-semibold')}
            >
              <span className="w-[4.5rem] shrink-0 text-sm font-medium tabular-nums text-muted">{range(sec.from, sec.to)}</span>
              <span className="min-w-0 flex-1">
                {title}
                <span className="ml-2 text-sm font-normal text-muted">{t('guide.nav.sectionCount', { count: n })}</span>
              </span>
              <ChevronDown aria-hidden size={18} className={cn('shrink-0 text-muted transition-transform duration-150', !open && '-rotate-90')} />
            </button>
            {open ? (
              <ul className="flex flex-col">
                {sec.blocks.map((b) => (
                  <li key={b.from}>
                    <button type="button" className={rowCls} onClick={() => onJumpStep(b.from)} data-toc-step={b.from}>
                      <span className="w-[4.5rem] shrink-0 pl-3 text-sm tabular-nums text-muted">{range(b.from, b.to)}</span>
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        {b.kind === 'chain' ? <Link2 aria-hidden size={16} className="shrink-0 text-warn" /> : b.kind === 'group' ? <Shuffle aria-hidden size={16} className="shrink-0 text-accent-text" /> : <span aria-hidden className="size-4 shrink-0" />}
                        <span className="line-clamp-2 [overflow-wrap:anywhere]">{label(b)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )
      })}
      {doc.branches.length ? (
        <section className="flex flex-col">
          <h3 className={cn(rowCls, 'pointer-events-none font-semibold')}>
            <span className="w-[4.5rem] shrink-0" aria-hidden />
            <span>{t('guide.nav.branches')}</span>
          </h3>
          <ul className="flex flex-col">
            {doc.branches.map((b) => {
              const after = doc.steps.findIndex((s) => s.id === b.condition.afterStep) + 1
              return (
                <li key={b.id}>
                  <button type="button" className={rowCls} onClick={() => onJumpBranch(b.id)}>
                    <span className="w-[4.5rem] shrink-0 pl-3 text-sm tabular-nums text-muted">{after > 0 ? `${after}` : ''}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <GitBranch aria-hidden size={16} className="shrink-0 text-warn" />
                      <span className="line-clamp-2 [overflow-wrap:anywhere]">
                        {t('guide.nav.branchRow', { title: pickLoc(b.title, lang) ?? b.id })}
                        {after > 0 ? <span className="text-muted"> · {t('guide.nav.branchAfter', { n: after })}</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      <button type="button" className={rowCls} onClick={() => onJumpId('guide-end')}>
        <span className="w-[4.5rem] shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 font-medium">{t('guide.nav.end')}</span>
      </button>
    </div>
  )
}
