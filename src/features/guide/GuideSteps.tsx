/** Elenco dei passi numerati con catene, ordine libero, handtrap (rami) e marcatori di divergenza. */
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import CircleDot from 'lucide-react/icons/circle-dot'
import Link2 from 'lucide-react/icons/link-2'
import Shuffle from 'lucide-react/icons/shuffle'
import TriangleAlert from 'lucide-react/icons/triangle-alert'
import GitBranch from 'lucide-react/icons/git-branch'
import { CardImage } from '@/features/cards/CardImage'
import type { Branch, ComboDoc, Step } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { buildSteps, pickLoc, stepDetails, type VariantRow } from './guideModel'
import { NoteText } from './GuideParts'
import { stepHeadline } from './stepText'
import type { NoteResolver } from './notes'

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
    <aside data-testid="guide-branch" data-branch={branch.id} className="rounded-lg border border-line border-l-2 border-l-warn bg-surface-1 p-3 sm:p-4">
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

export function StepsList({ ctx, variants }: { ctx: GuideCtx; variants: VariantRow[] }) {
  const { t } = useTranslation()
  const steps = buildSteps(ctx.doc)
  if (steps.length === 0) return <p className="text-[15px] text-muted">{t('guide.steps.empty')}</p>
  return (
    <ol className="flex flex-col" data-testid="guide-steps">
      {steps.map((gs, i) => {
        const here = variants.filter((v) => v.afterStepId === gs.step.id)
        const last = i === steps.length - 1
        return (
          <li key={gs.step.id} data-step={gs.number} className="relative flex gap-3 pb-5 sm:gap-4">
            {/* binario: numero + linea continua */}
            <div className="flex w-8 shrink-0 flex-col items-center">
              <span className="grid size-8 place-items-center rounded-full bg-accent text-sm font-semibold tabular-nums text-accent-fg">{gs.number}</span>
              {!last ? <span aria-hidden className="mt-1 w-px flex-1 bg-line-strong/60" /> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className={cn('flex gap-3 border-l-2 pl-3', gs.chain ? 'border-warn' : gs.group ? 'border-dashed border-accent-text' : 'border-transparent')}>
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
      })}
    </ol>
  )
}
