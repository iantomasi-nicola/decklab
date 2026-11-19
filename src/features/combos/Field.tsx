/**
 * Campo di gioco completo (due giocatori). Si scala solo con CSS: il contenitore ha `container-type: size` e
 * rapporto fisso 100:141; tutto l'interno è in `cqw`, quindi nessuna carta può uscire dal campo (360–2560 px).
 * Colonne e righe: griglia 7×7. Per l'avversario le colonne sono specchiate (vista dal giocatore).
 */
import { createContext, useContext, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import Ban from 'lucide-react/icons/ban'
import Layers from 'lucide-react/icons/layers'
import Skull from 'lucide-react/icons/skull'
import Sparkles from 'lucide-react/icons/sparkles'
import Check from 'lucide-react/icons/check'
import { overlaysOf, zoneCards, type GameState } from '@/domain/combo/state'
import type { PlayerIdx, Uid } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { CardFace } from './CardFace'
import { destKey, occupantAt, type Dest, type PileLoc, type ZoneLoc } from './zones'

export interface FieldView {
  state: GameState
  registry: Record<Uid, number>
  nameOf: (code: number) => string
  /** carte del Deck/Extra proprio non ancora rivelate: [deck, extra] */
  unrevealed: { deck: number; extra: number }
  /** segnaposto "N carte casuali" nella mano propria */
  randomHand: number
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

interface Ctx extends FieldHandlers { view: FieldView }
const FieldCtx = createContext<Ctx | null>(null)
const useField = () => {
  const c = useContext(FieldCtx)
  if (!c) throw new Error('Field context')
  return c
}

export const cardDragId = (uid: Uid) => `card:${uid}`
export const freshDragId = (p: PlayerIdx, loc: 'deck' | 'extra') => `fresh:${p}:${loc}`

const mirror = (p: PlayerIdx, col: number) => (p === 1 ? 8 - col : col)

/** Posizione nella griglia 7×7 (riga/colonna 1-based) di ogni zona. */
function cell(p: PlayerIdx, kind: 'hand' | 'front' | 'back', col: number): CSSProperties {
  const row = p === 1 ? { hand: 1, back: 2, front: 3 }[kind] : { front: 5, back: 6, hand: 7 }[kind]
  return { gridRow: row, gridColumn: mirror(p, col) }
}

const BORDER_OWN = 'border-accent-text/35'
const BORDER_OPP = 'border-line-strong/45'

function Slot({
  dest,
  p,
  style,
  label,
  children,
  className,
  occupant,
  onOpen,
}: {
  dest: Dest
  p: PlayerIdx
  style: CSSProperties
  label?: ReactNode
  children?: ReactNode
  className?: string
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
      className={cn(
        'relative min-w-0 rounded-[0.9cqw] border border-dashed bg-surface-1/60 transition-[opacity,box-shadow,background-color] duration-150',
        p === 0 ? BORDER_OWN : BORDER_OPP,
        valid && 'cursor-pointer border-solid border-accent-text bg-accent-soft shadow-[0_0_0_0.5cqw_color-mix(in_srgb,var(--accent-text)_35%,transparent)]',
        valid && isOver && 'bg-accent-text/25',
        dim && 'opacity-45',
        className,
      )}
      style={style}
    >
      {label ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[max(8px,1.75cqw)] font-medium leading-none text-subtle">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  )
}

function CardCounters({ uid }: { uid: Uid }) {
  const { view } = useField()
  const c = view.state.counters[uid]
  const total = c ? Object.values(c).reduce((a, b) => a + b, 0) : 0
  const ov = overlaysOf(view.state, uid).length
  if (!total && !ov) return null
  const badge =
    'pointer-events-none absolute z-10 min-w-[3.4cqw] rounded-full border border-line-strong bg-surface-1 px-[0.7cqw] text-center text-[max(8px,2.1cqw)] font-semibold leading-[1.35] text-fg shadow-1'
  return (
    <>
      {total ? <span className={cn(badge, 'left-[-0.6cqw] top-[-0.6cqw]')} data-counters={total}>●{total}</span> : null}
      {ov ? <span className={cn(badge, 'bottom-[-0.6cqw] left-[-0.6cqw]')} data-overlays={ov}>×{ov}</span> : null}
    </>
  )
}

/** Carta in campo/mano/pila: trascinabile, cliccabile, con menu contestuale. */
function FieldCard({ uid, className, style, inPile }: { uid: Uid; className?: string; style?: CSSProperties; inPile?: boolean }) {
  const { view, selected, picking, highlight, onCardClick, onCardDouble, onCardMenu, onCardKey } = useField()
  const place = view.state.places[uid]
  const code = view.registry[uid] ?? 0
  const name = view.nameOf(code)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: cardDragId(uid), data: { uid } })
  const lastTap = useRef(0)
  if (!place) return null
  const isSel = selected === uid
  const cand = picking?.candidates.has(uid)
  const chosen = picking?.chosen.has(uid)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-card={uid}
      data-loc={place.loc}
      role="button"
      tabIndex={0}
      aria-roledescription=""
      aria-label={name + (place.pos === 'FACEDOWN' || place.pos === 'FACEDOWN_DEF' ? ' (·)' : '')}
      aria-pressed={isSel}
      title={name}
      onClick={() => {
        if (inPile && highlight) return // il clic spetta alla pila (destinazione)
        const now = Date.now()
        if (now - lastTap.current < 350) {
          lastTap.current = 0
          onCardDouble(uid)
        } else {
          lastTap.current = now
          onCardClick(uid)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onCardMenu(uid, e.clientX, e.clientY)
      }}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        onCardKey(uid, e)
      }}
      className={cn(
        'absolute inset-0 flex touch-none select-none items-center justify-center outline-none',
        isDragging && 'opacity-30',
        picking && !cand && 'opacity-45',
        className,
      )}
      style={style}
    >
      <div className="relative w-full" style={{ aspectRatio: '59 / 86' }}>
        <CardFace
          code={code}
          name={name}
          pos={place.pos}
          className={cn(
            'rounded-[6px] transition-shadow duration-150',
            isSel && 'shadow-[0_0_0_0.55cqw_var(--accent-text)]',
            cand && !chosen && 'shadow-[0_0_0_0.45cqw_var(--ok)]',
            chosen && 'shadow-[0_0_0_0.7cqw_var(--ok)]',
          )}
        />
        {!inPile && <CardCounters uid={uid} />}
        {chosen ? (
          <span className="absolute right-[-0.6cqw] top-[-0.6cqw] grid size-[4cqw] place-items-center rounded-full bg-ok text-bg">
            <Check className="size-[70%]" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Pile({ p, loc, col, kind }: { p: PlayerIdx; loc: PileLoc; col: number; kind: 'front' | 'back' | 'hand' }) {
  const { t } = useTranslation()
  const { view, onPile } = useField()
  const placed = zoneCards(view.state, p, loc)
  const unrevealed = p === 0 ? (loc === 'deck' ? view.unrevealed.deck : loc === 'extra' ? view.unrevealed.extra : 0) : 0
  const count = placed.length + unrevealed
  const top = placed[placed.length - 1]
  const hidden = loc === 'deck' || loc === 'extra'
  const Icon = loc === 'gy' ? Skull : loc === 'banished' ? Ban : loc === 'deck' ? Layers : Sparkles
  const draggableFresh = hidden && p === 0 && unrevealed > 0
  const fresh = useDraggable({ id: freshDragId(p, loc === 'extra' ? 'extra' : 'deck'), data: { fresh: loc }, disabled: !draggableFresh })
  const name = t(`combos.pile.${loc}`)
  return (
    <Slot
      dest={{ t: 'pile', p, loc }}
      p={p}
      style={cell(p, kind, col)}
      onOpen={count > 0 ? () => onPile(p, loc) : undefined}
      label={
        count === 0 ? (
          <span className="flex flex-col items-center gap-[0.6cqw]">
            <Icon aria-hidden className="size-[4.4cqw] opacity-70" />
            <span className="max-w-full truncate px-[0.4cqw]">{name}</span>
          </span>
        ) : undefined
      }
    >
      {count > 0 ? (
        <>
          {hidden ? (
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
          ) : null}
        </>
      ) : null}
      <button
        type="button"
        aria-label={`${name}: ${count}`}
        data-pile={`${p}:${loc}`}
        onClick={(e) => {
          e.stopPropagation()
          onPile(p, loc)
        }}
        className="absolute bottom-[-0.8cqw] right-[-0.8cqw] z-20 grid min-h-[5.2cqw] before:absolute before:-inset-2.5 before:content-[''] min-w-[5.2cqw] cursor-pointer place-items-center rounded-full border border-line-strong bg-surface-1 px-[0.9cqw] text-[max(9px,2.5cqw)] font-semibold tabular-nums leading-none text-fg shadow-1 hover:border-accent-text"
      >
        {count}
      </button>
    </Slot>
  )
}

function PileBack({ loc }: { loc: PileLoc }) {
  const Icon = loc === 'extra' ? Sparkles : Layers
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 translate-x-[0.5cqw] translate-y-[0.5cqw] rounded-[6px] border border-line bg-surface-3" />
      <div
        className="absolute inset-0 grid place-items-center rounded-[6px] border border-line-strong text-accent-text"
        style={{ background: 'linear-gradient(160deg, var(--accent-soft) 0%, var(--surface-3) 60%, var(--surface-2) 100%)' }}
      >
        <Icon aria-hidden className="size-[42%] opacity-80" />
      </div>
    </div>
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
  const n = Math.max(uids.length, 2)
  const random = p === 0 ? view.randomHand : 0
  return (
    <div
      ref={setNodeRef}
      data-zone={id}
      data-valid={valid || undefined}
      className={cn(
        'relative flex min-w-0 items-stretch justify-center rounded-[0.9cqw] border border-dashed transition-[opacity,box-shadow,background-color] duration-150',
        p === 0 ? BORDER_OWN : BORDER_OPP,
        valid && 'border-solid border-accent-text bg-accent-soft',
        valid && isOver && 'bg-accent-text/25',
        dim && 'opacity-45',
      )}
      style={{ gridRow: p === 1 ? 1 : 7, gridColumn: '2 / 7', ['--n' as string]: n, ['--g' as string]: '1.2cqw' }}
      aria-label={t('combos.pile.hand')}
    >
      {uids.length === 0 && random === 0 ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[max(8px,1.75cqw)] font-medium text-subtle">
          {t('combos.pile.hand')}
        </span>
      ) : null}
      {uids.map((uid, i) => (
        <div
          key={uid}
          className="relative h-full shrink-0 hover:z-[40] focus-within:z-[40]"
          style={{
            width: 'calc((100% - 4 * var(--g)) / 5)',
            marginLeft: i === 0 ? 0 : 'min(var(--g), calc((100% - var(--n) * (100% - 4 * var(--g)) / 5) / (var(--n) - 1)))',
            zIndex: i + 1,
            // il padding della cella è già nella griglia: la mano riempie tutta la riga
          }}
        >
          <FieldCard uid={uid} />
        </div>
      ))}
      {random > 0 ? (
        <span className="pointer-events-none absolute bottom-[0.8cqw] right-[0.8cqw] z-[50] rounded-full border border-line-strong bg-surface-1 px-[1.2cqw] py-[0.5cqw] text-[max(8px,1.9cqw)] font-medium text-fg-muted">
          {t('combos.randomHand', { count: random })}
        </span>
      ) : null}
    </div>
  )
}

function LpBox({ p }: { p: PlayerIdx }) {
  const { t } = useTranslation()
  const { view, onLp } = useField()
  return (
    <button
      type="button"
      data-lp={p}
      onClick={() => onLp(p)}
      aria-label={t(p === 0 ? 'combos.lp.own' : 'combos.lp.opponent', { lp: view.state.lp[p] })}
      className={cn(
        'flex min-w-0 cursor-pointer flex-col items-center justify-center rounded-[0.9cqw] border bg-surface-2 leading-none hover:border-accent-text',
        p === 0 ? 'border-accent-text/50' : 'border-line-strong/60',
      )}
      style={{ gridRow: p === 1 ? 1 : 7, gridColumn: mirror(p, 7) }}
    >
      <span className="text-[max(8px,1.9cqw)] font-medium text-subtle">{t('combos.lp.label')}</span>
      <span className="mt-[0.6cqw] text-[max(11px,3.9cqw)] font-semibold tabular-nums text-fg">{view.state.lp[p]}</span>
    </button>
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
        <Slot
          key={`m${i}`}
          dest={{ t: 'zone', p, loc: 'mzone', seq: i }}
          p={p}
          style={cell(p, 'front', 2 + i)}
          occupant={occupantAt(view.state, p, 'mzone', i)}
        >
          <ZoneCard p={p} loc="mzone" seq={i} />
        </Slot>
      ))}
      {seqs.map((i) => (
        <Slot
          key={`s${i}`}
          dest={{ t: 'zone', p, loc: 'szone', seq: i }}
          p={p}
          style={cell(p, 'back', 2 + i)}
          label={i === 0 || i === 4 ? <span className="text-accent-text">{t('combos.zone.pendulum')}</span> : undefined}
          occupant={occupantAt(view.state, p, 'szone', i)}
        >
          <ZoneCard p={p} loc="szone" seq={i} />
        </Slot>
      ))}
      <Slot
        dest={{ t: 'zone', p, loc: 'fzone', seq: 0 }}
        p={p}
        style={cell(p, 'front', 1)}
        label={t('combos.zone.field')}
        occupant={occupantAt(view.state, p, 'fzone', 0)}
      >
        <ZoneCard p={p} loc="fzone" seq={0} />
      </Slot>
      <Pile p={p} loc="gy" col={7} kind="front" />
      <Pile p={p} loc="extra" col={1} kind="back" />
      <Pile p={p} loc="deck" col={7} kind="back" />
      <Pile p={p} loc="banished" col={1} kind="hand" />
      <Hand p={p} />
      <LpBox p={p} />
    </>
  )
}

export function Field({ view, ...handlers }: { view: FieldView } & FieldHandlers) {
  const { t } = useTranslation()
  return (
    <FieldCtx.Provider value={{ view, ...handlers }}>
      <div
        data-field
        role="group"
        aria-label={t('combos.field')}
        className="relative mx-auto overflow-hidden rounded-lg border border-line"
        style={{
          containerType: 'size',
          aspectRatio: '100 / 141',
          width: 'min(100%, max(340px, calc((100dvh - var(--field-chrome, 200px)) * 100 / 141)))',
          background:
            'linear-gradient(180deg, var(--surface-1) 0%, var(--surface-1) 42%, color-mix(in srgb, var(--accent-soft) 55%, var(--surface-1)) 100%)',
        }}
      >
        <div aria-hidden className="absolute inset-x-[2cqw] top-1/2 h-px bg-line" />
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
            gap: '1.2cqw',
            padding: '2cqw',
          }}
        >
          <Side p={1} />
          {[0, 1].map((i) => (
            <Slot
              key={`e${i}`}
              dest={{ t: 'zone', p: 0, loc: 'emz', seq: i }}
              p={0}
              style={{ gridRow: 4, gridColumn: 3 + i * 2 }}
              label={t('combos.zone.emz')}
              occupant={occupantAt(view.state, 0, 'emz', i) ?? occupantAt(view.state, 1, 'emz', i)}
            >
              {(() => {
                const o = occupantAt(view.state, 0, 'emz', i) ?? occupantAt(view.state, 1, 'emz', i)
                return o ? <FieldCard key={o} uid={o} /> : null
              })()}
            </Slot>
          ))}
          <Side p={0} />
        </div>
      </div>
    </FieldCtx.Provider>
  )
}
