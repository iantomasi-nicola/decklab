/** Campo in sola lettura per il replay: stato del fotogramma corrente, carta attiva e catena evidenziate, movimenti animati. */
import { useMemo, useRef } from 'react'
import { Field, type FieldView } from '@/features/combos/Field'
import { poolTotal, remainingPool } from '@/features/combos/model'
import type { ComboDoc, Uid } from '@/domain/combo/types'
import type { Frame } from './replayModel'
import { useFlip } from './useFlip'
import './replay.css'

const SAFE = /^[A-Za-z0-9_-]+$/

export function ReplayField({ doc, frame, frameKey, nameOf, animate = true }: { doc: ComboDoc; frame: Frame; frameKey: string; nameOf: (code: number) => string; animate?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const pool = useMemo(() => remainingPool(doc), [doc])
  const view: FieldView = useMemo(
    () => ({
      state: frame.state,
      registry: doc.cards,
      nameOf,
      unrevealed: { deck: poolTotal(pool.main), extra: poolTotal(pool.extra) },
      randomHand: !frame.step && doc.setup.hand.fill === 'random' ? Math.max(0, doc.setup.hand.size - doc.setup.hand.required.length) : 0,
    }),
    [frame, doc, nameOf, pool],
  )
  const chain = useMemo<ReadonlySet<Uid> | undefined>(() => (frame.chain.length > 1 ? new Set(frame.chain) : undefined), [frame.chain])
  const css = useMemo(
    () =>
      frame.chain.length > 1
        ? frame.chain.filter((u) => SAFE.test(u)).map((u, i) => `.rp-field [data-card="${u}"] .cl-fit::after{content:"${i + 1}"}`).join('\n')
        : '',
    [frame.chain],
  )
  useFlip(ref, frameKey, animate)
  return (
    <div ref={ref} className="rp-field h-full min-h-0 w-full" data-testid="replay-field">
      {css ? <style>{css}</style> : null}
      <Field view={view} readOnly emphasis={{ ...(frame.active ? { active: frame.active } : {}), ...(chain ? { chain } : {}) }} />
    </div>
  )
}
