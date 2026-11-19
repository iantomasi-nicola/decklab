/** Riordino (SORT_CARD / SORT_CHAIN): righe trascinabili dalla maniglia + frecce su/giù (≥44px) per tastiera e touch. */
import { useRef, useState } from 'react'
import ChevronDown from 'lucide-react/icons/chevron-down'
import ChevronUp from 'lucide-react/icons/chevron-up'
import GripVertical from 'lucide-react/icons/grip-vertical'
import type { Answer } from '@/engine/protocol'
import { answerSort } from '@/engine/answers'
import type { Opt, PendingRequest } from '@/engine/requests'
import { playSound } from '@/features/sound'
import { CardBox, EngBtn, Sheet, useNames, useRequestKeys } from './parts'

type Req = Extract<PendingRequest, { kind: 'sort' }>

export function SortRequest({ req, onAnswer }: { req: Req; onAnswer: (a: Answer) => void }) {
  const { nameOf, t } = useNames()
  const [order, setOrder] = useState<Opt[]>(req.cards)
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const grab = useRef(0)
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((o) => {
      const n = [...o]
      n.splice(to, 0, n.splice(from, 1)[0]!)
      return n
    })
    playSound('targetSelect')
  }
  const confirm = () => {
    const same = order.every((o, i) => o.index === req.cards[i]!.index)
    playSound('targetConfirm')
    onAnswer(answerSort(same ? null : order.map((o) => o.index)))
  }
  useRequestKeys({ enter: confirm })

  const onDown = (e: React.PointerEvent, i: number) => {
    const row = (e.currentTarget as HTMLElement).closest('li') as HTMLElement
    grab.current = e.clientY - (row.getBoundingClientRect().top + row.offsetHeight / 2)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ index: i, dy: 0 })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag || !listRef.current) return
    const rows = [...listRef.current.children] as HTMLElement[]
    const centerY = e.clientY - grab.current
    let target = drag.index
    rows.forEach((r, idx) => {
      if (idx === drag.index) return
      const b = r.getBoundingClientRect()
      const mid = b.top + b.height / 2
      if (idx < drag.index && centerY < mid) target = Math.min(target, idx)
      if (idx > drag.index && centerY > mid) target = Math.max(target, idx)
    })
    const cur = rows[drag.index]!
    const natural = cur.getBoundingClientRect().top - drag.dy + cur.offsetHeight / 2
    if (target !== drag.index) {
      move(drag.index, target)
      setDrag({ index: target, dy: centerY - natural })
    } else setDrag({ index: drag.index, dy: centerY - natural })
  }
  const title = t(req.mode === 'chain' ? 'sel.sortChainTitle' : 'sel.sortTitle')
  return (
    <Sheet
      testId="req-sort"
      title={title}
      subtitle={t('sel.sortHint')}
      footer={
        <>
          <EngBtn onClick={() => onAnswer(answerSort(null))} data-testid="sort-auto">{t('sel.sortAuto')}</EngBtn>
          <EngBtn primary onClick={confirm} data-testid="sort-confirm">{t('sel.sortDone')}</EngBtn>
        </>
      }
    >
      <ul ref={listRef} className="relative flex flex-col gap-2 pb-3">
        {order.map((o, i) => (
          <li
            key={o.uid + o.index}
            className="eng-row eng-sort-row !cursor-default"
            data-dragging={drag?.index === i || undefined}
            style={drag?.index === i ? { transform: `translateY(${drag.dy}px)`, zIndex: 2, touchAction: 'none' } : undefined}
            data-testid={`sort-row-${i}`}
          >
            <button
              type="button"
              aria-label={nameOf(o.code)}
              className="-ml-2 -mr-1 grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted hover:text-fg"
              onPointerDown={(e) => onDown(e, i)}
              onPointerMove={onMove}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              <GripVertical aria-hidden size={20} />
            </button>
            <span className="relative shrink-0">
              <CardBox code={o.code} name={nameOf(o.code)} width={36} pos={o.place.pos} />
              <span className="eng-order" aria-hidden>{i + 1}</span>
            </span>
            <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-medium leading-snug">{nameOf(o.code)}</span>
            <span className="flex shrink-0">
              <button type="button" className="grid size-11 place-items-center rounded-md text-muted enabled:hover:text-fg disabled:opacity-35" disabled={i === 0} aria-label={t('sel.sortMoveUp', { name: nameOf(o.code) })} onClick={() => move(i, i - 1)}>
                <ChevronUp aria-hidden size={20} />
              </button>
              <button type="button" className="grid size-11 place-items-center rounded-md text-muted enabled:hover:text-fg disabled:opacity-35" disabled={i === order.length - 1} aria-label={t('sel.sortMoveDown', { name: nameOf(o.code) })} onClick={() => move(i, i + 1)}>
                <ChevronDown aria-hidden size={20} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
