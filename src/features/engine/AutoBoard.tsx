/**
 * Campo della modalità automatica. Stesso Field del manuale, ma ogni azione è una risposta legale del core:
 * - presa di una carta → si evidenziano SOLO le zone che hanno un'azione legale (SELECT_IDLECMD/BATTLECMD);
 * - rilascio = risposta; più azioni sulla stessa zona → menu al punto di rilascio con le icone di gioco;
 * - zona/carta non legale → la zona non accetta e un avviso spiega il motivo;
 * - doppio tocco = attiva; tocco = selezione con barra delle azioni; pressione lunga/clic destro = menu.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import type { Uid } from '@/domain/combo/types'
import { answerPlace } from '@/engine/answers'
import type { PendingRequest, PlaceOpt } from '@/engine/requests'
import { usesOfCard, type TurnState } from '@/domain/combo/turn'
import { CardFace } from '@/features/combos/CardFace'
import { cardInfo } from '@/features/combos/cardKind'
import { Field, type FieldView } from '@/features/combos/Field'
import { PopMenu, type PopItem } from '@/features/combos/PopMenu'
import { useCards } from '@/features/combos/useCards'
import { destKey, occupantAt, parseDest, type Dest, type PileLoc } from '@/features/combos/zones'
import { playSound, type SoundName } from '@/features/sound'
import { CardOptMarks } from '@/features/turn'
import { toast } from '@/ui/Toast'
import { GameIcon } from '@/ui/gameIcons'
import { useDuel } from './duelStore'
import { actionsAt, actionsForCard, destsForCard, legalActions, whyNot, type LegalAction, type LegalKind } from './legal'
import { PileView } from './PileView'
import { RequestHost } from './RequestHost'
import { descLabel } from './requests/parts'
import { useEngT } from './strings'
import './engine.css'

const collision: CollisionDetection = (args) => {
  const hit = pointerWithin(args)
  return hit.length ? hit : rectIntersection(args)
}

const SOUND: Record<LegalKind, SoundName> = {
  summon: 'summonNormal', specialSummon: 'summonSpecial', monsterSet: 'summonSet', spellSet: 'summonSet', activate: 'activate', posChange: 'positionChange', attack: 'attack', chain: 'activate',
}

interface Menu { x: number; y: number; title: string; items: PopItem[] }

export function AutoBoard({ turn, mineOnly }: { turn?: TurnState | undefined; mineOnly?: boolean }) {
  const { t } = useEngT()
  const cards = useCards()
  const view = useDuel((s) => s.view)
  const pending = useDuel((s) => s.state?.pending ?? null)
  const respond = useDuel((s) => s.respond)
  const setHint = useDuel((s) => s.setHint)
  const [sel, setSel] = useState<Uid | null>(null)
  const [dragUid, setDragUid] = useState<Uid | null>(null)
  const [dragFresh, setDragFresh] = useState<PileLoc | null>(null)
  const [dragSize, setDragSize] = useState(60)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [pile, setPile] = useState<{ p: 0 | 1; loc: PileLoc } | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [live, setLive] = useState('')
  const lastPointer = useRef({ x: 0, y: 0 })
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppress = useRef(false)

  const state = view?.state
  const registry = view?.registry
  const infoOf = useCallback((uid: Uid) => cardInfo(cards.byId(registry?.[uid] ?? 0)), [cards, registry])
  const legal = useMemo(() => (state ? legalActions(pending, infoOf, state) : []), [pending, infoOf, state])

  // la selezione sparisce quando la richiesta cambia (la carta potrebbe non esistere più)
  const reqKey = useDuel((s) => s.tick)
  useEffect(() => {
    setSel(null)
    setMenu(null)
    setWhy(null)
  }, [reqKey])

  const fieldView: FieldView | null = useMemo(
    () => (view && state ? { state, registry: view.registry, nameOf: cards.nameOf, unrevealed: { deck: view.deckCount, extra: 0 }, randomHand: 0, dragHidden: true } : null),
    [view, state, cards.nameOf],
  )

  // ---- zone in cui si può rilasciare
  const placeKeys = useMemo(() => {
    if (pending?.kind !== 'place') return null
    return new Set(pending.available.filter((a) => a.p === 0 || a.loc !== 'emz').map((a) => destKey({ t: 'zone', p: a.loc === 'emz' ? 0 : a.p, loc: a.loc, seq: a.seq ?? 0 })))
  }, [pending])

  const extraUids = useMemo(() => (state ? Object.entries(state.places).filter(([, pl]) => pl.p === 0 && pl.loc === 'extra').map(([u]) => u) : []), [state])
  const active = dragUid ?? sel
  const highlight = useMemo<ReadonlySet<string> | null>(() => {
    if (placeKeys) return placeKeys
    if (dragFresh === 'extra') {
      const s = new Set<string>()
      for (const u of extraUids) for (const d of destsForCard(legal, u)) s.add(d)
      return s
    }
    if (!active) return null
    return destsForCard(legal, active)
  }, [placeKeys, dragFresh, extraUids, active, legal])

  const nameOfUid = useCallback((uid: Uid) => cards.nameOf(registry?.[uid] ?? 0), [cards, registry])

  const actionLabel = useCallback(
    (a: LegalAction) => {
      const base = t(a.labelKey)
      if (a.kind === 'attack' && a.direct) return t('act.attackDirect')
      const code = registry?.[a.uid] ?? 0
      const extra = a.desc ? descLabel(a.desc, cards.nameOf, t) : ''
      return a.kind === 'activate' || a.kind === 'chain' ? (extra ? `${base} · ${extra}` : base) : base + (code ? '' : '')
    },
    [t, registry, cards.nameOf],
  )

  const run = useCallback(
    async (a: LegalAction, hint?: { zone?: string; uid?: Uid }) => {
      setSel(null)
      setMenu(null)
      setHint(hint ?? null)
      playSound(SOUND[a.kind])
      setLive(t('a11y.done', { action: t(a.labelKey), card: nameOfUid(a.uid) }))
      const ok = await respond(a.answer)
      if (!ok) {
        playSound('error')
        toast(t('toast.invalid'))
      }
    },
    [respond, setHint, t, nameOfUid],
  )

  const menuItems = useCallback(
    (list: LegalAction[], hint?: { zone?: string; uid?: Uid }): PopItem[] =>
      list.map((a) => ({ id: a.id, label: actionLabel(a), icon: <GameIcon name={a.icon} size={20} label={false} />, onSelect: () => void run(a, hint) })),
    [actionLabel, run],
  )

  const reasonFor = (uid: Uid): string => {
    const pl = state?.places[uid]
    const info = infoOf(uid)
    return t(whyNot(pending, { owner: pl?.p ?? 0, loc: pl?.loc ?? 'hand', isMonster: info.kind === 'monster', normalUsed: !!turn?.normalSummonUsed }))
  }

  const openMenu = useCallback(
    (uid: Uid, x: number, y: number) => {
      const list = actionsForCard(legal, uid)
      if (!list.length) {
        setWhy(reasonFor(uid))
        playSound('error')
        return
      }
      setMenu({ x, y, title: t('act.title', { name: nameOfUid(uid) }), items: menuItems(list) })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legal, menuItems, t, nameOfUid],
  )

  // ---- rilascio
  const resolveDest = (d: Dest): Dest => {
    if (d.t === 'zone' && state) {
      const occ = occupantAt(state, d.p, d.loc, d.seq)
      if (occ && highlight?.has(`c:${occ}`)) return { t: 'card', uid: occ }
    }
    return d
  }

  const dropOn = (uid: Uid, d0: Dest, at: { x: number; y: number }) => {
    const d = resolveDest(d0)
    const key = destKey(d)
    const list = actionsAt(legal, uid, key)
    if (!list.length) {
      playSound('error')
      setWhy(t('why.zone'))
      return
    }
    const hint = d.t === 'card' ? { uid: d.uid } : { zone: key }
    if (list.length === 1) return void run(list[0]!, hint)
    setMenu({ x: at.x, y: at.y, title: nameOfUid(uid), items: menuItems(list, hint) })
  }

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }))

  useEffect(() => {
    const mv = (e: PointerEvent) => (lastPointer.current = { x: e.clientX, y: e.clientY })
    window.addEventListener('pointermove', mv)
    return () => window.removeEventListener('pointermove', mv)
  }, [])

  const stopLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current)
    longPress.current = null
  }

  const onDragStart = (e: DragStartEvent) => {
    suppress.current = false
    setMenu(null)
    const id = String(e.active.id)
    const r0 = e.active.rect.current.initial
    setDragSize(r0 ? Math.min(r0.width, (r0.height * 59) / 86) : 60)
    if (id.startsWith('fresh:')) {
      const loc = id.split(':')[2] as PileLoc
      setDragFresh(loc)
      if (loc !== 'extra' || !extraUids.some((u) => actionsForCard(legal, u).length)) setWhy(t('why.nothing'))
      return
    }
    const uid = id.startsWith('card:') ? id.slice(5) : null
    if (!uid) return
    setDragUid(uid)
    setSel(null)
    const list = actionsForCard(legal, uid)
    setWhy(list.some((a) => a.dests.length) ? null : list.length ? t('why.pile') : reasonFor(uid))
    const ev = e.activatorEvent
    if (typeof TouchEvent !== 'undefined' && ev instanceof TouchEvent) {
      const t0 = ev.touches[0]
      longPress.current = setTimeout(() => {
        suppress.current = true
        setDragUid(null)
        openMenu(uid, t0?.clientX ?? lastPointer.current.x, t0?.clientY ?? lastPointer.current.y)
      }, 450)
    }
  }
  const onDragMove = (e: { delta: { x: number; y: number } }) => {
    if (Math.hypot(e.delta.x, e.delta.y) > 10) stopLongPress()
  }
  const onDragEnd = (e: DragEndEvent) => {
    stopLongPress()
    const fromUid = dragUid
    const fresh = dragFresh
    setDragUid(null)
    setDragFresh(null)
    if (suppress.current || !e.over) return
    const dest = parseDest(String(e.over.id))
    if (!dest) return
    const r = e.active.rect.current.translated
    const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : lastPointer.current
    if (fresh === 'extra') {
      const key = destKey(resolveDest(dest))
      const list = legal.filter((a) => extraUids.includes(a.uid) && a.dests.includes(key))
      if (!list.length) {
        playSound('error')
        return void setWhy(t('why.zone'))
      }
      const hint = { zone: key }
      if (list.length === 1) return void run(list[0]!, hint)
      return setMenu({
        x: at.x,
        y: at.y,
        title: t('sel.inExtra'),
        items: list.map((a) => ({ id: a.id, label: nameOfUid(a.uid), icon: <GameIcon name={a.icon} size={20} label={false} />, onSelect: () => void run(a, hint) })),
      })
    }
    if (fromUid) dropOn(fromUid, dest, at)
  }
  const onDragCancel = () => {
    stopLongPress()
    setDragUid(null)
    setDragFresh(null)
  }

  // ---- tocchi sul campo
  const onCardClick = (uid: Uid) => {
    setMenu(null)
    setWhy(null)
    if (sel && sel !== uid && highlight?.has(`c:${uid}`)) {
      const el = document.querySelector(`[data-card="${CSS.escape(uid)}"]`)?.getBoundingClientRect()
      return dropOn(sel, { t: 'card', uid }, el ? { x: el.left + el.width / 2, y: el.top + el.height / 2 } : lastPointer.current)
    }
    if (sel === uid) return setSel(null)
    if (!actionsForCard(legal, uid).length) {
      setSel(null)
      setWhy(reasonFor(uid))
      return
    }
    playSound('targetSelect')
    setSel(uid)
  }
  const onCardDouble = (uid: Uid) => {
    const list = actionsForCard(legal, uid)
    if (!list.length) return setWhy(reasonFor(uid))
    const act = list.filter((a) => a.kind === 'activate' || a.kind === 'chain')
    const pool = act.length ? act : list
    if (pool.length === 1) return void run(pool[0]!)
    const el = document.querySelector(`[data-card="${CSS.escape(uid)}"]`)?.getBoundingClientRect()
    setSel(null)
    setMenu({ x: el ? el.left + el.width / 2 : lastPointer.current.x, y: el ? el.top + el.height / 2 : lastPointer.current.y, title: nameOfUid(uid), items: menuItems(pool) })
  }
  const onZone = (d: Dest, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    const at = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    if (pending?.kind === 'place') return void placeZone(d)
    if (sel) dropOn(sel, d, at)
  }
  const onCardKey = (uid: Uid, e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      openMenu(uid, r.left + r.width / 2, r.top + r.height / 2)
    } else if (e.key === ' ') {
      e.preventDefault()
      onCardClick(uid)
    }
  }

  // ---- scelta della zona (SELECT_PLACE / SELECT_DISFIELD)
  const [zones, setZones] = useState<string[]>([])
  useEffect(() => setZones([]), [reqKey])
  const placeZone = (d: Dest) => {
    if (pending?.kind !== 'place' || d.t !== 'zone') return
    const key = destKey(d)
    const opt = pending.available.find((a) => destKey({ t: 'zone', p: a.loc === 'emz' ? 0 : a.p, loc: a.loc, seq: a.seq ?? 0 }) === key)
    if (!opt) return
    playSound('targetSelect')
    if (pending.count === 1) return void respond(placeAnswer(pending, [opt]))
    setZones((z) => (z.includes(key) ? z.filter((k) => k !== key) : z.length >= pending.count ? z : [...z, key]))
  }
  useEffect(() => {
    document.querySelectorAll('[data-chosen]').forEach((n) => n.removeAttribute('data-chosen'))
    for (const k of zones) document.querySelector(`[data-zone="${CSS.escape(k)}"]`)?.setAttribute('data-chosen', '1')
  }, [zones])

  if (!fieldView || !state) return null
  const selInfo = sel ? actionsForCard(legal, sel) : []
  const overlayCode = dragUid ? (registry?.[dragUid] ?? 0) : 0

  return (
    <div className="relative h-full min-h-0" data-testid="auto-board">
      {pending?.kind === 'place' ? (
        <PlaceBanner req={pending} chosen={zones} onConfirm={() => void respond(placeAnswer(pending, pending.available.filter((a) => zones.includes(destKey({ t: 'zone', p: a.loc === 'emz' ? 0 : a.p, loc: a.loc, seq: a.seq ?? 0 })))))} />
      ) : sel && selInfo.length ? (
        <div className="eng-sel-bar" role="group" aria-label={t('act.title', { name: nameOfUid(sel) })} data-testid="sel-bar">
          <p className="truncate text-sm font-semibold text-fg">{selInfo.some((a) => a.dests.length) ? t('act.selected', { name: nameOfUid(sel) }) : nameOfUid(sel)}</p>
          <div className="eng-sel-actions">
            {selInfo.map((a, i) => (
              <button key={a.id} type="button" className="eng-act" data-primary={i === 0 || undefined} onClick={() => void run(a)} data-testid={`act-${a.kind}`}>
                <GameIcon name={a.icon} size={20} label={false} />
                {actionLabel(a)}
              </button>
            ))}
          </div>
        </div>
      ) : why ? (
        <div role="status" className="eng-sel-bar !flex-row !items-center" data-testid="why" onClick={() => setWhy(null)}>
          <GameIcon name="check" size={18} label={false} />
          <p className="text-sm text-fg">{why}</p>
        </div>
      ) : null}

      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel} autoScroll={false}>
        <Field
          view={fieldView}
          mineOnly={!!mineOnly}
          selected={sel}
          highlight={highlight}
          picking={null}
          renderMarks={(uid, code) => {
            if (!turn) return null
            return usesOfCard(turn, uid, code).length ? (
              <span className="pointer-events-none absolute -bottom-1 -right-1 z-10"><CardOptMarks turn={turn} uid={uid} code={code} size="sm" /></span>
            ) : null
          }}
          onCardClick={onCardClick}
          onCardDouble={onCardDouble}
          onCardMenu={(uid, x, y) => openMenu(uid, x, y)}
          onCardKey={onCardKey}
          onZone={onZone}
          onPile={(p, loc) => setPile({ p, loc })}
        />
        <DragOverlay dropAnimation={null}>
          {dragUid && !suppress.current ? (
            <div style={{ width: dragSize }} className="pointer-events-none opacity-90 drop-shadow-lg">
              <CardFace code={overlayCode} name={overlayCode ? cards.nameOf(overlayCode) : ''} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div aria-live="polite" role="status" className="sr-only" data-testid="announcer">{live}</div>
      {menu ? <PopMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} /> : null}
      {pile ? (
        <PileView
          p={pile.p}
          loc={pile.loc}
          state={state}
          registry={registry!}
          legalUids={new Set(legal.map((a) => a.uid))}
          onPick={(uid) => {
            setPile(null)
            if (actionsForCard(legal, uid).length) setSel(uid)
            else setWhy(reasonFor(uid))
          }}
          onClose={() => setPile(null)}
        />
      ) : null}
      <RequestHost />
    </div>
  )
}

const placeAnswer = (req: Extract<PendingRequest, { kind: 'place' }>, list: PlaceOpt[]) => answerPlace(req, list)

function PlaceBanner({ req, chosen, onConfirm }: { req: Extract<PendingRequest, { kind: 'place' }>; chosen: string[]; onConfirm: () => void }) {
  const { t } = useEngT()
  return (
    <div role="status" className="eng-sel-bar !flex-row !items-center" data-testid="place-banner">
      <p className="min-w-0 flex-1 text-sm font-semibold text-fg">{req.count > 1 ? t('sel.placeTitleN', { n: req.count }) : t('sel.placeTitle')}</p>
      {req.count > 1 ? (
        <>
          <span className="eng-pill" data-tone={chosen.length === req.count ? 'ok' : undefined}>{t('sel.placeCounter', { c: chosen.length, n: req.count })}</span>
          <button type="button" className="eng-act" data-primary="true" disabled={chosen.length !== req.count} onClick={onConfirm} data-testid="place-confirm">{t('sel.confirm')}</button>
        </>
      ) : null}
    </div>
  )
}
