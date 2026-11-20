/**
 * Scelta di carte (SELECT_CARD / SELECT_TRIBUTE / SELECT_UNSELECT_CARD / SELECT_SUM) SUL CAMPO: i candidati sono evidenziati sul posto
 * (anello, il resto attenuato), si tocca direttamente la carta, una barra sottile in flusso sotto il campo mostra il contatore live e
 * Conferma/Annulla (≥48px). Le carte che non sono sul campo (Cimitero, Deck, materiali…) stanno in una fascia compatta ridimensionabile.
 * Nessuna griglia a tutto schermo, nessuno scuro sopra il campo.
 */
import { useEffect, useMemo } from 'react'
import { answerCards, answerSum, answerUnselect } from '@/engine/answers'
import type { Answer } from '@/engine/protocol'
import type { Opt, PendingRequest } from '@/engine/requests'
import type { Uid } from '@/domain/combo/types'
import { PickBand, PickBar, useFieldPick, usePickUi, type BandItem, type FieldPickSpec, useFpT, type FpT } from '@/features/fieldpick'
import { playSound } from '@/features/sound'
import { useDuel, type RequestSource } from '../duelStore'
import { sumStatus, valuesOf } from '../sum'
import { useNames } from './parts'
import type { EngT } from '../strings'

type Of<K extends PendingRequest['kind']> = Extract<PendingRequest, { kind: K }>
interface P<K extends PendingRequest['kind']> { req: Of<K>; onAnswer: (a: Answer) => void }

/** Posizioni in cui la carta si vede sul campo (la mano propria sta sempre sotto il campo). */
const VISIBLE_LOCS = new Set(['mzone', 'emz', 'szone', 'fzone', 'hand'])
export const onField = (o: Opt): boolean => VISIBLE_LOCS.has(o.place.loc)

function useSourceInfo() {
  const source = useDuel((s) => s.source)
  const registry = useDuel((s) => s.view?.registry)
  const { nameOf } = useNames()
  return { source, hostName: source ? nameOf(registry?.[source.uid] ?? 0) : '' }
}

/** Etichetta del contatore e titolo in base all'azione che ha aperto la richiesta. */
function labelsFor(source: RequestSource | null, hostName: string, t: FpT, tribute: boolean): { label: string; title: string } {
  if (tribute) return { label: t('lbl.tribute'), title: hostName && source?.kind === 'summon' ? t('title.tributeFor', { name: hostName }) : t('title.tribute') }
  if (source?.kind === 'specialSummon') return { label: t('lbl.materials'), title: hostName ? t('title.materialsFor', { name: hostName }) : t('title.materials') }
  return { label: t('lbl.cards'), title: hostName ? hostName : t('title.cards') }
}

const locKey = (o: Opt, t: EngT): string => {
  const l = o.place.loc
  return l === 'gy' ? t('sel.inGy') : l === 'banished' ? t('sel.inBanished') : l === 'deck' ? t('sel.inDeck') : l === 'extra' ? t('sel.inExtra') : l === 'overlay' ? t('sel.inOverlay') : t('sel.visibleOnBoard')
}
function bandTitle(off: readonly Opt[], t: EngT, fp: FpT): string {
  const names = new Set(off.map((o) => locKey(o, t)))
  return names.size === 1 ? [...names][0]! : fp('band.offField')
}

/** Fascia con i candidati fuori dal campo (null se sono tutti sul campo). */
function OffFieldBand({ off, items, onTap, sub }: { off: readonly Opt[]; items: BandItem[]; onTap: (uid: Uid) => void; sub?: string | undefined }) {
  const { t } = useNames()
  const { t: fp } = useFpT()
  if (!off.length) return null
  return <PickBand title={bandTitle(off, t, fp)} sub={sub} items={items} onTap={(k) => onTap(k)} searchable={off.length > 12} testId="pick-band" />
}

/** SELECT_CARD / SELECT_TRIBUTE */
export function CardsPick({ req, onAnswer }: P<'cards'>) {
  const { nameOf } = useNames()
  const { t: fp } = useFpT()
  const { source, hostName } = useSourceInfo()
  const single = useDuel((s) => s.prefs.single)
  const tribute = req.mode === 'tribute'
  const byUid = useMemo(() => new Map(req.options.map((o) => [o.uid, o])), [req.options])
  const max = Math.max(1, Math.min(req.max, req.options.length))
  const min = tribute ? 0 : Math.min(req.min, max)
  const value = (u: Uid) => byUid.get(u)?.tribute ?? 1
  // candidati esattamente quelli richiesti (con "scelte uniche automatiche" spenta): già scelti, resta solo Conferma
  const exact = !tribute && req.min > 0 && req.min === req.max && req.options.length === req.min && !single
  const pick = useFieldPick({
    candidates: req.options.map((o) => o.uid), min, max,
    ...(exact ? { preselected: req.options.map((o) => o.uid) } : {}),
    cancelable: req.canCancel,
    confirmOnPick: !tribute && max === 1 && min === 1,
    validate: tribute ? (sel) => sel.reduce((s, u) => s + value(u), 0) >= req.min && sel.length <= req.max : undefined,
    onConfirm: (sel) => onAnswer(answerCards(req, sel.map((u) => byUid.get(u)!.index))),
    onCancel: () => onAnswer(answerCards(req, null)),
    onFull: (n) => void n,
  })
  const { label, title } = labelsFor(source, hostName, fp, tribute)
  const total = pick.selected.reduce((s, u) => s + value(u), 0)
  const count = tribute
    ? fp('lbl.chosen', { label, c: total, n: req.min })
    : req.min === req.max ? fp('lbl.chosen', { label, c: pick.selected.length, n: req.max }) : fp('lbl.chosenRange', { label, c: pick.selected.length, min: req.min, n: req.max })
  const off = req.options.filter((o) => !onField(o))
  const items: BandItem[] = off.map((o) => ({
    key: o.uid, code: o.code, name: nameOf(o.code),
    state: pick.selected.includes(o.uid) ? 'chosen' : 'cand', order: pick.selected.includes(o.uid) && pick.state.max > 1 ? pick.selected.indexOf(o.uid) + 1 : undefined,
    badge: tribute && value(o.uid) > 1 ? `×${value(o.uid)}` : undefined,
  }))
  return (
    <>
      <OffFieldBand off={off} items={items} onTap={pick.toggle} />
      <PickBar title={title} count={count} ok={pick.canConfirm} onConfirm={pick.confirm} onCancel={pick.cancel} onUndo={pick.state.max > 1 ? pick.undo : undefined} canUndo={pick.selected.length > 0} />
    </>
  )
}

/** SELECT_UNSELECT_CARD: ogni tocco è già una risposta del core (carta scelta o tolta); il core rimanda la richiesta aggiornata. */
export function UnselectPick({ req, onAnswer }: P<'unselect'>) {
  const { nameOf } = useNames()
  const { t: fp } = useFpT()
  const { source, hostName } = useSourceInfo()
  const single = useDuel((s) => s.prefs.single)
  const base = req.selectable.length
  const all = useMemo(() => [...req.selectable, ...req.selected], [req])
  const toggle = (uid: Uid) => {
    const sIdx = req.selected.findIndex((o) => o.uid === uid)
    if (sIdx >= 0) onAnswer(answerUnselect(base + sIdx))
    else {
      const c = req.selectable.find((o) => o.uid === uid)
      if (c) onAnswer(answerUnselect(c.index))
    }
    playSound('targetSelect')
  }
  const finish = () => { playSound('targetConfirm'); onAnswer(answerUnselect(null)) }
  const cancel = !req.canFinish && req.canCancel ? () => onAnswer(answerUnselect(null)) : undefined
  const undo = req.selected.length ? () => toggle(req.selected[req.selected.length - 1]!.uid) : undefined

  // scelta obbligata (una sola carta ancora scegliibile e non si può ancora finire, oppure nulla da aggiungere): la fa il motore
  useEffect(() => {
    if (!single) return
    if (!req.canFinish && req.selectable.length === 1) {
      const id = setTimeout(() => onAnswer(answerUnselect(req.selectable[0]!.index)), 0)
      return () => clearTimeout(id)
    }
    if (req.canFinish && req.selectable.length === 0) {
      const id = setTimeout(() => onAnswer(answerUnselect(null)), 0)
      return () => clearTimeout(id)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const spec = useMemo<FieldPickSpec>(() => {
    const order = new Map<Uid, number>()
    req.selected.forEach((o, i) => order.set(o.uid, i + 1))
    return { candidates: new Set(all.map((o) => o.uid)), chosen: new Set(req.selected.map((o) => o.uid)), order, numbered: true, toggle }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])
  useEffect(() => {
    usePickUi.setState({ spec })
    return () => usePickUi.setState({ spec: null })
  }, [spec])
  // tastiera: Invio = Fine, Esc = Annulla, Backspace = togli l'ultima
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'Enter' && req.canFinish && (e.ctrlKey || el?.tagName !== 'BUTTON')) { e.preventDefault(); finish() }
      else if (e.key === 'Escape' && cancel) { e.preventDefault(); e.stopPropagation(); cancel() }
      else if (e.key === 'Backspace' && undo) { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req])

  const { label, title } = labelsFor(source, hostName, fp, false)
  const off = all.filter((o) => !onField(o))
  const selUids = new Set(req.selected.map((o) => o.uid))
  const items: BandItem[] = off.map((o) => ({ key: o.uid, code: o.code, name: nameOf(o.code), state: selUids.has(o.uid) ? 'chosen' : 'cand', order: selUids.has(o.uid) ? req.selected.findIndex((x) => x.uid === o.uid) + 1 : undefined }))
  return (
    <>
      <OffFieldBand off={off} items={items} onTap={toggle} />
      <PickBar
        title={title} count={fp('lbl.chosenOpen', { label, c: req.selected.length })} ok={req.canFinish}
        onConfirm={finish} onCancel={cancel} onUndo={undo} canUndo={!!undo}
      />
    </>
  )
}

/** SELECT_SUM: totale parziale live (es. "Livello 6/8"), anche con carte a due valori. */
export function SumPick({ req, onAnswer }: P<'sum'>) {
  const { nameOf } = useNames()
  const { t: fp } = useFpT()
  const { source, hostName } = useSourceInfo()
  const byUid = useMemo(() => new Map(req.options.map((o) => [o.uid, o])), [req.options])
  const must = useMemo(() => new Set(req.mustSelect.map((o) => o.uid)), [req.mustSelect])
  const candidates = useMemo(() => [...req.mustSelect, ...req.options].map((o) => o.uid), [req])
  const valueOf = (u: Uid) => (byUid.get(u) ?? req.mustSelect.find((o) => o.uid === u))?.value ?? 0
  const statusOf = (sel: readonly Uid[]) => sumStatus(req.amount, req.exact, sel.map(valueOf))
  const inRange = (sel: readonly Uid[]) => sel.length >= req.min && (req.max === 0 || sel.length <= req.max)
  const pick = useFieldPick({
    candidates, min: 0, max: candidates.length, preselected: [...must], locked: must, cancelable: false,
    validate: (sel) => statusOf(sel).ok && inRange(sel),
    onConfirm: (sel) => onAnswer(answerSum(sel.filter((u) => !must.has(u)).map((u) => byUid.get(u)!.index))),
  })
  const status = statusOf(pick.selected)
  const label = source && (source.kind === 'specialSummon' || source.kind === 'activate' || source.kind === 'summon') ? fp('lbl.level') : fp('lbl.cards')
  const off = [...req.mustSelect, ...req.options].filter((o) => !onField(o))
  const items: BandItem[] = off.map((o) => ({
    key: o.uid, code: o.code, name: nameOf(o.code), state: pick.selected.includes(o.uid) ? 'chosen' : 'cand',
    order: pick.selected.includes(o.uid) ? pick.selected.indexOf(o.uid) + 1 : undefined, badge: valuesOf(o.value).join('/'),
  }))
  return (
    <>
      <OffFieldBand off={off} items={items} onTap={pick.toggle} />
      <PickBar
        title={hostName ? fp('title.materialsFor', { name: hostName }) : fp('title.sum')} count={fp('lbl.chosen', { label, c: status.shown, n: req.amount })}
        ok={pick.canConfirm} warn={status.over} onConfirm={pick.confirm} onUndo={pick.undo} canUndo={pick.selected.some((u) => !must.has(u))}
      />
    </>
  )
}
