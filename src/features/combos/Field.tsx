/**
 * Campo di gioco completo (due giocatori). Riempie lo spazio del contenitore: dimensioni e disposizione
 * (verticale 7×7 / orizzontale 9×5) sono pura CSS (field.css, container query). Per l'avversario le colonne
 * sono specchiate (vista dal giocatore).
 */
import { createContext, memo, useContext, useMemo, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import Ban from 'lucide-react/icons/ban'
import Check from 'lucide-react/icons/check'
import Layers from 'lucide-react/icons/layers'
import Skull from 'lucide-react/icons/skull'
import Sparkles from 'lucide-react/icons/sparkles'
import { overlaysOf, zoneCards, type GameState, type NPlace } from '@/domain/combo/state'
import { useFieldPrefs } from './fieldPrefs'
import type { PlayerIdx, Uid } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { GameIcon } from '@/ui/gameIcons'
import { CardFace, isDefPos } from './CardFace'
import './field.css'
import { destKey, occupantAt, type Dest, type PileLoc, type ZoneLoc } from './zones'

export interface FieldView {
  state: GameState
  registry: Record<Uid, number>
  nameOf: (code: number) => string
  /** carte del Deck/Extra proprio non ancora rivelate */
  unrevealed: { deck: number; extra: number }
  /** segnaposto "N carte casuali" nella mano propria */
  randomHand: number
  /** Deck/Extra propri trascinabili anche senza carte "non rivelate" (modalità automatica: le azioni legali scelgono la carta) */
  dragHidden?: boolean
}

/** Larghezza / altezza del blocco campo + mano (mano propria SEMPRE sotto il campo). */
export const FIELD_ASPECT_RATIO = 100 / 95.19

/** Evidenziazione per replay/guida: carta attiva e carte della catena. */
export interface FieldEmphasis {
  active?: Uid
  chain?: ReadonlySet<Uid>
}

export interface FieldHandlers {
  selected: Uid | null
  highlight: ReadonlySet<string> | null
  picking: { candidates: ReadonlySet<Uid>; chosen: ReadonlySet<Uid>; order?: ReadonlyMap<Uid, number>; numbered?: boolean } | null
  onCardClick: (uid: Uid) => void
  onCardDouble: (uid: Uid) => void
  onCardMenu: (uid: Uid, x: number, y: number) => void
  onCardKey: (uid: Uid, e: KeyboardEvent) => void
  onZone: (dest: Dest, el: HTMLElement) => void
  onPile: (p: PlayerIdx, loc: PileLoc) => void
  onLp: (p: PlayerIdx) => void
}

interface Ctx extends FieldHandlers { view: FieldView; readOnly: boolean; emphasis: FieldEmphasis; pilesOpen: boolean; renderMarks?: ((uid: Uid, code: number) => React.ReactNode) | undefined }
const FieldCtx = createContext<Ctx | null>(null)
const useField = () => {
  const c = useContext(FieldCtx)
  if (!c) throw new Error('Field context')
  return c
}

export const cardDragId = (uid: Uid) => `card:${uid}`
export const freshDragId = (p: PlayerIdx, loc: 'deck' | 'extra') => `fresh:${p}:${loc}`

/* ---------------------------------------------------------------- posizionamento */
/**
 * Ogni zona ha tre posizioni (variabili CSS lette da field.css): desktop/tablet (7 colonne, d*), telefono verticale
 * (5 colonne con pile in fasce orizzontali, p*), telefono orizzontale (11 colonne in una riga, l*).
 * Per l'avversario le colonne sono specchiate (vista dal giocatore).
 */
type Kind = 'm' | 's' | 'f' | 'gy' | 'extra' | 'deck' | 'banished' | 'lp' | 'hand' | 'emz'

const DESK_ROW: Record<PlayerIdx, Record<'hand' | 'back' | 'front' | 'mid', number>> = {
  1: { hand: 1, back: 2, front: 3, mid: 4 },
  0: { mid: 4, front: 5, back: 6, hand: 7 },
}
const mirror = (p: PlayerIdx, col: number, n = 7) => (p === 1 ? n + 1 - col : col)

/** Colonna (1–5) delle zone di una fascia nelle pile: Terreno, Extra, Deck, Cimitero, Bandite. */
const BAND_COL: Partial<Record<Kind, number>> = { f: 1, extra: 2, deck: 3, gy: 4, banished: 5 }

function pos(p: PlayerIdx, kind: Kind, i = 0): CSSProperties {
  const v: Record<string, string | number> = {}
  // --- desktop
  const dRow = (r: 'hand' | 'back' | 'front' | 'mid') => DESK_ROW[p][r]
  const dCol: Record<Kind, [ 'hand' | 'back' | 'front' | 'mid', number ]> = {
    m: ['front', 2 + i], s: ['back', 2 + i], f: ['front', 1], gy: ['front', 7], extra: ['back', 1], deck: ['back', 7],
    banished: ['mid', 7], lp: ['hand', 7], hand: ['hand', 2], emz: ['mid', 3 + i * 2],
  }
  const [dr, dc] = dCol[kind]
  v['--dr'] = dRow(dr)
  v['--dc'] = kind === 'emz' ? dc : kind === 'hand' ? (p === 0 ? '1 / 7' : '2 / 8') : mirror(p, dc)
  // --- telefono verticale (5 colonne)
  const band = BAND_COL[kind]
  let pr: number, pc: number | string
  if (kind === 'm') [pr, pc] = [p === 0 ? 6 : 4, mirror(p, i + 1, 5)]
  else if (kind === 's') [pr, pc] = [p === 0 ? 7 : 3, mirror(p, i + 1, 5)]
  else if (band) [pr, pc] = [p === 0 ? 8 : 2, mirror(p, band, 5)]
  else if (kind === 'lp') [pr, pc] = [5, p === 0 ? 5 : 1]
  else if (kind === 'emz') [pr, pc] = [5, 2 + i * 2]
  else [pr, pc] = [p === 0 ? 9 : 1, '1 / 6']
  v['--pr'] = pr
  v['--pc'] = pc
  // --- telefono orizzontale (11 colonne: avversario 1–5, centro 6, giocatore 7–11)
  const lcol = (c: number) => (p === 0 ? 6 + c : 6 - c)
  let lr: number, lc: number | string
  if (kind === 'm') [lr, lc] = [2, lcol(i + 1)]
  else if (kind === 's') [lr, lc] = [1, lcol(i + 1)]
  else if (band) [lr, lc] = [3, lcol(band)]
  else if (kind === 'lp') [lr, lc] = [p === 0 ? 4 : 3, 6]
  else if (kind === 'emz') [lr, lc] = [1 + i, 6]
  else [lr, lc] = [4, p === 0 ? '7 / 12' : '1 / 6']
  v['--lr'] = lr
  v['--lc'] = lc
  return v as CSSProperties
}

/* ---------------------------------------------------------------- cella */
function Cell({
  dest,
  p,
  style,
  label,
  children,
  overlay,
  occupant,
  filled,
  anchor,
  oppMain,
  onOpen,
}: {
  dest: Dest
  p: PlayerIdx
  style: CSSProperties
  label?: ReactNode
  children?: ReactNode
  /** sopra le carte (es. badge dei conteggi) */
  overlay?: ReactNode
  occupant?: Uid | undefined
  /** c'è una carta nella zona: la cornice tratteggiata sparisce (restano visibili solo carta e, se serve, l'evidenziazione) */
  filled?: boolean
  /** zona più larga di una carta: la carta "in cima" sta a questa estremità */
  anchor?: 'start' | 'end'
  /** zona principale dell'avversario: si nasconde con "Il mio campo" */
  oppMain?: boolean
  onOpen?: () => void
}) {
  const { highlight, onZone } = useField()
  const id = destKey(dest)
  const { setNodeRef, isOver } = useDroppable({ id })
  const valid = !!highlight && (highlight.has(id) || (occupant !== undefined && highlight.has(`c:${occupant}`)))
  const dim = !!highlight && !valid
  const boxStyle: CSSProperties | undefined = anchor ? { left: anchor === 'end' ? 'auto' : 0, right: anchor === 'end' ? 0 : 'auto', transform: 'translateY(-50%)' } : undefined
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      data-valid={valid || undefined}
      onClick={(e) => {
        if (valid) onZone(dest, e.currentTarget)
        else if (!(e.target as HTMLElement).closest('[data-card]')) onOpen?.()
      }}
      className={cn('cl-cell', p === 0 && 'cl-own', oppMain && p === 1 && 'cl-opp-main', (filled ?? occupant !== undefined) && 'cl-filled', valid && 'cl-valid', valid && isOver && 'cl-over', dim && 'cl-dim')}
      style={style}
    >
      <div aria-hidden className="cl-box cl-zone" style={boxStyle} />
      {label ? (
        <div className="cl-box" style={boxStyle}>
          <div className="cl-label">{label}</div>
        </div>
      ) : null}
      {children}
      {overlay ? <div className="cl-box z-20" style={boxStyle}>{overlay}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- carta */
/** Gestori stabili (identità costante): leggono sempre i valori più recenti. Così le carte memorizzate non si ridisegnano per colpa loro. */
interface Handlers {
  click: (uid: Uid) => void
  double: (uid: Uid) => void
  menu: (uid: Uid, x: number, y: number) => void
  key: (uid: Uid, e: React.KeyboardEvent) => void
}
const HandlersCtx = createContext<Handlers | null>(null)

interface CardViewProps {
  uid: Uid
  place: NPlace
  code: number
  name: string
  selected: boolean
  candidate: boolean
  chosen: boolean
  /** posizione di scelta (0 = nessun numero: si mostra la spunta) */
  chosenN?: number
  dimmed: boolean
  active: boolean
  inChain: boolean
  counters: number
  overlays: number
  inPile: boolean
  /** clic delegato alla pila (destinazione) mentre c'è una selezione/un trascinamento */
  pileTarget: boolean
  readOnly: boolean
  fanLeft?: string | undefined
  fanDy?: string | undefined
  fanZ?: number | undefined
  fanNewest?: boolean | undefined
  marks?: React.ReactNode
}

/** Vista memorizzata di una carta: si ridisegna solo se cambia una delle sue proprietà (non per ogni passo). */
const FieldCardView = memo(function FieldCardView(p: CardViewProps) {
  const h = useContext(HandlersCtx)!
  const { uid, place, code, name, selected, candidate, chosen, chosenN, active, inChain, inPile, readOnly, fanLeft } = p
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardDragId(uid), data: { uid }, disabled: readOnly })
  const lastTap = useRef(0)
  const def = isDefPos(place.pos)
  const interactive = readOnly
    ? {}
    : {
        ...attributes,
        ...listeners,
        role: 'button',
        tabIndex: 0,
        'aria-roledescription': '',
        'aria-pressed': selected,
        onClick: () => {
          if (inPile && p.pileTarget) return // il clic spetta alla pila (destinazione)
          const now = Date.now()
          if (now - lastTap.current < 350) {
            lastTap.current = 0
            h.double(uid)
          } else {
            lastTap.current = now
            h.click(uid)
          }
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          h.menu(uid, e.clientX, e.clientY)
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          listeners?.onKeyDown?.(e)
          h.key(uid, e)
        },
      }
  return (
    <div
      ref={readOnly ? undefined : setNodeRef}
      {...interactive}
      data-card={uid}
      data-loc={place.loc}
      data-active={active || undefined}
      data-chain={inChain || undefined}
      data-pick={chosen ? 'chosen' : candidate ? 'cand' : p.dimmed ? 'dim' : undefined}
      data-newest={p.fanNewest || undefined}
      aria-label={name}
      title={name}
      style={fanLeft !== undefined ? { top: 0, bottom: 0, right: 'auto', left: fanLeft, width: 'var(--tw)', transform: p.fanDy, zIndex: p.fanZ } : undefined}
      className={cn(
        'absolute inset-0 flex select-none items-center justify-center outline-none',
        fanLeft !== undefined && 'cl-fan-card',
        readOnly ? 'pointer-events-none' : 'touch-none',
        isDragging && 'opacity-30',
        p.dimmed && 'cl-pickdim',
      )}
    >
      <div className={cn('cl-fit', def && 'cl-def')}>
        <CardFace
          fit
          code={code}
          name={name}
          pos={place.pos}
          className={cn(
            'rounded-[6px] transition-shadow duration-150',
            selected && 'shadow-[0_0_0_3px_var(--accent-text)]',
            inChain && 'shadow-[0_0_0_3px_var(--warn)]',
            active && 'shadow-[0_0_0_4px_var(--accent-text),0_0_16px_2px_var(--accent-text)]',
          )}
        />
        {!inPile && p.counters ? <span className="cl-badge -left-1 -top-1 inline-flex items-center justify-center gap-0.5" data-counters={p.counters}>
            <GameIcon name="counter" size={11} label={false} />
            {p.counters}
          </span> : null}
        {!inPile && p.overlays ? <span className="cl-badge -bottom-1 -left-1" data-overlays={p.overlays}>×{p.overlays}</span> : null}
        {p.marks}
        {chosen ? (
          <span className="cl-badge -right-1 -top-1 grid place-items-center !bg-ok !text-bg" data-pick-badge>
            {chosenN ? chosenN : <Check className="size-3.5" aria-hidden />}
          </span>
        ) : null}
      </div>
    </div>
  )
})

/** Carta in campo/mano/pila: calcola le proprietà primitive dal contesto e delega alla vista memorizzata. */
function FieldCard({ uid, inPile, fan }: { uid: Uid; inPile?: boolean; fan?: { left: string; dy: string; z: number; newest: boolean } }) {
  const { view, selected, picking, highlight, readOnly, emphasis, renderMarks } = useField()
  const place = view.state.places[uid]
  if (!place) return null
  const code = view.registry[uid] ?? 0
  const cand = !!picking?.candidates.has(uid)
  const c = view.state.counters[uid]
  return (
    <FieldCardView
      uid={uid}
      place={place}
      code={code}
      name={view.nameOf(code)}
      selected={selected === uid}
      candidate={cand}
      chosen={!!picking?.chosen.has(uid)}
      chosenN={picking?.numbered ? (picking.order?.get(uid) ?? 0) : 0}
      dimmed={!!picking && !cand}
      active={emphasis.active === uid}
      inChain={!!emphasis.chain?.has(uid)}
      counters={c ? Object.values(c).reduce((a, b) => a + b, 0) : 0}
      overlays={inPile ? 0 : overlaysOf(view.state, uid).length}
      inPile={!!inPile}
      pileTarget={!!highlight}
      readOnly={readOnly}
      fanLeft={fan?.left}
      fanDy={fan?.dy}
      fanZ={fan?.z}
      fanNewest={fan?.newest}
      marks={renderMarks?.(uid, code)}
    />
  )
}

/* ---------------------------------------------------------------- pile, mano, LP */
function PileBack({ loc }: { loc: PileLoc }) {
  const Icon = loc === 'extra' ? Sparkles : Layers
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="cl-fit">
        <div className="absolute inset-0 translate-x-[3px] translate-y-[3px] rounded-[6px] border border-line bg-surface-3" />
        <div
          className="absolute inset-0 grid place-items-center rounded-[6px] border border-line-strong text-accent-text"
          style={{ background: 'linear-gradient(160deg, var(--accent-soft) 0%, var(--surface-3) 60%, var(--surface-2) 100%)' }}
        >
          <Icon aria-hidden className="size-[42%] opacity-80" />
        </div>
      </div>
    </div>
  )
}

const FAN_MAX = 10

function Pile({ p, loc, style }: { p: PlayerIdx; loc: PileLoc; style: CSSProperties }) {
  const { t } = useTranslation()
  const { view, onPile, readOnly, pilesOpen } = useField()
  const fanPiles = useFieldPrefs((s) => s.fanPiles)
  const placed = zoneCards(view.state, p, loc)
  const unrevealed = p === 0 ? (loc === 'deck' ? view.unrevealed.deck : loc === 'extra' ? view.unrevealed.extra : 0) : 0
  const count = placed.length + unrevealed
  const hidden = loc === 'deck' || loc === 'extra'
  const Icon = loc === 'gy' ? Skull : loc === 'banished' ? Ban : loc === 'deck' ? Layers : Sparkles
  const draggableFresh = !readOnly && hidden && p === 0 && (unrevealed > 0 || (!!view.dragHidden && count > 0))
  // un id per pila (anche se disattivata): ids duplicati si sovrascriverebbero nel registro di dnd-kit
  const fresh = useDraggable({ id: hidden ? freshDragId(p, loc as 'deck' | 'extra') : `none:${p}:${loc}`, data: { fresh: loc }, disabled: !draggableFresh })
  const name = t(`combos.pile.${loc}`)

  // Cimitero e Bandite: ultime 10 carte a ventaglio (la più recente in cima e intera). La Bandite è una fascia orizzontale
  // su due colonne; il Cimitero sfalsa le carte in diagonale dentro la sua colonna. Opzione disattivabile.
  const wide = loc === 'banished' // la zona occupa due colonne
  const newestAtEnd = p === 0 // il giocatore ha Cimitero/Bandite a destra, l'avversario (specchiato) a sinistra
  const shown = hidden ? [] : placed.slice(-FAN_MAX)
  const hiddenN = hidden ? 0 : placed.length - shown.length
  const avail = wide ? '(var(--th) + var(--ts) + var(--g) - var(--tw))' : '(var(--ts) - var(--tw))'
  const step = wide ? `min(var(--tw) * 0.3, ${avail} / 9)` : `(${avail} / 9)`
  const fanAt = (age: number) => ({
    left: newestAtEnd ? `calc(${avail} - ${age} * ${step})` : `calc(${age} * ${step})`,
    dy: wide ? 'none' : `translateY(calc(${age} * var(--th) * -0.011))`,
    z: 10 - age,
    newest: age === 0,
  })
  const anchor: 'start' | 'end' | undefined = wide || (fanPiles && (loc === 'gy')) ? (newestAtEnd ? 'end' : 'start') : undefined
  const style2: CSSProperties = wide ? { ...style, ['--dc' as string]: p === 0 ? '6 / 8' : '1 / 3' } : style
  const asFan = (loc === 'gy' || loc === 'banished') && (fanPiles || wide)
  const cards = !hidden
    ? asFan
      ? (fanPiles ? shown : shown.slice(-1)).map((uid, i, arr) => <FieldCard key={uid} uid={uid} inPile fan={fanAt(arr.length - 1 - i)} />)
      : shown.slice(-1).map((uid) => <FieldCard key={uid} uid={uid} inPile />)
    : null
  const top = shown[shown.length - 1]

  return (
    <Cell
      dest={{ t: 'pile', p, loc }}
      p={p}
      style={style2}
      filled={count > 0}
      anchor={anchor}
      oppMain
      onOpen={count > 0 && pilesOpen ? () => onPile(p, loc) : undefined}
      label={
        count === 0 ? (
          <span className="flex flex-col items-center gap-1">
            <Icon aria-hidden className="size-[28%] min-w-3.5 opacity-70" />
            <span className="max-w-full truncate px-0.5">{name}</span>
          </span>
        ) : undefined
      }
      overlay={
        count > 0 && !pilesOpen ? (
          <span className="cl-badge -bottom-1 -right-1">{count}</span>
        ) : count > 0 ? (
          <>
            {loc === 'gy' || loc === 'banished' ? (
              <span aria-hidden className="cl-badge -left-1 -top-1 grid place-items-center !px-0">
                <Icon className="size-[11px]" />
              </span>
            ) : null}
            {hiddenN > 0 && fanPiles ? (
              <span className="cl-badge -right-1 -top-1" data-more={hiddenN} title={t('combos.pile.more', { count: hiddenN })}>
                +{hiddenN}
              </span>
            ) : null}
            <button
              type="button"
              aria-label={`${name}: ${count}`}
              data-pile={`${p}:${loc}`}
              onClick={(e) => {
                e.stopPropagation()
                onPile(p, loc)
              }}
              className="cl-badge pointer-events-auto -bottom-1 -right-1 cursor-pointer before:absolute before:-inset-1 before:content-[''] hover:border-accent-text"
            >
              {count}
            </button>
          </>
        ) : undefined
      }
    >
      {count > 0 ? (
        hidden ? (
          <div
            ref={draggableFresh ? fresh.setNodeRef : undefined}
            {...(draggableFresh ? { ...fresh.attributes, ...fresh.listeners } : {})}
            data-pile-drag={draggableFresh ? loc : undefined}
            className={cn('absolute inset-0 touch-none', fresh.isDragging && 'opacity-40')}
          >
            <PileBack loc={loc} />
          </div>
        ) : top ? (
          cards
        ) : null
      ) : null}
    </Cell>
  )
}

function Hand({ p }: { p: PlayerIdx }) {
  const { t } = useTranslation()
  const { view, highlight } = useField()
  const uids = zoneCards(view.state, p, 'hand')
  const id = destKey({ t: 'pile', p, loc: 'hand' })
  const { setNodeRef, isOver } = useDroppable({ id })
  const valid = !!highlight && highlight.has(id)
  const dim = !!highlight && !valid
  const random = p === 0 ? view.randomHand : 0
  const style = { ...pos(p, 'hand'), ['--n' as string]: Math.max(uids.length + (random > 0 ? 1 : 0), 2) } as CSSProperties
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      data-valid={valid || undefined}
      aria-label={t('combos.pile.hand')}
      className={cn('cl-cell cl-hand rounded-md', p === 0 ? 'cl-own' : 'cl-hand-opp', valid && 'cl-valid', valid && isOver && 'cl-over', dim && 'cl-dim')}
      style={{ ...style, containerType: 'normal' }}
    >
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 rounded-md border border-dashed',
          p === 0 ? 'border-accent-text/35' : 'border-line-strong/45',
          valid && 'border-solid border-accent-text bg-accent-soft',
          valid && isOver && 'bg-accent-text/25',
        )}
      />
      {uids.length === 0 && random === 0 ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-xs font-medium text-subtle">{t('combos.pile.hand')}</span>
      ) : null}
      {uids.map((uid, i) => (
        <div key={uid} className="cl-hand-item" style={{ zIndex: i + 1 }}>
          <FieldCard uid={uid} />
        </div>
      ))}
      {random > 0 ? (
        <span
          className="cl-hand-item pointer-events-none grid place-items-center text-center font-medium text-muted"
          style={{ zIndex: uids.length + 1 }}
          title={t('combos.randomHandLong', { count: random })}
        >
          <span aria-label={t('combos.randomHandLong', { count: random })} className="whitespace-nowrap rounded-full border border-line-strong bg-surface-1 px-2 py-0.5 text-[clamp(9px,calc(var(--tw)*0.2),13px)]">
            {t('combos.randomHand', { count: random })}
          </span>
        </span>
      ) : null}
    </div>
  )
}

function LpBox({ p }: { p: PlayerIdx }) {
  const { t } = useTranslation()
  const { view, onLp, readOnly } = useField()
  const style = pos(p, 'lp')
  return (
    <div className="cl-cell" style={style}>
      <button
        type="button"
        data-lp={p}
        disabled={readOnly}
        onClick={() => onLp(p)}
        aria-label={t(p === 0 ? 'combos.lp.own' : 'combos.lp.opponent', { lp: view.state.lp[p] })}
        className={cn(
          'pointer-events-auto absolute inset-0 flex flex-col items-center justify-center rounded-[6px] border bg-surface-2 leading-none enabled:cursor-pointer enabled:hover:border-accent-text',
          p === 0 ? 'border-accent-text/50' : 'border-line-strong/60',
        )}
      >
        <span className="text-[clamp(8px,calc(var(--tw)*0.17),12px)] font-medium text-subtle">{t('combos.lp.label')}</span>
        <span className="mt-1 text-[clamp(11px,calc(var(--tw)*0.3),22px)] font-semibold tabular-nums text-fg">{view.state.lp[p]}</span>
      </button>
    </div>
  )
}

function ZoneCard({ p, loc, seq }: { p: PlayerIdx; loc: ZoneLoc; seq: number }) {
  const { view } = useField()
  const occ = occupantAt(view.state, p, loc, seq)
  return occ ? <FieldCard key={occ} uid={occ} /> : null
}

function Side({ p }: { p: PlayerIdx }) {
  const { t } = useTranslation()
  const { view } = useField()
  const seqs = [0, 1, 2, 3, 4]
  return (
    <>
      {seqs.map((i) => (
        <Cell key={`m${i}`} dest={{ t: 'zone', p, loc: 'mzone', seq: i }} p={p} style={pos(p, 'm', i)} oppMain occupant={occupantAt(view.state, p, 'mzone', i)}>
          <ZoneCard p={p} loc="mzone" seq={i} />
        </Cell>
      ))}
      {seqs.map((i) => (
        <Cell
          key={`s${i}`}
          dest={{ t: 'zone', p, loc: 'szone', seq: i }}
          p={p}
          style={pos(p, 's', i)}
          oppMain
          label={i === 0 || i === 4 ? <span className="text-accent-text">{t('combos.zone.pendulum')}</span> : undefined}
          occupant={occupantAt(view.state, p, 'szone', i)}
        >
          <ZoneCard p={p} loc="szone" seq={i} />
        </Cell>
      ))}
      <Cell dest={{ t: 'zone', p, loc: 'fzone', seq: 0 }} p={p} style={pos(p, 'f')} oppMain label={t('combos.zone.field')} occupant={occupantAt(view.state, p, 'fzone', 0)}>
        <ZoneCard p={p} loc="fzone" seq={0} />
      </Cell>
      <Pile p={p} loc="gy" style={pos(p, 'gy')} />
      <Pile p={p} loc="extra" style={pos(p, 'extra')} />
      <Pile p={p} loc="deck" style={pos(p, 'deck')} />
      <Pile p={p} loc="banished" style={pos(p, 'banished')} />
      <Hand p={p} />
      <LpBox p={p} />
    </>
  )
}

/**
 * Contenitore del blocco campo + mano: rapporto fisso FIELD_ASPECT_RATIO, scalato per riempire il minimo tra larghezza e
 * altezza disponibili e centrato. Il genitore deve avere un'altezza definita (es. `h-full` in un flex con `min-h-0`).
 */
export function FieldFrame({ children, ring, className }: { children: ReactNode; ring?: boolean; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className="cl-stage">
      <div data-field role="group" aria-label={t('combos.field')} className={cn('cl-field', ring && 'outline outline-2 outline-offset-2 outline-accent-text', className)}>
        {children}
      </div>
    </div>
  )
}

const NOOP = () => undefined
const NO_EMPHASIS: FieldEmphasis = {}

export function Field({
  view,
  ring,
  mineOnly = false,
  readOnly = false,
  emphasis = NO_EMPHASIS,
  selected = null,
  highlight = null,
  picking = null,
  onCardClick = NOOP,
  onCardDouble = NOOP,
  onCardMenu = NOOP,
  onCardKey = NOOP,
  onZone = NOOP,
  onPile,
  onLp = NOOP,
  renderMarks,
}: { view: FieldView; renderMarks?: (uid: Uid, code: number) => React.ReactNode; ring?: boolean; mineOnly?: boolean; readOnly?: boolean; emphasis?: FieldEmphasis } & Partial<FieldHandlers>) {
  const { t } = useTranslation()
  const hRef = useRef({ onCardClick, onCardDouble, onCardMenu, onCardKey })
  hRef.current = { onCardClick, onCardDouble, onCardMenu, onCardKey }
  const handlers = useMemo<Handlers>(
    () => ({
      click: (u) => hRef.current.onCardClick(u),
      double: (u) => hRef.current.onCardDouble(u),
      menu: (u, x, y) => hRef.current.onCardMenu(u, x, y),
      key: (u, e) => hRef.current.onCardKey(u, e),
    }),
    [],
  )
  return (
    <HandlersCtx.Provider value={handlers}>
    <FieldCtx.Provider value={{ view, readOnly, emphasis, selected, highlight, picking, onCardClick, onCardDouble, onCardMenu, onCardKey, onZone, onPile: onPile ?? NOOP, pilesOpen: !!onPile, onLp, renderMarks }}>
      <FieldFrame ring={ring} className={mineOnly ? 'cl-mine' : undefined}>
        <div className="cl-grid">
          <Side p={1} />
          {[0, 1].map((i) => {
            const occ = occupantAt(view.state, 0, 'emz', i) ?? occupantAt(view.state, 1, 'emz', i)
            return (
              <Cell
                key={`e${i}`}
                dest={{ t: 'zone', p: 0, loc: 'emz', seq: i }}
                p={0}
                style={pos(0, 'emz', i)}
                label={t('combos.zone.emz')}
                occupant={occ}
              >
                {occ ? <FieldCard key={occ} uid={occ} /> : null}
              </Cell>
            )
          })}
          <Side p={0} />
        </div>
      </FieldFrame>
    </FieldCtx.Provider>
    </HandlersCtx.Provider>
  )
}
