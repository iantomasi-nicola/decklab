import { useDraggable } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import Ellipsis from 'lucide-react/icons/ellipsis'
import { zoneCards } from '@/domain/combo/state'
import type { PlayerIdx, Uid } from '@/domain/combo/types'
import { cn } from '@/ui/cn'
import { IconButton } from '@/ui/IconButton'
import { CardFace } from './CardFace'
import type { FieldView } from './Field'

/** Id di trascinamento della riga (distinto da `card:` usato sul campo: la stessa carta compare in entrambi). */
export const pileRowDragId = (uid: Uid) => `pile:${uid}`

function Row({ uid, newest, view, onMenu }: { uid: Uid; newest: boolean; view: FieldView; onMenu: (uid: Uid, x: number, y: number) => void }) {
  const { t } = useTranslation()
  const code = view.registry[uid] ?? 0
  const name = view.nameOf(code)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pileRowDragId(uid), data: { uid } })
  const open = (el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    onMenu(uid, r.left + r.width / 2, r.top + r.height / 2)
  }
  return (
    <li
      data-pile-row={uid}
      data-newest={newest || undefined}
      className={cn('flex min-h-14 items-center gap-2 rounded-md border p-1.5', newest ? 'border-accent-text bg-accent-soft' : 'border-line bg-surface-1', isDragging && 'opacity-40')}
    >
      <div ref={setNodeRef} {...attributes} {...listeners} aria-label={name} data-pile-row-drag={uid} className="w-9 shrink-0 cursor-grab touch-none rounded-[6px]">
        <CardFace code={code} name={name} />
      </div>
      <button type="button" onClick={(e) => open(e.currentTarget)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center text-left" data-pile-row-open={uid}>
        <span className="truncate text-[15px] font-medium text-fg">{name}</span>
        {newest ? <span className="text-xs text-accent-text">{t('combos.piles.newest')}</span> : null}
      </button>
      <IconButton label={t('combos.piles.actions', { name })} icon={<Ellipsis size={20} />} onClick={(e) => open(e.currentTarget)} />
    </li>
  )
}

function Section({ p, loc, view, onMenu }: { p: PlayerIdx; loc: 'gy' | 'banished'; view: FieldView; onMenu: (uid: Uid, x: number, y: number) => void }) {
  const { t } = useTranslation()
  const uids = zoneCards(view.state, p, loc)
  const title = t(`combos.piles.${loc}${p === 0 ? 'Own' : 'Opp'}`)
  return (
    <section aria-label={title} data-pile-section={`${p}:${loc}`} className="flex flex-col gap-2">
      <h3 className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        <span className="rounded-full border border-line-strong bg-surface-1 px-2 text-xs tabular-nums text-fg" data-count>
          {uids.length}
        </span>
      </h3>
      {uids.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-2 text-sm text-muted">{t('combos.piles.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {uids.map((uid, i) => (
            <Row key={uid} uid={uid} newest={i === uids.length - 1} view={view} onMenu={onMenu} />
          ))}
        </ol>
      )}
    </section>
  )
}

/** Cimitero e Bandite di entrambi i giocatori in ordine di arrivo; le azioni sono quelle del campo (menu o trascinamento). */
export function PilesPanel({ view, onMenu }: { view: FieldView; onMenu: (uid: Uid, x: number, y: number) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5" data-piles-panel>
      <p className="text-sm text-muted">{t('combos.piles.hint')}</p>
      <Section p={0} loc="gy" view={view} onMenu={onMenu} />
      <Section p={0} loc="banished" view={view} onMenu={onMenu} />
      <Section p={1} loc="gy" view={view} onMenu={onMenu} />
      <Section p={1} loc="banished" view={view} onMenu={onMenu} />
    </div>
  )
}
