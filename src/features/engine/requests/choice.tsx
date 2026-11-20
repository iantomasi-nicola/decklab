/** SELECT_COUNTER: distribuzione dei segnalini fra le carte. (Le scelte di carte stanno in `pick.tsx`, sul campo.) */
import { useState } from 'react'
import Minus from 'lucide-react/icons/minus'
import Plus from 'lucide-react/icons/plus'
import type { Answer } from '@/engine/protocol'
import { answerCounter } from '@/engine/answers'
import type { PendingRequest } from '@/engine/requests'
import { playSound } from '@/features/sound'
import { CardBox, EngBtn, Sheet, useNames, useRequestKeys } from './parts'

type Of<K extends PendingRequest['kind']> = Extract<PendingRequest, { kind: K }>
interface P<K extends PendingRequest['kind']> { req: Of<K>; onAnswer: (a: Answer) => void }

export function CounterRequest({ req, onAnswer }: P<'counter'>) {
  const { nameOf, t } = useNames()
  const [counts, setCounts] = useState<number[]>(() => req.options.map(() => 0))
  const total = counts.reduce((a, b) => a + b, 0)
  const set = (i: number, d: number) => {
    playSound('targetSelect')
    setCounts((c) => c.map((v, k) => (k === i ? Math.max(0, Math.min(req.options[i]!.available, v + d)) : v)))
  }
  const ok = total === req.count
  const confirm = () => ok && (playSound('targetConfirm'), onAnswer(answerCounter(counts)))
  useRequestKeys({ enter: confirm })
  return (
    <Sheet
      testId="req-counter"
      title={t('sel.counterTitle')}
      aside={<span className="eng-pill" data-tone={ok ? 'ok' : total > req.count ? 'warn' : undefined} data-testid="counter-total">{t('sel.counterTotal', { c: total, n: req.count })}</span>}
      footer={<EngBtn primary disabled={!ok} onClick={confirm} data-testid="counter-confirm">{t('sel.confirm')}</EngBtn>}
    >
      <ul className="flex flex-col gap-2 pb-3">
        {req.options.map((o, i) => (
          <li key={o.uid} className="eng-row !cursor-default">
            <CardBox code={o.code} name={nameOf(o.code)} width={36} pos={o.place.pos} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-[15px] font-medium leading-snug">{nameOf(o.code)}</span>
              <span className="block text-sm text-muted">{t('sel.counterAvail', { n: o.available })}</span>
            </span>
            <button type="button" className="grid size-11 place-items-center rounded-md border border-line-strong bg-surface-1 disabled:opacity-40" disabled={counts[i] === 0} aria-label="−" onClick={() => set(i, -1)} data-testid={`counter-minus-${i}`}><Minus aria-hidden size={18} /></button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums" data-testid={`counter-val-${i}`}>{counts[i]}</span>
            <button type="button" className="grid size-11 place-items-center rounded-md border border-line-strong bg-surface-1 disabled:opacity-40" disabled={counts[i] === o.available || total >= req.count} aria-label="+" onClick={() => set(i, 1)} data-testid={`counter-plus-${i}`}><Plus aria-hidden size={18} /></button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
