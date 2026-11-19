/**
 * Campo interattivo: drag & drop (@dnd-kit/core, mouse + touch), due tocchi, menu contestuale, "Sposta in…"
 * da tastiera. Ogni azione diventa una bozza di passo (`Draft`) applicata dallo store.
 */
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { type ComboDoc, type Move, type Place, type PlayerIdx, type Uid } from '@/domain/combo/types'
import { ownerOfUid, type GameState, type NPlace } from '@/domain/combo/state'
import { Button } from '@/ui/Button'
import { toast } from '@/ui/Toast'
import {
  activateOption, destinations, optionsFor, pickByModifier, positionOptions,
  type Ctx, type Follow, type Option, type Src, type StepDraft,
} from './actions'
import { CardFace } from './CardFace'
import { cardInfo, UNKNOWN_INFO, type CardInfo } from './cardKind'
import { AddCardDialog, CounterDialog, LpDialog, MoveToDialog, type AddDest } from './Dialogs'
import { useEditor } from './editorStore'
import { Field, type FieldView } from './Field'
import { nextUid, remainingPool, poolTotal, type Draft } from './model'
import { PileSheet } from './PileSheet'
import { PopMenu, type PopItem } from './PopMenu'
import type { Sel } from './selection'
import { useCards } from './useCards'
import { destKey, freeSeq, occupantAt, parseDest, pileSeq, type Dest, type PileLoc } from './zones'

const clean = (pl: NPlace): Place => {
  const out: Place = { p: pl.p, loc: pl.loc }
  if (pl.seq !== undefined) out.seq = pl.seq
  if (pl.pos !== undefined) out.pos = pl.pos
  if (pl.host !== undefined) out.host = pl.host
  return out
}

const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : rectIntersection(args)
}

/* ultima scelta ricordata per carta e tipo di destinazione */
const LAST_KEY = 'combolab.combo.lastChoice'
const lastChoice: Record<string, string> = (() => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
})()
const choiceKey = (code: number, d: Dest) => `${code}:${d.t === 'card' ? 'card' : d.loc}`
function remember(code: number, d: Dest, id: string) {
  lastChoice[choiceKey(code, d)] = id
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(lastChoice))
  } catch {
    /* storage non disponibile */
  }
}
const sortByChoice = (opts: Option[], code: number, d: Dest): Option[] => {
  const id = lastChoice[choiceKey(code, d)]
  const first = opts.find((o) => o.id === id)
  return first ? [first, ...opts.filter((o) => o !== first)] : opts
}

type Pending =
  | { kind: 'tribute'; sel: Sel; opt: Option; need: number; chosen: Uid[] }
  | { kind: 'materials'; stepId: string; host: Uid; xyz: boolean; fromHand: boolean; chosen: Uid[] }

interface MenuState { x: number; y: number; title: string; items: PopItem[] }

export interface BoardHandle {
  addCard: (p: PlayerIdx) => void
  deckToHand: () => void
}

export function Board({
  doc,
  state,
  mode,
  cursor,
  readOnly,
  handle,
}: {
  doc: ComboDoc
  state: GameState
  mode: 'setup' | 'steps'
  cursor: number
  readOnly?: boolean
  handle?: Ref<BoardHandle>
}) {
  const { t } = useTranslation()
  const cards = useCards()
  const [sel, setSel] = useState<Sel | null>(null)
  const [dragSel, setDragSel] = useState<Sel | null>(null)
  const [dragSize, setDragSize] = useState(60)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [sheet, setSheet] = useState<{ p: PlayerIdx; loc: PileLoc; forDrop: { dest: Dest; x: number; y: number; mods: Mods } | null } | null>(null)
  const [moveFor, setMoveFor] = useState<Sel | null>(null)
  const [lpFor, setLpFor] = useState<PlayerIdx | null>(null)
  const [counterFor, setCounterFor] = useState<Uid | null>(null)
  const [addFor, setAddFor] = useState<PlayerIdx | null>(null)
  const [live, setLive] = useState('')
  const mods = useRef<Mods>({})
  const suppress = useRef(false)
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointer = useRef({ x: 0, y: 0 })

  useImperativeHandle(handle, () => ({
    addCard: (p) => setAddFor(p),
    deckToHand: () => setSheet({ p: 0, loc: 'deck', forDrop: { dest: { t: 'pile', p: 0, loc: 'hand' }, x: window.innerWidth / 2, y: window.innerHeight / 2, mods: {} } }),
  }))

  const infoOf = useCallback((uid: Uid): CardInfo => cardInfo(cards.byId(doc.cards[uid] ?? 0)), [cards, doc.cards])
  const ctx: Ctx = useMemo(() => ({ state, infoOf, mode }), [state, infoOf, mode])
  const pool = useMemo(() => remainingPool(doc), [doc])

  const view: FieldView = useMemo(
    () => ({
      state,
      registry: doc.cards,
      nameOf: cards.nameOf,
      unrevealed: { deck: poolTotal(pool.main), extra: poolTotal(pool.extra) },
      randomHand:
        doc.setup.hand.fill === 'random' && (mode === 'setup' || cursor === 0)
          ? Math.max(0, doc.setup.hand.size - doc.setup.hand.required.length)
          : 0,
    }),
    [state, doc, cards.nameOf, pool, mode, cursor],
  )

  // ---------- origine
  const srcOf = useCallback(
    (s: Sel | null): Src | null => {
      if (!s) return null
      if (s.kind === 'uid') {
        const place = state.places[s.uid]
        return place ? { uid: s.uid, place, info: infoOf(s.uid) } : null
      }
      const info = cardInfo(cards.byId(s.code))
      return { uid: nextUid(doc, s.p), place: { p: s.p, loc: s.loc }, info, fresh: true }
    },
    [state, infoOf, cards, doc],
  )
  const codeOf = (s: Sel) => (s.kind === 'uid' ? (doc.cards[s.uid] ?? 0) : s.code)

  const active = dragSel ?? sel
  const highlight = useMemo(() => {
    if (pending || readOnly) return null
    if (dragSel === null && sel === null) return null
    const src = srcOf(active)
    if (!src) return null
    // carta ancora da scegliere (rilascio dal Deck/Extra): unione delle destinazioni dei tipi possibili
    const variants: CardInfo[] =
      active?.kind === 'fresh' && active.code === 0
        ? active.loc === 'extra'
          ? [{ ...UNKNOWN_INFO, extra: 'fusion' }]
          : [UNKNOWN_INFO, { ...UNKNOWN_INFO, kind: 'spell' }]
        : [src.info]
    return new Set(variants.flatMap((info) => destinations({ ...src, info }, ctx)).map(destKey))
  }, [active, dragSel, sel, srcOf, ctx, pending, readOnly])

  const announce = useCallback((msg: string) => setLive(msg), [])

  // ---------- esecuzione
  const execute = useCallback(
    (selection: Sel, opt: Option) => {
      const src = srcOf(selection)
      if (!src) return
      const step: StepDraft = { ...opt.draft }
      if (step.action === 'custom' && mode === 'steps') step.label = t(`combos.act.${opt.id}`)
      const draft: Draft = { step }
      if (selection.kind === 'fresh') draft.register = { [src.uid]: selection.code }
      const name = cards.nameOf(codeOf(selection))
      const store = useEditor.getState()
      setSel(null)
      if (opt.follow?.kind === 'tribute' && mode === 'steps') {
        setPending({ kind: 'tribute', sel: selection, opt, need: opt.follow.need, chosen: [] })
        announce(t('combos.pick.tributeHint', { count: opt.follow.need }))
        return
      }
      const id = store.apply(draft)
      announce(t('combos.announce.done', { action: t(`combos.act.${opt.id}`), card: name }))
      if (opt.follow?.kind === 'materials' && id && mode === 'steps') {
        const f: Follow = opt.follow
        setPending({ kind: 'materials', stepId: id, host: src.uid, xyz: f.kind === 'materials' && f.xyz, fromHand: opt.id === 'ritualSummon', chosen: [] })
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [srcOf, mode, cards.nameOf, t, announce, doc],
  )

  const dropOn = useCallback(
    (selection: Sel, dest: Dest, at: { x: number; y: number }, m: Mods) => {
      const src = srcOf(selection)
      if (!src) return
      const code = codeOf(selection)
      const opts = sortByChoice(optionsFor(src, dest, ctx), code, dest)
      if (!opts.length) {
        toast(t('combos.noOption'))
        return
      }
      const run = (o: Option) => {
        remember(code, dest, o.id)
        execute(selection, o)
      }
      const byMod = mode === 'steps' ? pickByModifier(opts, m) : null
      if (byMod) return run(byMod)
      if (opts.length === 1) return run(opts[0]!)
      setMenu({
        x: at.x,
        y: at.y,
        title: cards.nameOf(code),
        items: opts.map((o) => ({ id: o.id, label: t(`combos.act.${o.id}`), onSelect: () => run(o) })),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [srcOf, ctx, mode, execute, t, cards.nameOf],
  )

  const resolveDest = useCallback(
    (d: Dest): Dest => {
      if (d.t === 'zone') {
        const occ = occupantAt(state, d.p, d.loc, d.seq) ?? (d.loc === 'emz' ? occupantAt(state, 1, 'emz', d.seq) : undefined)
        if (occ && highlight?.has(`c:${occ}`)) return { t: 'card', uid: occ }
      }
      return d
    },
    [state, highlight],
  )

  const center = (el: Element) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  // ---------- gestione carte
  const openMenu = useCallback(
    (uid: Uid, x: number, y: number) => {
      const s: Sel = { kind: 'uid', uid }
      const src = srcOf(s)
      if (!src) return
      const code = doc.cards[uid] ?? 0
      const items: PopItem[] = []
      const act = activateOption(src, ctx)
      if (act) items.push({ id: 'activate', label: t('combos.act.activate'), onSelect: () => execute(s, act) })
      for (const o of positionOptions(src, ctx)) items.push({ id: o.id, label: t(`combos.act.${o.id}`), onSelect: () => execute(s, o) })
      const quick = (loc: PileLoc, id: string) => {
        const d: Dest = { t: 'pile', p: src.place.p, loc }
        if (!destinations(src, ctx).some((x) => destKey(x) === destKey(d))) return
        const o = optionsFor(src, d, ctx)[0]
        if (o) items.push({ id: `q-${id}`, label: t(`combos.act.${o.id}`), onSelect: () => execute(s, o) })
      }
      quick('gy', 'gy')
      quick('banished', 'ban')
      quick('hand', 'hand')
      items.push({ id: 'moveTo', label: t('combos.moveTo'), onSelect: () => setMoveFor(s) })
      items.push({ id: 'counter', label: t('combos.counter.menu'), onSelect: () => setCounterFor(uid) })
      for (const ov of Object.entries(state.places).filter(([, pl]) => pl.loc === 'overlay' && pl.host === uid)) {
        const [ouid, opl] = ov
        const to: Place = { p: opl.p, loc: 'gy', seq: pileSeq(state, opl.p, 'gy') }
        items.push({
          id: `detach-${ouid}`,
          label: t('combos.act.detach', { name: cards.nameOf(doc.cards[ouid] ?? 0) }),
          onSelect: () =>
            useEditor.getState().apply({ step: { action: 'detach', card: uid, targets: [ouid], from: clean(opl), to, moves: [{ uid: ouid, from: clean(opl), to, why: 'cost' }] } }),
        })
      }
      if (mode === 'setup' || !doc.steps.some((st) => st.card === uid || st.moves.some((m) => m.uid === uid))) {
        items.push({
          id: 'remove',
          label: t('combos.removeCard'),
          danger: true,
          onSelect: () => {
            if (!useEditor.getState().removeCard(uid)) toast(t('combos.removeBlocked'))
          },
        })
      }
      setMenu({ x, y, title: cards.nameOf(code), items })
    },
    [srcOf, ctx, doc, state, t, execute, cards, mode],
  )

  const activate = useCallback(
    (uid: Uid) => {
      const src = srcOf({ kind: 'uid', uid })
      if (!src) return
      const o = activateOption(src, ctx)
      if (o) execute({ kind: 'uid', uid }, o)
    },
    [srcOf, ctx, execute],
  )

  const togglePick = (uid: Uid) => {
    setPending((p) => {
      if (!p) return p
      const chosen = p.chosen.includes(uid) ? p.chosen.filter((u) => u !== uid) : [...p.chosen, uid]
      return { ...p, chosen }
    })
  }

  const candidates = useMemo<Set<Uid>>(() => {
    const out = new Set<Uid>()
    if (!pending) return out
    const host = pending.kind === 'materials' ? pending.host : srcOf(pending.sel)?.uid
    const owner: PlayerIdx = host ? ownerOfUid(host) : 0
    for (const [uid, pl] of Object.entries(state.places)) {
      if (uid === host || pl.p !== owner) continue
      if (pl.loc === 'mzone' || pl.loc === 'emz' || (pending.kind === 'materials' && pending.fromHand && pl.loc === 'hand')) out.add(uid)
    }
    return out
  }, [pending, state, srcOf])

  const confirmPending = () => {
    if (!pending) return
    const store = useEditor.getState()
    if (pending.kind === 'tribute') {
      if (pending.chosen.length === 0) return
      const moves: Move[] = pending.chosen.map((uid, i) => {
        const pl = state.places[uid]!
        return { uid, from: clean(pl), to: { p: pl.p, loc: 'gy', seq: pileSeq(state, pl.p, 'gy', i) }, why: 'tribute' }
      })
      const sel = pending.sel
      const src = srcOf(sel)
      const step: StepDraft = { ...pending.opt.draft, moves: [...moves, ...pending.opt.draft.moves], costs: [{ kind: 'tribute', cards: pending.chosen }] }
      const draft: Draft = { step }
      if (sel.kind === 'fresh' && src) draft.register = { [src.uid]: sel.code }
      store.apply(draft)
      announce(t('combos.announce.done', { action: t('combos.act.tributeSummon'), card: cards.nameOf(codeOf(sel)) }))
    } else {
      const host = state.places[pending.host]
      const cur = store.doc?.steps.find((s) => s.id === pending.stepId)
      if (cur && host && pending.chosen.length) {
        const moves: Move[] = pending.chosen.map((uid, i) => {
          const pl = state.places[uid]!
          const to: Place = pending.xyz ? { p: host.p, loc: 'overlay', seq: i, host: pending.host } : { p: pl.p, loc: 'gy', seq: pileSeq(state, pl.p, 'gy', i) }
          return { uid, from: clean(pl), to, why: 'material' }
        })
        store.patchStep(pending.stepId, { moves: [...moves, ...cur.moves], costs: [...(cur.costs ?? []), { kind: 'material', cards: pending.chosen }] })
      }
    }
    setPending(null)
  }

  // ---------- dnd
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      mods.current = { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }
    }
    const mv = (e: PointerEvent) => {
      lastPointer.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('keydown', k)
    window.addEventListener('keyup', k)
    window.addEventListener('pointermove', mv)
    return () => {
      window.removeEventListener('keydown', k)
      window.removeEventListener('keyup', k)
      window.removeEventListener('pointermove', mv)
    }
  }, [])

  const selOfDrag = (id: string): Sel | null => {
    if (id.startsWith('card:')) return { kind: 'uid', uid: id.slice(5) }
    if (id.startsWith('fresh:')) return null // la carta si sceglie dopo il rilascio
    return null
  }

  const onDragStart = (e: DragStartEvent) => {
    suppress.current = false
    const id = String(e.active.id)
    const r0 = e.active.rect.current.initial
    setDragSize(r0 ? Math.min(r0.width, (r0.height * 59) / 86) : 60)
    setMenu(null)
    const s = selOfDrag(id)
    if (s) {
      setDragSel(s)
      setSel(null)
    } else if (id.startsWith('fresh:')) {
      const [, p, loc] = id.split(':')
      // la carta non è ancora scelta: evidenziamo le destinazioni di un tipo generico
      setDragSel({ kind: 'fresh', p: p === '1' ? 1 : 0, loc: loc === 'extra' ? 'extra' : 'deck', code: 0 })
    }
    const ev = e.activatorEvent
    if (typeof TouchEvent !== 'undefined' && ev instanceof TouchEvent && s?.kind === 'uid') {
      const t0 = ev.touches[0]
      const uid = s.uid
      longPress.current = setTimeout(() => {
        suppress.current = true
        setDragSel(null)
        openMenu(uid, t0?.clientX ?? lastPointer.current.x, t0?.clientY ?? lastPointer.current.y)
      }, 450)
    }
  }
  const stopLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }
  const onDragMove = (e: { delta: { x: number; y: number } }) => {
    if (Math.hypot(e.delta.x, e.delta.y) > 10) stopLongPress()
  }
  const onDragEnd = (e: DragEndEvent) => {
    stopLongPress()
    const fresh = String(e.active.id).startsWith('fresh:')
    const s = dragSel
    setDragSel(null)
    if (suppress.current || !e.over) return
    let dest = parseDest(String(e.over.id))
    if (!dest) return
    const r = e.active.rect.current.translated
    const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : lastPointer.current
    const m = { ...mods.current }
    if (fresh && s?.kind === 'fresh') {
      // verifica grezza: Deck/Extra → qualunque destinazione sensata; la carta si sceglie nel pannello
      if (dest.t === 'zone') {
        const occ = occupantAt(state, dest.p, dest.loc, dest.seq)
        if (occ) return
      }
      setSheet({ p: s.p, loc: s.loc, forDrop: { dest, x: at.x, y: at.y, mods: m } })
      return
    }
    if (!s) return
    const src = srcOf(s)
    if (!src) return
    const valid = new Set(destinations(src, ctx).map(destKey))
    if (dest.t === 'zone') {
      const occ = occupantAt(state, dest.p, dest.loc, dest.seq) ?? (dest.loc === 'emz' ? occupantAt(state, 1, 'emz', dest.seq) : undefined)
      if (occ && valid.has(`c:${occ}`)) dest = { t: 'card', uid: occ }
    }
    if (!valid.has(destKey(dest))) return
    dropOn(s, dest, at, m)
  }
  const onDragCancel = () => {
    stopLongPress()
    setDragSel(null)
  }

  // ---------- Field handlers
  const onCardClick = (uid: Uid) => {
    if (readOnly) return
    setMenu(null)
    if (pending) {
      if (candidates.has(uid)) togglePick(uid)
      return
    }
    if (sel && highlight?.has(`c:${uid}`)) {
      const el = document.querySelector(`[data-card="${CSS.escape(uid)}"]`)
      dropOn(sel, { t: 'card', uid }, el ? center(el) : lastPointer.current, { ...mods.current })
      return
    }
    setSel((cur) => (cur?.kind === 'uid' && cur.uid === uid ? null : { kind: 'uid', uid }))
  }
  const onZone = (d: Dest, el: HTMLElement) => {
    if (!sel) return
    dropOn(sel, resolveDest(d), center(el), { ...mods.current })
  }
  const onCardKey = (uid: Uid, e: KeyboardEvent) => {
    if (readOnly) return
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      setMoveFor({ kind: 'uid', uid })
    } else if (e.key === ' ') {
      e.preventDefault()
      onCardClick(uid)
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      openMenu(uid, r.left + r.width / 2, r.top + r.height / 2)
    }
  }

  // Esc annulla selezione / scelta
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSel(null)
        setPending((p) => (p?.kind === 'tribute' ? null : p))
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const moveSrc = srcOf(moveFor)
  const nameOfUid = (uid: Uid) => cards.nameOf(doc.cards[uid] ?? 0)
  const overlayCode = dragSel ? codeOf(dragSel) : 0

  // ---------- aggiunta carta/token
  const addCard = (p: PlayerIdx, a0: { code: number; dest: AddDest; token: boolean }) => {
    // un token non può essere una carta "necessaria" in mano (non è nel mazzo)
    const a = a0.token && a0.dest === 'hand' ? { ...a0, dest: 'mzone' as AddDest } : a0
    const uid = nextUid(doc, p)
    const to = ((): Place => {
      if (a.dest === 'hand') return { p, loc: 'hand', seq: Object.values(state.places).filter((pl) => pl.p === p && pl.loc === 'hand').length }
      if (a.dest === 'mzone') return { p, loc: 'mzone', seq: freeSeq(state, p, 'mzone') ?? 0, pos: 'FACEUP_ATK' }
      if (a.dest === 'szone') return { p, loc: 'szone', seq: freeSeq(state, p, 'szone', [1, 2, 3, 0, 4]) ?? 0, pos: 'FACEUP' }
      return { p, loc: a.dest, seq: pileSeq(state, p, a.dest) }
    })()
    if ((a.dest === 'mzone' && freeSeq(state, p, 'mzone') === undefined) || (a.dest === 'szone' && freeSeq(state, p, 'szone') === undefined)) {
      toast(t('combos.zoneFull'))
      return
    }
    const why = { hand: 'search', mzone: 'summon', szone: 'other', gy: 'send', banished: 'banish' } as const
    const action = mode === 'setup' ? 'custom' : ({ hand: 'search', mzone: 'specialSummon', szone: 'activate', gy: 'sendToGY', banished: 'banish' } as const)[a.dest]
    const step: StepDraft = { action, card: uid, to, moves: [{ uid, to, why: why[a.dest] }] }
    if (a.dest === 'mzone' && mode === 'steps') step.method = 'effect'
    if (a.dest === 'hand' && mode === 'steps') step.searched = [uid]
    if (a.token) step.x = { token: true }
    const info = cardInfo(cards.byId(a.code))
    const draft: Draft = { step, register: { [uid]: a.code } }
    if (a.token) draft.tokens = [uid]
    else if (p === 0 && ((info.extra ? pool.extra : pool.main).get(a.code) ?? 0) === 0) draft.deckAdd = { code: a.code, extra: !!info.extra }
    useEditor.getState().apply(draft)
    announce(t('combos.announce.added', { card: cards.nameOf(a.code) }))
    setAddFor(null)
  }

  const pickLabel =
    pending?.kind === 'tribute'
      ? t('combos.pick.tribute', { count: pending.need, n: pending.chosen.length })
      : pending?.kind === 'materials'
        ? t(pending.xyz ? 'combos.pick.xyz' : 'combos.pick.materials', { n: pending.chosen.length })
        : null

  return (
    <div className="relative h-full min-h-0">
      {pending && pickLabel ? (
        <div role="status" data-pick-bar className="absolute inset-x-2 top-2 z-30 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-md border border-ok/60 bg-surface-1 px-3 py-2 shadow-2">
          <span className="min-w-0 flex-1 text-[15px] text-fg">{pickLabel}</span>
          <Button variant="primary" onClick={confirmPending} disabled={pending.kind === 'tribute' && pending.chosen.length === 0} data-testid="pick-confirm">
            {t(pending.kind === 'tribute' ? 'combos.pick.confirm' : 'combos.pick.done')}
          </Button>
          <Button onClick={() => setPending(null)}>{t(pending.kind === 'tribute' ? 'common.cancel' : 'combos.pick.skip')}</Button>
        </div>
      ) : sel && !readOnly ? (
        <div role="status" className="pointer-events-none absolute inset-x-2 top-2 z-30 mx-auto max-w-xl rounded-md border border-accent-text/60 bg-surface-1 px-3 py-2 text-[15px] text-fg shadow-2">
          {t('combos.selected', { name: cards.nameOf(codeOf(sel)) })}
        </div>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        autoScroll={false}
      >
        <Field
          view={view}
          ring={mode === 'setup'}
          selected={sel?.kind === 'uid' ? sel.uid : null}
          highlight={highlight}
          picking={pending ? { candidates, chosen: new Set(pending.chosen) } : null}
          onCardClick={onCardClick}
          onCardDouble={(uid) => {
            if (readOnly || pending) return
            setSel(null)
            activate(uid)
          }}
          onCardMenu={(uid, x, y) => !readOnly && openMenu(uid, x, y)}
          onCardKey={onCardKey}
          onZone={onZone}
          onPile={(p, loc) => setSheet({ p, loc, forDrop: null })}
          onLp={(p) => !readOnly && setLpFor(p)}
        />
        <DragOverlay dropAnimation={null}>
          {dragSel && !suppress.current ? (
            <div style={{ width: dragSize }} className="pointer-events-none opacity-90 drop-shadow-lg">
              <CardFace code={overlayCode} name={overlayCode ? cards.nameOf(overlayCode) : ''} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div aria-live="polite" role="status" className="sr-only" data-testid="announcer">{live}</div>

      {menu ? <PopMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} /> : null}

      {sheet ? (
        <PileSheet
          p={sheet.p}
          loc={sheet.loc}
          view={view}
          pool={sheet.p === 0 && sheet.loc === 'deck' ? [...pool.main] : sheet.p === 0 && sheet.loc === 'extra' ? [...pool.extra] : []}
          picking={!!sheet.forDrop}
          onClose={() => setSheet(null)}
          onSelect={(s) => {
            const drop = sheet.forDrop
            setSheet(null)
            if (drop) dropOn(s, drop.dest, drop, drop.mods)
            else {
              setSel(s.kind === 'uid' ? s : null)
              if (s.kind === 'fresh') setMoveFor(s)
              else toast(t('combos.tapZone'))
            }
          }}
          onMove={(s) => {
            setSheet(null)
            setMoveFor(s)
          }}
        />
      ) : null}

      {moveFor && moveSrc ? (
        <MoveToDialog
          title={cards.nameOf(codeOf(moveFor))}
          dests={destinations(moveSrc, ctx)}
          nameOfUid={nameOfUid}
          optionsFor={(d) => sortByChoice(optionsFor(moveSrc, d, ctx), codeOf(moveFor), d)}
          onClose={() => setMoveFor(null)}
          onRun={(o) => {
            remember(codeOf(moveFor), o.draft.to ? ({ t: 'pile', p: 0, loc: (o.draft.to.loc as PileLoc) } as Dest) : { t: 'card', uid: '' }, o.id)
            setMoveFor(null)
            execute(moveFor, o)
          }}
        />
      ) : null}

      {lpFor !== null ? (
        <LpDialog
          p={lpFor}
          current={state.lp[lpFor]}
          onClose={() => setLpFor(null)}
          onApply={(delta) => {
            useEditor.getState().apply({ step: { action: 'changeLP', lp: [{ p: lpFor, delta }], moves: [] } })
            announce(t('combos.announce.lp', { lp: state.lp[lpFor] + delta }))
            setLpFor(null)
          }}
        />
      ) : null}

      {counterFor ? (
        <CounterDialog
          onClose={() => setCounterFor(null)}
          onApply={(type, delta) => {
            useEditor.getState().apply({ step: { action: 'placeCounter', card: counterFor, counters: [{ uid: counterFor, type, delta }], moves: [] } })
            setCounterFor(null)
          }}
        />
      ) : null}

      {addFor !== null ? <AddCardDialog p={addFor} onClose={() => setAddFor(null)} onAdd={(a) => addCard(addFor, a)} /> : null}
    </div>
  )
}

interface Mods { shift?: boolean; alt?: boolean; ctrl?: boolean }