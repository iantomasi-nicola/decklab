/** Parti della pagina guida: note con carte inline, mano iniziale, board finale, varianti. */
import { useMemo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowRight from 'lucide-react/icons/arrow-right'
import GitFork from 'lucide-react/icons/git-fork'
import { CardImage } from '@/features/cards/CardImage'
import type { Localized } from '@/domain/types'
import { cn } from '@/ui/cn'
import { boardIsEmpty, boardView, handOf, pickLoc, type BoardCard, type VariantRow } from './guideModel'
import { parseNote, type NoteResolver } from './notes'
import type { GameState } from '@/domain/combo/state'
import type { ComboDoc } from '@/domain/combo/types'

/* ------------------------------------------------------------------ note */
export function NoteText({ note, lang, resolver, nameOf, className }: { note: Localized | undefined; lang: 'it' | 'en'; resolver: NoteResolver; nameOf: (code: number) => string; className?: string }) {
  const text = pickLoc(note, lang)
  const segs = useMemo(() => (text ? parseNote(text, resolver) : []), [text, resolver])
  if (!text) return null
  return (
    <p className={cn('text-[15px] leading-6 text-muted [overflow-wrap:anywhere]', className)}>
      {segs.map((s, i) =>
        s.t === 'text' ? (
          <span key={i}>{s.s}</span>
        ) : (
          <span key={i} data-note-card={s.code} className="font-medium text-fg">
            {nameOf(s.code)}
          </span>
        ),
      )}
    </p>
  )
}

/* ------------------------------------------------------------------ sezioni */
export function Section({ title, aside, children, className, id }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold leading-7">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ mano */
export function HandSection({ doc, nameOf, className }: { doc: ComboDoc; nameOf: (code: number) => string; className?: string }) {
  const { t } = useTranslation()
  const { required, random } = handOf(doc)
  // copie della stessa carta: una carta con badge ×N
  const groups = useMemo(() => {
    const m = new Map<number, number>()
    for (const c of required) m.set(c.code, (m.get(c.code) ?? 0) + 1)
    return [...m].map(([code, n]) => ({ code, n }))
  }, [required])
  return (
    <Section title={t('guide.hand.title')} id="guide-hand" className={className}>
      {required.length === 0 && random === 0 ? (
        <p className="text-[15px] text-muted">{t('guide.hand.none')}</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 sm:gap-3" data-testid="guide-hand">
            {groups.map(({ code, n }) => (
              <li key={code} className="flex w-[clamp(80px,26vw,104px)] min-w-0 flex-col gap-1.5">
                <div className="relative">
                  <CardImage id={code} alt={nameOf(code)} size="small" className="shadow-2" />
                  {n > 1 ? (
                    <span className="absolute -right-1 -top-1 min-w-6 rounded-full border border-line-strong bg-surface-1 px-1.5 text-center text-xs font-semibold leading-5 text-fg shadow-1">
                      {t('guide.hand.copies', { count: n })}
                    </span>
                  ) : null}
                </div>
                <span className="line-clamp-2 text-xs leading-4 text-muted [overflow-wrap:anywhere]">{nameOf(code)}</span>
              </li>
            ))}
            {random > 0 ? (
              <li className="flex w-[clamp(80px,26vw,104px)] min-w-0 flex-col gap-1.5" data-testid="guide-hand-random">
                <div
                  className="grid place-items-center rounded-[6px] border border-dashed border-line-strong text-muted"
                  style={{ aspectRatio: '59 / 86' }}
                >
                  <span className="text-2xl font-semibold tabular-nums text-fg">+{random}</span>
                </div>
                <span className="text-xs leading-4 text-muted">{t('guide.hand.randomLabel', { count: random })}</span>
              </li>
            ) : null}
          </ul>
          <p className="text-sm text-muted">{t('guide.hand.needs', { count: required.length })}</p>
        </>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ board finale */
function Gallery({ label, cards, nameOf }: { label: string; cards: BoardCard[]; nameOf: (c: number) => string }) {
  const { t } = useTranslation()
  if (cards.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-sm font-medium text-muted">{label}</h4>
      <ul className="flex flex-wrap gap-2">
        {cards.map((c) => (
          <li key={c.uid} className="w-[calc((100%-0.5rem*2)/3)] min-w-0 sm:w-[88px] lg:w-[calc((100%-0.5rem*2)/3)]">
            <div className="relative">
              <CardImage id={c.code} alt={nameOf(c.code)} size="small" />
              {c.overlays > 0 ? (
                <span className="absolute -left-1 -top-1 rounded-full border border-line-strong bg-surface-1 px-1.5 text-xs font-semibold leading-5 text-fg shadow-1" title={t('guide.end.materials', { count: c.overlays })}>
                  ×{c.overlays}
                </span>
              ) : null}
            </div>
            <span className="mt-1 line-clamp-2 block text-xs leading-4 text-muted [overflow-wrap:anywhere]">{nameOf(c.code)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function EndBoardSection({ doc, state, nameOf, summary, className }: { doc: ComboDoc; state: GameState; nameOf: (code: number) => string; summary?: string | undefined; className?: string }) {
  const { t } = useTranslation()
  const own = boardView(state, 0, doc.cards)
  const opp = boardView(state, 1, doc.cards)
  const sides = [
    { key: 'own', label: t('guide.end.own'), b: own },
    ...(boardIsEmpty(opp) ? [] : [{ key: 'opp', label: t('guide.end.opponent'), b: opp }]),
  ]
  return (
    <Section title={t('guide.end.title')} id="guide-end" className={className}>
      {summary ? <p className="text-[15px] font-medium text-fg">{summary}</p> : null}
      {sides.map(({ key, label, b }) => (
        <div key={key} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-3" data-testid={`guide-end-${key}`}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold">{label}</h3>
            {b.lp !== 8000 ? <span className="text-sm tabular-nums text-muted">{t('guide.end.lp', { lp: b.lp })}</span> : null}
          </div>
          {boardIsEmpty(b) ? (
            <p className="text-sm text-muted">{t('guide.end.empty')}</p>
          ) : (
            <>
              <Gallery label={t('guide.end.monsters')} cards={b.monsters} nameOf={nameOf} />
              <Gallery label={t('guide.end.backrow')} cards={b.backrow} nameOf={nameOf} />
              <Gallery label={t('guide.end.field')} cards={b.field} nameOf={nameOf} />
            </>
          )}
        </div>
      ))}
    </Section>
  )
}

/* ------------------------------------------------------------------ varianti */
export function VariantsSection({
  variants,
  mother,
  lang,
  className,
}: {
  variants: VariantRow[]
  mother: { motherId: string; title: Localized | undefined; afterStepNo: number } | null
  lang: 'it' | 'en'
  className?: string
}) {
  const { t } = useTranslation()
  const untitled = t('combos.untitled', { defaultValue: '—' })
  const row = (id: string, title: Localized | undefined, afterNo: number, prefix?: string) => (
    <li key={id}>
      <Link
        to="/combo/$comboId/guida"
        params={{ comboId: id }}
        className="group flex min-h-14 items-center gap-3 rounded-md border border-line bg-surface-1 px-3 py-2 transition-colors duration-150 hover:bg-surface-2"
      >
        <GitFork aria-hidden size={18} className="shrink-0 text-accent-text" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-fg">
            {prefix ? <span className="font-normal text-muted">{prefix} </span> : null}
            {pickLoc(title, lang) ?? untitled}
          </span>
          <span className="block truncate text-sm text-muted">{afterNo > 0 ? t('guide.variants.afterStep', { n: afterNo }) : t('guide.variants.fromStart')}</span>
        </span>
        <ArrowRight aria-hidden size={18} className="shrink-0 text-subtle transition-transform duration-150 group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
  return (
    <Section title={t('guide.variants.title')} id="guide-variants" className={className}>
      {mother || variants.length ? (
        <ul className="flex flex-col gap-2" data-testid="guide-variants">
          {mother ? row(mother.motherId, mother.title, mother.afterStepNo, t('guide.variants.motherOf')) : null}
          {variants.map((v) => row(v.id, v.title, v.afterStepNo))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">{t('guide.variants.none')}</p>
      )}
    </Section>
  )
}
