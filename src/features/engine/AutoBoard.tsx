/**
 * Campo della modalità automatica. Stesso Field del manuale, ma ogni azione è una risposta legale del core:
 * - presa di una carta → si evidenziano SOLO le zone che hanno un'azione legale (SELECT_IDLECMD/BATTLECMD);
 * - rilascio = risposta; più azioni sulla stessa zona → menu al punto di rilascio con le icone di gioco;
 * - zona/carta non legale → la zona non accetta e un avviso (toast) spiega il motivo;
 * - tocco = menu delle azioni legali attaccato alla carta (come Master Duel) + zone evidenziate; doppio tocco = azione rapida;
 *   pressione lunga = scheda carta compatta; clic destro = menu completo;
 * - Extra/Cimitero/Bandite/Deck = fascia compatta in flusso sotto il campo, che si chiude alla scelta;
 * - mai niente sopra il campo: barre e fasce stanno in flusso (il campo si ridimensiona) e le scelte si fanno sul campo.
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
import { PopMenu, type PopAnchor, type PopItem } from '@/features/combos/PopMenu'
import { useCards } from '@/features/combos/useCards'
import { destKey, occupantAt, parseDest, type Dest, type PileLoc } from '@/features/combos/zones'
import { CardInfoStrip, PickBand, PickBar, isPicking, pickClick, useFpT, usePickUi, type BandItem } from '@/features/fieldpick'
import { playSound, type SoundName } from '@/features/sound'
import { CardOptMarks } from '@/features/turn'
import { toast } from '@/ui/Toast'
import { GameIcon } from '@/ui/gameIcons'
import { useDuel } from './duelStore'
import { refsOf } from './view'
import { actionsAt, actionsForCard, destsForCard, legalActions, whyNot, type LegalAction, type LegalKind } from './legal'
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

interface Menu { x: number; y: number; title: string; items: PopItem[]; anchor?: PopAnchor | undefined }

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
  // avvisi brevi come toast (mai un pannello sopra il campo)
  const setWhy = useCallback((m: string | null) => { if (m) toast(m, { durationMs: 2800 }) }, [])
  const [info, setInfo] = useState<number | null>(null)
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
    setInfo(null)
  }, [reqKey])

  const fieldView: FieldView | null = useMemo(
    () => (view && state ? { state, registry: view.registry, nameOf: (c: number) => (c ? cards.nameOf(c) : ''), unrevealed: { deck: view.deckCount, extra: 0 }, randomHand: 0, dragHidden: true } : null),
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
  const pickSpec = usePickUi((st) => st.spec)

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
      setInfo(null)
      setPile(null)
      setHint(hint ?? null)
      useDuel.getState().setSource({ uid: a.uid, kind: a.kind })
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
      list.map((a) => ({ id: a.id, testId: `act-${a.kind}`, label: actionLabel(a), icon: <GameIcon name={a.icon} size={20} label={false} />, onSelect: () => void run(a, hint) })),
    [actionLabel, run],
  )

  const reasonFor = (uid: Uid): string => {
    const pl = state?.places[uid]
    const info = infoOf(uid)
    return t(whyNot(pending, { owner: pl?.p ?? 0, loc: pl?.loc ?? 'hand', isMonster: info.kind === 'monster', normalUsed: !!turn?.normalSummonUsed }))
  }

  const rectOf = (uid: Uid): PopAnchor | undefined => {
    const r = document.querySelector(`[data-card="${CSS.escape(uid)}"]`)?.getBoundingClientRect()
    return r ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : undefined
  }

  /** Menu delle azioni legali attaccato alla carta (stile Master Duel): nessuna barra sopra il campo. */
  const openActionMenu = useCallback(
    (uid: Uid, list: LegalAction[], anchor?: PopAnchor) => {
      const a = anchor ?? rectOf(uid)
      setMenu({ x: a ? (a.left + a.right) / 2 : lastPointer.current.x, y: a ? a.bottom : lastPointer.current.y, title: nameOfUid(uid), items: menuItems(list), anchor: a })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuItems, nameOfUid],
  )

  const showInfo = useCallback(
    (code: number) => {
      if (!code) return
      setMenu(null)
      setSel(null)
      playSound('uiOpen')
      setInfo(code)
    },
    [],
  )

  /** Clic destro / tasto Menu: azioni legali + scheda carta. */
  const openMenu = useCallback(
    (uid: Uid, x: number, y: number) => {
      const list = actionsForCard(legal, uid)
      const code = registry?.[uid] ?? 0
      const items: PopItem[] = [
        ...menuItems(list),
        ...(code ? [{ id: 'info', testId: 'act-info', label: t('act.info'), icon: <GameIcon name="check" size={20} label={false} />, onSelect: () => showInfo(code) }] : []),
      ]
      if (!list.length) setWhy(reasonFor(uid))
      setMenu({ x, y, title: t('act.title', { name: nameOfUid(uid) }), items })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legal, menuItems, t, nameOfUid, registry, showInfo],
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
      setWhy(actionsForCard(legal, uid).length ? t('why.zone') : reasonFor(uid))
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
    if (isPicking()) return
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
        void t0
        showInfo(registry?.[uid] ?? 0)
      }, 300)
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
    if (pickClick(uid)) return
    setMenu(null)
    if (sel && sel !== uid && highlight?.has(`c:${uid}`)) {
      const el = document.querySelector(`[data-card="${CSS.escape(uid)}"]`)?.getBoundingClientRect()
      return dropOn(sel, { t: 'card', uid }, el ? { x: el.left + el.width / 2, y: el.top + el.height / 2 } : lastPointer.current)
    }
    if (sel === uid) return setSel(null)
    const list = actionsForCard(legal, uid)
    if (!list.length) {
      setSel(null)
      setWhy(reasonFor(uid))
      playSound('error')
      const code = registry?.[uid] ?? 0
      if (code) setInfo(code)
      return
    }
    playSound('targetSelect')
    setInfo(null)
    setSel(uid)
    openActionMenu(uid, list)
  }
  const onCardDouble = (uid: Uid) => {
    if (pickClick(uid)) return // durante una scelta il secondo tocco ravvicinato è un altro tocco (toglie la carta)
    const list = actionsForCard(legal, uid)
    if (!list.length) return
    const act = list.filter((a) => a.kind === 'activate' || a.kind === 'chain')
    const pool = act.length ? act : list
    if (pool.length === 1) return void run(pool[0]!)
    setSel(null)
    openActionMenu(uid, pool)
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
      const list = actionsForCard(legal, uid)
      if (list.length) openActionMenu(uid, list, { left: r.left, right: r.right, top: r.top, bottom: r.bottom })
      else openMenu(uid, r.left + r.width / 2, r.top + r.height / 2)
    } else if (e.key === ' ') {
      e.preventDefault()
      onCardClick(uid)
    }
  }

  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSel(null)
      setInfo(null)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

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
  // telefono verticale: il campo dell'avversario serve quando si attacca o si scelgono sue carte
  const needOpp = pending?.kind === 'battle' || refsOf(pending).some((r) => r.place.p === 1)
  const overlayCode = dragUid ? (registry?.[dragUid] ?? 0) : 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="auto-board">
      <div className="relative min-h-0 flex-1">
        <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel} autoScroll={false}>
          <Field
            view={fieldView}
            mineOnly={!!mineOnly && !needOpp}
            selected={sel}
            highlight={highlight}
            picking={pickSpec}
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
            onPile={(p, loc) => { setMenu(null); setSel(null); setPile({ p, loc }) }}
          />
          <DragOverlay dropAnimation={null}>
            {dragUid && !suppress.current ? (
              <div style={{ width: dragSize }} className="pointer-events-none opacity-90 drop-shadow-lg">
                <CardFace code={overlayCode} name={overlayCode ? cards.nameOf(overlayCode) : ''} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {info ? <CardInfoStrip code={info} onClose={() => setInfo(null)} /> : null}
      {pile ? (
        <PileBand
          p={pile.p}
          loc={pile.loc}
          state={state}
          registry={registry!}
          legal={legal}
          onClose={() => setPile(null)}
          onAct={(uid, list, anchor) => {
            setPile(null)
            if (list.length === 1) void run(list[0]!)
            else openActionMenu(uid, list, anchor)
          }}
          onNone={(uid) => setWhy(reasonFor(uid))}
          onInfo={(code) => setInfo(code)}
        />
      ) : null}
      {pending?.kind === 'place' ? (
        <PlaceBar req={pending} chosen={zones} onConfirm={() => void respond(placeAnswer(pending, pending.available.filter((a) => zones.includes(destKey({ t: 'zone', p: a.loc === 'emz' ? 0 : a.p, loc: a.loc, seq: a.seq ?? 0 })))))} />
      ) : null}

      <div aria-live="polite" role="status" className="sr-only" data-testid="announcer">{live}</div>
      {menu ? <PopMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} anchor={menu.anchor} onClose={() => setMenu(null)} /> : null}
      <RequestHost />
    </div>
  )
}

const placeAnswer = (req: Extract<PendingRequest, { kind: 'place' }>, list: PlaceOpt[]) => answerPlace(req, list)

function PlaceBar({ req, chosen, onConfirm }: { req: Extract<PendingRequest, { kind: 'place' }>; chosen: string[]; onConfirm: () => void }) {
  const { t } = useEngT()
  const { t: fp } = useFpT()
  const source = useDuel((st) => st.source)
  const registry = useDuel((st) => st.view?.registry)
  const cards = useCards()
  const host = source ? cards.nameOf(registry?.[source.uid] ?? 0) : ''
  const many = req.count > 1
  return (
    <PickBar
      testId="place-banner"
      title={host || undefined}
      count={many ? fp('lbl.chosen', { label: fp('lbl.zones'), c: chosen.length, n: req.count }) : t('sel.placeTitle')}
      ok={chosen.length === req.count}
      noConfirm={!many}
      onConfirm={onConfirm}
    />
  )
}

/** Fascia compatta di una pila (Extra, Cimitero, Bandite, Deck, mano): le carte con un'azione legale sono evidenziate; alla scelta si chiude. */
function PileBand({ p, loc, state, registry, legal, onClose, onAct, onNone, onInfo }: {
  p: 0 | 1
  loc: PileLoc
  state: NonNullable<ReturnType<typeof useDuel.getState>['view']>['state']
  registry: Record<Uid, number>
  legal: readonly LegalAction[]
  onClose: () => void
  onAct: (uid: Uid, list: LegalAction[], anchor: PopAnchor) => void
  onNone: (uid: Uid) => void
  onInfo: (code: number) => void
}) {
  const { t } = useEngT()
  const cards = useCards()
  const uids = Object.entries(state.places).filter(([, pl]) => pl.p === p && pl.loc === loc).sort((a, b) => (a[1].seq ?? 0) - (b[1].seq ?? 0)).map(([u]) => u)
  const ordered = loc === 'gy' || loc === 'banished' ? [...uids].reverse() : uids
  const legalUids = new Set(legal.map((a) => a.uid))
  const items: BandItem[] = ordered.map((u) => ({ key: u, code: registry[u] ?? 0, name: cards.nameOf(registry[u] ?? 0), state: legalUids.has(u) ? 'cand' : 'dim' }))
  const name = t(loc === 'gy' ? 'sel.inGy' : loc === 'banished' ? 'sel.inBanished' : loc === 'extra' ? 'sel.inExtra' : loc === 'deck' ? 'sel.inDeck' : 'sel.inHand')
  return (
    <PickBand
      title={name} sub={String(ordered.length)} items={items} onClose={onClose} searchable={ordered.length > 12} testId="pile-band"
      onTap={(uid, el) => {
        const list = actionsForCard(legal, uid)
        const r = el.getBoundingClientRect()
        if (list.length) onAct(uid, list, { left: r.left, right: r.right, top: r.top, bottom: r.bottom })
        else onNone(uid)
      }}
      onLongPress={(uid) => onInfo(registry[uid] ?? 0)}
    />
  )
}
