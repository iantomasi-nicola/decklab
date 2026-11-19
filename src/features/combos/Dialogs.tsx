import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { PlayerIdx } from '@/domain/combo/types'
import type { Card } from '@/domain/types'
import { searchCards } from '@/features/cards/api'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Field, Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import type { Option } from './actions'
import { CardFace } from './CardFace'
import { cardInfo } from './cardKind'
import { useCards } from './useCards'
import type { Dest } from './zones'

/* ---------------------------------------------------------------- LP */
export function LpDialog({ p, current, onClose, onApply }: { p: PlayerIdx; current: number; onClose: () => void; onApply: (delta: number) => void }) {
  const { t } = useTranslation()
  const [v, setV] = useState('')
  const delta = Number.parseInt(v, 10)
  const ok = Number.isFinite(delta) && delta !== 0
  const presets = [-2000, -1000, -500, -100, 100, 500, 1000]
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(p === 0 ? 'combos.lp.titleOwn' : 'combos.lp.titleOpp')}
      description={t('combos.lp.current', { lp: current })}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onApply(delta)} data-testid="lp-apply">
            {t('combos.lp.apply')}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) onApply(delta)
        }}
        className="flex flex-col gap-4"
      >
        <Field label={t('combos.lp.delta')} hint={t('combos.lp.deltaHint')}>
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} inputMode="numeric" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="-1000" data-testid="lp-delta" />
          )}
        </Field>
        <div className="flex flex-wrap gap-2">
          {presets.map((n) => (
            <Button key={n} className="min-w-20 tabular-nums" onClick={() => setV(String(n))}>
              {n > 0 ? `+${n}` : n}
            </Button>
          ))}
        </div>
      </form>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- segnalini */
export function CounterDialog({ onClose, onApply }: { onClose: () => void; onApply: (type: string, delta: number) => void }) {
  const { t } = useTranslation()
  const [type, setType] = useState('spell')
  const [n, setN] = useState('1')
  const delta = Number.parseInt(n, 10)
  const ok = type.trim() !== '' && Number.isFinite(delta) && delta !== 0
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('combos.counter.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onApply(type.trim(), delta)}>
            {t('combos.counter.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('combos.counter.type')}>
          {({ id }) => <Input id={id} value={type} onChange={(e) => setType(e.target.value)} />}
        </Field>
        <Field label={t('combos.counter.delta')} hint={t('combos.counter.deltaHint')}>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ---------------------------------------------------------------- Sposta in… (alternativa da tastiera) */
export function destLabel(t: TFunction, d: Dest, nameOfUid: (uid: string) => string): string {
  if (d.t === 'zone') return t(`combos.dest.${d.loc}`, { n: d.seq + 1 })
  if (d.t === 'pile') return t(`combos.pile.${d.loc}`)
  return t('combos.dest.onCard', { name: nameOfUid(d.uid) })
}

export function MoveToDialog({
  title,
  dests,
  optionsFor,
  nameOfUid,
  onClose,
  onRun,
}: {
  title: string
  dests: Dest[]
  optionsFor: (d: Dest) => Option[]
  nameOfUid: (uid: string) => string
  onClose: () => void
  onRun: (opt: Option) => void
}) {
  const { t } = useTranslation()
  const [stage, setStage] = useState<Dest | null>(null)
  const opts = stage ? optionsFor(stage) : []
  const btn = 'flex min-h-11 w-full cursor-pointer items-center rounded-sm border border-line bg-surface-2 px-3 text-left text-[15px] text-fg hover:bg-surface-3'
  const pick = (d: Dest) => {
    const o = optionsFor(d)
    if (o.length === 1) {
      onRun(o[0]!)
      return
    }
    setStage(d)
  }
  const groups: [string, Dest[]][] = [
    ['mzone', dests.filter((d) => d.t === 'zone' && (d.loc === 'mzone' || d.loc === 'emz'))],
    ['szone', dests.filter((d) => d.t === 'zone' && (d.loc === 'szone' || d.loc === 'fzone'))],
    ['pile', dests.filter((d) => d.t === 'pile')],
    ['card', dests.filter((d) => d.t === 'card')],
  ]
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={stage ? destLabel(t, stage, nameOfUid) : title} description={stage ? title : t('combos.moveHint')}>
      {stage ? (
        <div className="flex flex-col gap-2" role="group" aria-label={t('combos.chooseAction')}>
          {opts.map((o) => (
            <button key={o.id} type="button" className={btn} data-action={o.id} onClick={() => onRun(o)}>
              {t(`combos.act.${o.id}`)}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setStage(null)}>
            {t('combos.back')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([g, list]) =>
            list.length ? (
              <section key={g} aria-label={t(`combos.destGroup.${g}`)}>
                <h3 className="mb-2 text-sm font-medium text-muted">{t(`combos.destGroup.${g}`)}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {list.map((d) => (
                    <button key={JSON.stringify(d)} type="button" className={btn} onClick={() => pick(d)} data-dest={d.t === 'zone' ? `${d.loc}:${d.seq}` : d.t === 'pile' ? d.loc : d.uid}>
                      {destLabel(t, d, nameOfUid)}
                    </button>
                  ))}
                </div>
              </section>
            ) : null,
          )}
          {dests.length === 0 ? <p className="text-muted">{t('combos.noDest')}</p> : null}
        </div>
      )}
    </Dialog>
  )
}

/* ---------------------------------------------------------------- aggiungi carta / token */
export type AddDest = 'hand' | 'mzone' | 'szone' | 'gy' | 'banished'

export function AddCardDialog({
  p,
  onClose,
  onAdd,
}: {
  p: PlayerIdx
  onClose: () => void
  onAdd: (a: { code: number; dest: AddDest; token: boolean }) => void
}) {
  const { t } = useTranslation()
  const { lang, nameOf } = useCards()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Card[]>([])
  const [chosen, setChosen] = useState<Card | null>(null)
  const [dest, setDest] = useState<AddDest>(p === 0 ? 'mzone' : 'hand')
  const [token, setToken] = useState(false)
  const listId = useId()
  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return
    }
    let live = true
    const h = setTimeout(() => {
      void searchCards(q, { limit: 12, lang }).then((r) => live && setResults(r))
    }, 150)
    return () => {
      live = false
      clearTimeout(h)
    }
  }, [q, lang])
  const isToken = chosen ? token || cardInfo(chosen).token : false
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t(p === 0 ? 'combos.add.titleOwn' : 'combos.add.titleOpp')}
      description={t('combos.add.hint')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!chosen} onClick={() => chosen && onAdd({ code: chosen.id, dest, token: isToken })} data-testid="add-confirm">
            {t('combos.add.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('combos.add.search')}>
          {({ id }) => <Input id={id} autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-controls={listId} data-testid="add-search" />}
        </Field>
        <ul id={listId} className="flex max-h-56 flex-col gap-1 overflow-y-auto" aria-label={t('combos.add.results')}>
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={chosen?.id === c.id}
                onClick={() => setChosen(c)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-sm border border-transparent px-2 text-left text-[15px] hover:bg-surface-2 aria-pressed:border-accent-text aria-pressed:bg-accent-soft"
              >
                <span className="w-7 shrink-0">
                  <CardFace code={c.id} name={nameOf(c.id)} />
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name[lang] ?? c.name.en}</span>
              </button>
            </li>
          ))}
        </ul>
        <Field label={t('combos.add.dest')}>
          {() => (
            <Segmented<AddDest>
              label={t('combos.add.dest')}
              value={dest}
              onValueChange={setDest}
              options={(['hand', 'mzone', 'szone', 'gy', 'banished'] as AddDest[]).map((v) => ({ value: v, label: t(`combos.add.d.${v}`) }))}
              className="flex-wrap"
            />
          )}
        </Field>
        {p === 0 ? (
          <Switch checked={isToken} onCheckedChange={setToken} label={t('combos.add.token')} />
        ) : null}
      </div>
    </Dialog>
  )
}
