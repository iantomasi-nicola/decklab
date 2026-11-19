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

