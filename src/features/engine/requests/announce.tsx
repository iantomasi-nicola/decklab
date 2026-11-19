/** Dichiarazioni: Tipo, Attributo, numero e carta (con ricerca). */
import { useMemo, useState } from 'react'
import type { Answer } from '@/engine/protocol'
import { answerAttribute, answerCard, answerNumber, answerRace } from '@/engine/answers'
import type { PendingRequest } from '@/engine/requests'
import { CardFace } from '@/features/combos/CardFace'
import { playSound } from '@/features/sound'
import { Input } from '@/ui/Input'
import { EngBtn, Sheet, useNames, useRequestKeys } from './parts'

type Of<K extends PendingRequest['kind']> = Extract<PendingRequest, { kind: K }>

const ATTR_COLOR: Record<number, string> = { 1: '#a9743b', 2: '#3b8fd6', 4: '#e0523c', 8: '#3fae6a', 16: '#e8c43a', 32: '#8a63c9', 64: '#d9a441' }

function toggle(list: number[], v: number, max: number): number[] {
  if (list.includes(v)) return list.filter((x) => x !== v)
  return max === 1 ? [v] : list.length >= max ? list : [...list, v]
}

/** Tipo / Attributo: griglia di chip con etichetta (mai solo colore); con count 1 il tocco risponde subito. */
export function MaskRequest({ req, onAnswer }: { req: Of<'announceRace'> | Of<'announceAttribute'>; onAnswer: (a: Answer) => void }) {
  const { t } = useNames()
  const race = req.kind === 'announceRace'
  const [chosen, setChosen] = useState<number[]>([])
  const send = (list: number[]) => {
    playSound('targetConfirm')
    onAnswer(race ? answerRace(list) : answerAttribute(list))
  }
  const tap = (v: number) => {
    playSound('targetSelect')
    if (req.count === 1) return send([v])
    setChosen((c) => toggle(c, v, req.count))
  }
  useRequestKeys({ digit: (n) => req.available[n - 1] !== undefined && tap(req.available[n - 1]!), enter: req.count > 1 ? () => chosen.length === req.count && send(chosen) : undefined })
  return (
    <Sheet
      testId={race ? 'req-race' : 'req-attr'}
      title={t(race ? 'sel.announceRace' : 'sel.announceAttr')}
      subtitle={req.count > 1 ? t('sel.announceCount', { n: req.count }) : undefined}
      aside={req.count > 1 ? <span className="eng-pill" data-tone={chosen.length === req.count ? 'ok' : undefined}>{chosen.length} / {req.count}</span> : undefined}
      footer={req.count > 1 ? <EngBtn primary disabled={chosen.length !== req.count} onClick={() => send(chosen)} data-testid="announce-confirm">{t('sel.confirm')}</EngBtn> : undefined}
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 pb-3">
        {req.available.map((v, i) => (
          <li key={v}>
            <button type="button" className="eng-row !min-h-12" data-on={chosen.includes(v) || undefined} data-autofocus={i === 0 || undefined} onClick={() => tap(v)} data-testid={`announce-${v}`} aria-pressed={chosen.includes(v)}>
              {!race ? <span aria-hidden className="size-4 shrink-0 rounded-full border border-line-strong" style={{ background: ATTR_COLOR[v] }} /> : null}
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{t(race ? (`race.${v}` as const) : (`attr.${v}` as const))}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

export function NumberRequest({ req, onAnswer }: { req: Of<'announceNumber'>; onAnswer: (a: Answer) => void }) {
  const { t } = useNames()
  const pick = (v: number) => {
    playSound('targetConfirm')
    onAnswer(answerNumber(v))
  }
  useRequestKeys({ digit: (n) => req.options[n - 1] !== undefined && pick(req.options[n - 1]!) })
  return (
    <Sheet testId="req-number" title={t('sel.announceNumber')}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2 pb-3">
        {req.options.map((v, i) => (
          <li key={v}>
            <button type="button" className="eng-btn w-full !min-h-14 text-xl tabular-nums" data-autofocus={i === 0 || undefined} onClick={() => pick(v)} data-testid={`number-${v}`}>{v}</button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

const MAX_SHOWN = 60

export function CardAnnounceRequest({ req, onAnswer }: { req: Of<'announceCard'>; onAnswer: (a: Answer) => void }) {
  const { nameOf, t } = useNames()
  const [q, setQ] = useState('')
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out: { code: number; name: string }[] = []
    for (const code of req.candidates) {
      const name = nameOf(code)
      if (!needle || name.toLowerCase().includes(needle)) out.push({ code, name })
      if (out.length >= MAX_SHOWN) break
    }
    return out
  }, [req.candidates, q, nameOf])
  const pick = (code: number) => {
    playSound('targetConfirm')
    onAnswer(answerCard(code))
  }
  useRequestKeys({ enter: () => rows.length === 1 && pick(rows[0]!.code) })
  return (
    <Sheet testId="req-announce-card" title={t('sel.announceCard')} subtitle={req.truncated ? t('sel.announceTruncated') : undefined} wide>
      <div className="sticky top-0 z-10 -mx-1 bg-surface-1 px-1 pb-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sel.search')} aria-label={t('sel.search')} data-autofocus data-testid="announce-search" />
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-muted">{t('sel.noMatch')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3 pb-3">
          {rows.map((r) => (
            <li key={r.code} className="eng-tile">
              <button type="button" aria-label={r.name} onClick={() => pick(r.code)} data-testid={`announce-card-${r.code}`}>
                <CardFace code={r.code} name={r.name} />
              </button>
              <span className="eng-tile-name">{r.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
