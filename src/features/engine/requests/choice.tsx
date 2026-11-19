/** Scelta di carte: SELECT_CARD / SELECT_TRIBUTE / SELECT_UNSELECT_CARD / SELECT_SUM / SELECT_COUNTER. */
import { useMemo, useState, type ReactNode } from 'react'
import Minus from 'lucide-react/icons/minus'
import Plus from 'lucide-react/icons/plus'
import type { Answer } from '@/engine/protocol'
import { answerCards, answerCounter, answerSum, answerUnselect } from '@/engine/answers'
import type { CardRef, Opt, PendingRequest } from '@/engine/requests'
import { CardFace } from '@/features/combos/CardFace'
import { playSound } from '@/features/sound'
import { TargetPickerOverlay } from '@/features/turn'
import { Input } from '@/ui/Input'
import { sumStatus, valuesOf } from '../sum'
import { CardBox, EngBtn, Sheet, useNames, useRequestKeys } from './parts'
import type { EngT } from '../strings'

type Of<K extends PendingRequest['kind']> = Extract<PendingRequest, { kind: K }>
interface P<K extends PendingRequest['kind']> { req: Of<K>; onAnswer: (a: Answer) => void }

const VISIBLE_LOCS = new Set(['mzone', 'emz', 'szone', 'fzone', 'hand'])

export function locLabel(r: CardRef, t: EngT): string {
  const l = r.place.loc
  const who = r.place.p === 1 ? ` · ${t('sel.opponentSide')}` : ''
  const name = l === 'hand' ? t('sel.inHand') : l === 'gy' ? t('sel.inGy') : l === 'banished' ? t('sel.inBanished') : l === 'deck' ? t('sel.inDeck') : l === 'extra' ? t('sel.inExtra') : l === 'overlay' ? t('sel.inOverlay') : t('sel.visibleOnBoard')
  return name + who
}

interface Tile { key: string; ref: CardRef; chosen?: number; disabled?: boolean; badge?: ReactNode; label?: string }

function Grid({ tiles, onToggle, t, nameOf }: { tiles: Tile[]; onToggle: (key: string) => void; t: EngT; nameOf: (c: number) => string }) {
  return (
    <ul className="eng-grid" data-testid="choice-grid">
      {tiles.map((x, i) => (
        <li key={x.key} className="eng-tile">
          <button
            type="button"
            data-chosen={!!x.chosen || undefined}
            data-dim={x.disabled || undefined}
            disabled={x.disabled}
            data-autofocus={i === 0 || undefined}
            aria-pressed={!!x.chosen}
            aria-label={`${nameOf(x.ref.code)}${x.chosen ? ` (${x.chosen})` : ''}`}
            data-testid={`tile-${x.key}`}
            onClick={() => onToggle(x.key)}
          >
            <CardFace code={x.ref.code} name={nameOf(x.ref.code)} pos={x.ref.place.pos} />
            {x.chosen ? <span className="eng-order" aria-hidden>{x.chosen}</span> : null}
            {x.badge ? <span className="absolute bottom-1 left-1 rounded-full border border-line-strong bg-surface-1 px-1.5 text-xs font-semibold text-fg">{x.badge}</span> : null}
          </button>
          <span className="eng-tile-name">{nameOf(x.ref.code)}</span>
          <span className="text-[11px] leading-tight text-subtle">{x.label ?? locLabel(x.ref, t)}</span>
        </li>
      ))}
    </ul>
  )
}

function useFilter(items: readonly Opt[], nameOf: (c: number) => string) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const match = (o: Opt) => !needle || nameOf(o.code).toLowerCase().includes(needle)
  return { q, setQ, match, show: items.length > 12 }
}

/** SELECT_CARD / SELECT_TRIBUTE. Se tutti i candidati si vedono (campo/mano) si usa il selettore sul campo, altrimenti la griglia. */
export function CardsRequest({ req, onAnswer }: P<'cards'>) {
  const { nameOf, t } = useNames()
  const onBoard = req.options.every((o) => VISIBLE_LOCS.has(o.place.loc)) && req.options.every((o) => (o.tribute ?? 1) === 1)
  if (onBoard) {
    const byUid = new Map(req.options.map((o) => [o.uid, o]))
    const max = Math.max(1, Math.min(req.max, req.options.length))
    const min = Math.min(req.min, max)
    return (
      <TargetPickerOverlay
        candidates={req.options.map((o) => o.uid)}
        min={min}
        max={max}
        title={t(req.mode === 'tribute' ? 'sel.tributeTitle' : 'sel.cardsTitle')}
        cardName={(u) => nameOf(byUid.get(u)?.code ?? 0)}
        cancelable={req.canCancel}
        confirmOnPick={max === 1 && min === 1}
        onChange={() => playSound('targetSelect')}
        onConfirm={(sel) => {
          playSound('targetConfirm')
          onAnswer(answerCards(req, sel.map((u) => byUid.get(u)!.index)))
        }}
        onCancel={() => onAnswer(answerCards(req, null))}
      />
    )
  }
  return <CardsGrid req={req} onAnswer={onAnswer} />
}

function CardsGrid({ req, onAnswer }: P<'cards'>) {
  const { nameOf, t } = useNames()
  const [chosen, setChosen] = useState<number[]>([])
  const f = useFilter(req.options, nameOf)
  const tribute = req.mode === 'tribute'
  const total = chosen.reduce((s, i) => s + (req.options.find((o) => o.index === i)?.tribute ?? 1), 0)
  const full = chosen.length >= req.max
  const ok = tribute ? total >= req.min && chosen.length <= req.max : chosen.length >= req.min && chosen.length <= req.max
  const toggle = (key: string) => {
    const idx = Number(key)
    playSound('targetSelect')
    setChosen((c) => (c.includes(idx) ? c.filter((x) => x !== idx) : c.length >= req.max ? (req.max === 1 ? [idx] : c) : [...c, idx]))
  }
  const confirm = () => ok && (playSound('targetConfirm'), onAnswer(answerCards(req, chosen)))
  const cancel = req.canCancel ? () => onAnswer(answerCards(req, null)) : undefined
  useRequestKeys({ enter: confirm, escape: cancel })
  const tiles: Tile[] = req.options.filter(f.match).map((o) => ({
    key: String(o.index), ref: o, chosen: chosen.indexOf(o.index) + 1 || 0, disabled: full && !chosen.includes(o.index) && req.max > 1,
    ...(tribute && (o.tribute ?? 1) > 1 ? { badge: t('sel.tributeValue', { n: o.tribute ?? 1 }) } : {}),
  }))
  const counter = tribute
    ? t('sel.tributeTotal', { c: total, n: req.min })
    : req.min === req.max ? t('sel.choose', { n: req.max, m: req.options.length }) : t('sel.chooseRange', { min: req.min, n: req.max, m: req.options.length })
  return (
    <Sheet
      testId="req-cards"
      title={t(tribute ? 'sel.tributeTitle' : 'sel.cardsTitle')}
      subtitle={counter}
      aside={<span className="eng-pill" data-tone={ok ? 'ok' : undefined} data-testid="choice-counter">{t('sel.counter', { c: chosen.length, n: req.max === req.min ? req.max : `${req.min}–${req.max}` as unknown as number })}</span>}
      wide
      footer={
        <>
          {cancel ? <EngBtn onClick={cancel} data-testid="choice-cancel">{t('sel.cancel')}</EngBtn> : null}
          <EngBtn primary disabled={!ok} onClick={confirm} data-testid="choice-confirm">{t('sel.confirm')}</EngBtn>
        </>
      }
    >
      {f.show ? <div className="sticky top-0 z-10 bg-surface-1 pb-2"><Input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder={t('sel.search')} aria-label={t('sel.search')} /></div> : null}
      <Grid tiles={tiles} onToggle={toggle} t={t} nameOf={nameOf} />
      {tiles.length === 0 ? <p className="py-6 text-center text-muted">{t('sel.noMatch')}</p> : null}
    </Sheet>
  )
}

/** SELECT_UNSELECT_CARD: una carta alla volta; ogni tocco è già una risposta (il motore rimanda la richiesta aggiornata). */
export function UnselectRequest({ req, onAnswer }: P<'unselect'>) {
  const { nameOf, t } = useNames()
  const f = useFilter([...req.selectable, ...req.selected], nameOf)
  const base = req.selectable.length
  const tiles: Tile[] = [
    ...req.selected.map((o, i) => ({ key: `s${o.index}`, ref: o, chosen: i + 1 })),
    ...req.selectable.filter(f.match).map((o) => ({ key: `c${o.index}`, ref: o })),
  ]
  const toggle = (key: string) => {
    playSound('targetSelect')
    const n = Number(key.slice(1))
    // il core numera le carte da togliere dopo quelle scegliibili
    onAnswer(answerUnselect(key[0] === 's' ? base + n : n))
  }
  const finish = req.canFinish ? () => (playSound('targetConfirm'), onAnswer(answerUnselect(null))) : undefined
  const cancel = !req.canFinish && req.canCancel ? () => onAnswer(answerUnselect(null)) : undefined
  useRequestKeys({ enter: finish, escape: cancel ?? finish })
  return (
    <Sheet
      testId="req-unselect"
      title={t('sel.unselectTitle')}
      subtitle={t('sel.unselectCount', { c: req.selected.length, min: req.min, max: req.max })}
      aside={<span className="eng-pill" data-tone={req.canFinish ? 'ok' : undefined}>{req.selected.length} / {req.max}</span>}
      wide
      footer={
        finish ? <EngBtn primary onClick={finish} data-testid="unselect-finish">{t('sel.finish')}</EngBtn>
        : cancel ? <EngBtn onClick={cancel} data-testid="unselect-cancel">{t('sel.cancel')}</EngBtn> : undefined
      }
    >
      {f.show ? <div className="sticky top-0 z-10 bg-surface-1 pb-2"><Input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder={t('sel.search')} aria-label={t('sel.search')} /></div> : null}
      <Grid tiles={tiles} onToggle={toggle} t={t} nameOf={nameOf} />
    </Sheet>
  )
}

/** SELECT_SUM: totale parziale con validazione (anche con carte a due valori). */
export function SumRequest({ req, onAnswer }: P<'sum'>) {
  const { nameOf, t } = useNames()
  const [chosen, setChosen] = useState<number[]>([])
  const f = useFilter(req.options, nameOf)
  const status = useMemo(
    () => sumStatus(req.amount, req.exact, [...req.mustSelect.map((o) => o.value), ...chosen.map((i) => req.options.find((o) => o.index === i)!.value)]),
    [chosen, req],
  )
  const count = req.mustSelect.length + chosen.length
  const inRange = count >= req.min && (req.max === 0 || count <= req.max)
  const ok = status.ok && inRange
  const toggle = (key: string) => {
    const idx = Number(key)
    playSound('targetSelect')
    setChosen((c) => (c.includes(idx) ? c.filter((x) => x !== idx) : [...c, idx]))
  }
  const confirm = () => ok && (playSound('targetConfirm'), onAnswer(answerSum(chosen)))
  useRequestKeys({ enter: confirm })
  const valueLabel = (v: number) => t('sel.sumValue', { n: valuesOf(v).join('/') as unknown as number })
  const must: Tile[] = req.mustSelect.map((o) => ({ key: `m${o.index}`, ref: o, chosen: -1, disabled: false, badge: valueLabel(o.value), label: t('sel.sumMust') }))
  const opts: Tile[] = req.options.filter(f.match).map((o) => ({ key: String(o.index), ref: o, chosen: chosen.indexOf(o.index) + 1 || 0, badge: valueLabel(o.value) }))
  return (
    <Sheet
      testId="req-sum"
      title={t('sel.sumTitle')}
      subtitle={status.over ? t('sel.sumOver', { n: req.amount }) : status.ok ? t('sel.sumOk') : undefined}
      aside={<span className="eng-pill" data-tone={status.ok ? 'ok' : status.over ? 'warn' : undefined} data-testid="sum-total">{t('sel.sumTotal', { c: status.shown, n: req.amount })}</span>}
      wide
      footer={
        <>
          <EngBtn onClick={() => setChosen([])} disabled={chosen.length === 0} data-testid="sum-clear">{t('sel.clear')}</EngBtn>
          <EngBtn primary disabled={!ok} onClick={confirm} data-testid="sum-confirm">{t('sel.confirm')}</EngBtn>
        </>
      }
    >
      {must.length ? (
        <>
          <h3 className="px-1 pb-1 text-sm font-semibold text-muted">{t('sel.sumMust')}</h3>
          <Grid tiles={must.map((x) => ({ ...x, chosen: 0 }))} onToggle={() => undefined} t={t} nameOf={nameOf} />
        </>
      ) : null}
      <h3 className="px-1 pb-1 pt-2 text-sm font-semibold text-muted">{t('sel.sumPick')}</h3>
      {f.show ? <div className="sticky top-0 z-10 bg-surface-1 pb-2"><Input value={f.q} onChange={(e) => f.setQ(e.target.value)} placeholder={t('sel.search')} aria-label={t('sel.search')} /></div> : null}
      <Grid tiles={opts} onToggle={toggle} t={t} nameOf={nameOf} />
    </Sheet>
  )
}

/** SELECT_COUNTER: distribuzione dei segnalini fra le carte. */
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
              <span className="block truncate text-[15px] font-medium">{nameOf(o.code)}</span>
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
