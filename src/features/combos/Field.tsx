/**
 * Campo di gioco completo (due giocatori). Riempie lo spazio del contenitore: dimensioni e disposizione
 * (verticale 7×7 / orizzontale 9×5) sono pura CSS (field.css, container query). Per l'avversario le colonne
 * sono specchiate (vista dal giocatore).
 */
import { createContext, useContext, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import Ban from 'lucide-react/icons/ban'
import Check from 'lucide-react/icons/check'
import Layers from 'lucide-react/icons/layers'
import Skull from 'lucide-react/icons/skull'
import Sparkles from 'lucide-react/icons/sparkles'
import { overlaysOf, zoneCards, type GameState } from '@/domain/combo/state'
import type { PlayerIdx, Uid } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
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
}

/** Larghezza / altezza del blocco campo + mano (mano propria SEMPRE sotto il campo). */
export const FIELD_ASPECT_RATIO = 100 / 103.07

/** Evidenziazione per replay/guida: carta attiva e carte della catena. */
export interface FieldEmphasis {
  active?: Uid
  chain?: ReadonlySet<Uid>
}

export interface FieldHandlers {
  selected: Uid | null
  highlight: ReadonlySet<string> | null
  picking: { candidates: ReadonlySet<Uid>; chosen: ReadonlySet<Uid> } | null
  onCardClick: (uid: Uid) => void
  onCardDouble: (uid: Uid) => void
  onCardMenu: (uid: Uid, x: number, y: number) => void
  onCardKey: (uid: Uid, e: KeyboardEvent) => void
  onZone: (dest: Dest, el: HTMLElement) => void
  onPile: (p: PlayerIdx, loc: PileLoc) => void
  onLp: (p: PlayerIdx) => void
}

interface Ctx extends FieldHandlers { view: FieldView; readOnly: boolean; emphasis: FieldEmphasis; pilesOpen: boolean }
const FieldCtx = createContext<Ctx | null>(null)
const useField = () => {
  const c = useContext(FieldCtx)
  if (!c) throw new Error('Field context')
  return c
}

export const cardDragId = (uid: Uid) => `card:${uid}`
export const freshDragId = (p: PlayerIdx, loc: 'deck' | 'extra') => `fresh:${p}:${loc}`

/* ---------------------------------------------------------------- posizionamento */
type Row = 'hand' | 'back' | 'front' | 'mid'
const ROW: Record<PlayerIdx, Record<Row, number>> = {
  1: { hand: 1, back: 2, front: 3, mid: 4 },
  0: { mid: 4, front: 5, back: 6, hand: 7 },
}
const mirror = (p: PlayerIdx, col: number) => (p === 1 ? 8 - col : col)

/** `col` = colonna 1–7 dal punto di vista del proprietario (l'avversario è specchiato). */
const at = (p: PlayerIdx, row: Row, col: number): CSSProperties => ({ gridRow: ROW[p][row], gridColumn: mirror(p, col) })

/* ---------------------------------------------------------------- cella */
function Cell({
  dest,
  p,
  style,
  label,
  children,
  overlay,
  occupant,
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
  onOpen?: () => void
}) {
  const { highlight, onZone } = useField()
  const id = destKey(dest)
  const { setNodeRef, isOver } = useDroppable({ id })
  const valid = !!highlight && (highlight.has(id) || (occupant !== undefined && highlight.has(`c:${occupant}`)))
  const dim = !!highlight && !valid
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      data-valid={valid || undefined}
      onClick={(e) => {
        if (valid) onZone(dest, e.currentTarget)
        else if (!(e.target as HTMLElement).closest('[data-card]')) onOpen?.()
      }}
      className={cn('cl-cell', p === 0 && 'cl-own', valid && 'cl-valid', valid && isOver && 'cl-over', dim && 'cl-dim')}
      style={style}
    >
      <div aria-hidden className="cl-box cl-zone" />
      {label ? <div className="cl-label">{label}</div> : null}
      {children}
      {overlay ? <div className="cl-box z-20">{overlay}</div> : null}
    </div>
  )
}

/* ---------------------------------------------------------------- carta */
function CardBadges({ uid }: { uid: Uid }) {
  const { view } = useField()
  const c = view.state.counters[uid]
  const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0
  const ov = overlaysOf(view.state, uid).length
  return (
    <>
      {total ? <span className="cl-badge -left-1 -top-1" data-counters={total}>●{total}</span> : null}
      {ov ? <span className="cl-badge -bottom-1 -left-1" data-overlays={ov}>×{ov}</span> : null}
    </>
  )
}

/** Carta in campo/mano/pila: trascinabile, cliccabile, con menu contestuale. */
function FieldCard({ uid, inPile }: { uid: Uid; inPile?: boolean }) {
  const { view, selected, picking, highlight, onCardClick, onCardDouble, onCardMenu, onCardKey, readOnly, emphasis } = useField()
  const place = view.state.places[uid]
  const code = view.registry[uid] ?? 0
  const name = view.nameOf(code)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardDragId(uid), data: { uid }, disabled: readOnly })
  const lastTap = useRef(0)
  if (!place) return null
  const isSel = selected === uid
  const cand = picking?.candidates.has(uid)
  const chosen = picking?.chosen.has(uid)
  const def = isDefPos(place.pos)
  const active = emphasis.active === uid
  const inChain = emphasis.chain?.has(uid)
  const interactive = readOnly
    ? {}
    : {
        ...attributes,
        ...listeners,
        role: 'button',
        tabIndex: 0,
        'aria-roledescription': '',
        'aria-pressed': isSel,
        onClick: () => {
          if (inPile && highlight) return // il clic spetta alla pila (destinazione)
          const now = Date.now()
          if (now - lastTap.current < 350) {
            lastTap.current = 0
            onCardDouble(uid)
          } else {
            lastTap.current = now
            onCardClick(uid)
          }
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault()
          onCardMenu(uid, e.clientX, e.clientY)
        },
        onKeyDown: (e: React.KeyboardEvent) => {
          listeners?.onKeyDown?.(e)
          onCardKey(uid, e)
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
      aria-label={name}
      title={name}
      className={cn(
        'absolute inset-0 flex select-none items-center justify-center outline-none',
        readOnly ? 'pointer-events-none' : 'touch-none',
        isDragging && 'opacity-30',
        picking && !cand && 'opacity-45',
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
            isSel && 'shadow-[0_0_0_3px_var(--accent-text)]',
            cand && !chosen && 'shadow-[0_0_0_3px_var(--ok)]',
            chosen && 'shadow-[0_0_0_4px_var(--ok)]',
            inChain && 'shadow-[0_0_0_3px_var(--warn)]',
            active && 'shadow-[0_0_0_4px_var(--accent-text),0_0_16px_2px_var(--accent-text)]',
          )}
        />
        {!inPile && <CardBadges uid={uid} />}
        {chosen ? (
          <span className="cl-badge -right-1 -top-1 grid place-items-center !bg-ok !text-bg">
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
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

function Pile({ p, loc, style }: { p: PlayerIdx; loc: PileLoc; style: CSSProperties }) {
  const { t } = useTranslation()
  const { view, onPile, readOnly, pilesOpen } = useField()
  const placed = zoneCards(view.state, p, loc)
  const unrevealed = p === 0 ? (loc === 'deck' ? view.unrevealed.deck : loc === 'extra' ? view.unrevealed.extra : 0) : 0
  const count = placed.length + unrevealed
  const top = placed[placed.length - 1]
  const hidden = loc === 'deck' || loc === 'extra'
  const Icon = loc === 'gy' ? Skull : loc === 'banished' ? Ban : loc === 'deck' ? Layers : Sparkles
  const draggableFresh = !readOnly && hidden && p === 0 && unrevealed > 0
  // un id per pila (anche se disattivata): ids duplicati si sovrascriverebbero nel registro di dnd-kit
  const fresh = useDraggable({ id: hidden ? freshDragId(p, loc as 'deck' | 'extra') : `none:${p}:${loc}`, data: { fresh: loc }, disabled: !draggableFresh })
  const name = t(`combos.pile.${loc}`)
  return (
    <Cell
      dest={{ t: 'pile', p, loc }}
      p={p}
      style={style}
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
          <button
            type="button"
            aria-label={`${name}: ${count}`}
            data-pile={`${p}:${loc}`}
            onClick={(e) => {
              e.stopPropagation()
              onPile(p, loc)
            }}
            className="cl-badge pointer-events-auto -bottom-1 -right-1 cursor-pointer before:absolute before:-inset-2.5 before:content-[''] hover:border-accent-text"
          >
            {count}
          </button>
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
          <FieldCard uid={top} inPile />
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
  const style = { gridRow: ROW[p].hand, gridColumn: p === 0 ? '1 / 7' : '2 / 8', ['--n' as string]: Math.max(uids.length + (random > 0 ? 1 : 0), 2) } as CSSProperties
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
          <span aria-label={t('combos.randomHandLong', { count: random })} className="whitespace-nowrap rounded-full border border-line-strong bg-surface-1 px-2 py-0.5 text-[clamp(9px,22cqw,13px)]">
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
  const style = at(p, 'hand', 7)
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
        <span className="text-[clamp(8px,15cqw,12px)] font-medium text-subtle">{t('combos.lp.label')}</span>
        <span className="mt-1 text-[clamp(11px,26cqw,22px)] font-semibold tabular-nums text-fg">{view.state.lp[p]}</span>
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
        <Cell key={`m${i}`} dest={{ t: 'zone', p, loc: 'mzone', seq: i }} p={p} style={at(p, 'front', 2 + i)} occupant={occupantAt(view.state, p, 'mzone', i)}>
          <ZoneCard p={p} loc="mzone" seq={i} />
        </Cell>
      ))}
      {seqs.map((i) => (
        <Cell
          key={`s${i}`}
          dest={{ t: 'zone', p, loc: 'szone', seq: i }}
          p={p}
          style={at(p, 'back', 2 + i)}
          label={i === 0 || i === 4 ? <span className="text-accent-text">{t('combos.zone.pendulum')}</span> : undefined}
          occupant={occupantAt(view.state, p, 'szone', i)}
        >
          <ZoneCard p={p} loc="szone" seq={i} />
        </Cell>
      ))}
      <Cell dest={{ t: 'zone', p, loc: 'fzone', seq: 0 }} p={p} style={at(p, 'front', 1)} label={t('combos.zone.field')} occupant={occupantAt(view.state, p, 'fzone', 0)}>
        <ZoneCard p={p} loc="fzone" seq={0} />
      </Cell>
      <Pile p={p} loc="gy" style={at(p, 'front', 7)} />
      <Pile p={p} loc="extra" style={at(p, 'back', 1)} />
      <Pile p={p} loc="deck" style={at(p, 'back', 7)} />
      <Pile p={p} loc="banished" style={at(p, 'mid', 7)} />
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
}: { view: FieldView; ring?: boolean; readOnly?: boolean; emphasis?: FieldEmphasis } & Partial<FieldHandlers>) {
  const { t } = useTranslation()
  return (
    <FieldCtx.Provider value={{ view, readOnly, emphasis, selected, highlight, picking, onCardClick, onCardDouble, onCardMenu, onCardKey, onZone, onPile: onPile ?? NOOP, pilesOpen: !!onPile, onLp }}>
      <FieldFrame ring={ring}>
        <div className="cl-grid">
          <Side p={1} />
          {[0, 1].map((i) => {
            const occ = occupantAt(view.state, 0, 'emz', i) ?? occupantAt(view.state, 1, 'emz', i)
            return (
              <Cell
                key={`e${i}`}
                dest={{ t: 'zone', p: 0, loc: 'emz', seq: i }}
                p={0}
                style={{ gridRow: 4, gridColumn: 3 + i * 2 }}
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
  )
}
