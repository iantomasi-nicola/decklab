import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zoneCards } from '@/domain/combo/state'
import type { PlayerIdx } from '@/domain/combo/types'
import { BottomSheet } from '@/ui/BottomSheet'
import { Dialog } from '@/ui/Dialog'
import { Input } from '@/ui/Input'
import { CardFace } from './CardFace'
import type { FieldView } from './Field'
import type { Sel } from './selection'
import { useMediaQuery } from './useCards'
import type { PileLoc } from './zones'

export interface PileSheetProps {
  p: PlayerIdx
  loc: PileLoc
  view: FieldView
  /** carte non ancora rivelate (solo Deck/Extra proprio): [passcode, copie] */
  pool: [number, number][]
  /** true = si sta scegliendo la carta da portare nella destinazione già scelta (rilascio dal Deck/Extra) */
  picking: boolean
  onClose: () => void
  onSelect: (sel: Sel) => void
  onMove: (sel: Sel) => void
}

/** Vista di una pila (Cimitero, Bandite, Deck, Extra): bottom sheet su telefono, finestra su tablet/PC. */
export function PileSheet({ p, loc, view, pool, picking, onClose, onSelect, onMove }: PileSheetProps) {
  const { t } = useTranslation()
  const wide = useMediaQuery('(min-width: 768px)')
  const [q, setQ] = useState('')
  const placed = zoneCards(view.state, p, loc)
  const title = `${t(`combos.pile.${loc}`)} · ${placed.length + pool.reduce((a, [, n]) => a + n, 0)}`
  const needle = q.trim().toLowerCase()
  const match = (code: number) => !needle || view.nameOf(code).toLowerCase().includes(needle)
  const tiles = useMemo(
    () => [
      ...placed.filter((uid) => match(view.registry[uid] ?? 0)).map((uid) => ({ key: uid, sel: { kind: 'uid', uid } as Sel, code: view.registry[uid] ?? 0, n: 1 })),
      ...pool.filter(([code]) => match(code)).map(([code, n]) => ({ key: `f${code}`, sel: { kind: 'fresh', p, loc: loc === 'extra' ? 'extra' : 'deck', code } as Sel, code, n })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed.join(','), pool, needle, view.registry],
  )
  const body = (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{picking ? t('combos.pileSheet.pickHint') : t('combos.pileSheet.hint')}</p>
      {placed.length + pool.length > 8 ? (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('combos.pileSheet.filter')} aria-label={t('combos.pileSheet.filter')} />
      ) : null}
      {tiles.length === 0 ? (
        <p className="py-6 text-center text-muted">{t('combos.pileSheet.empty')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-3" data-pile-list>
          {tiles.map((c) => (
            <li key={c.key} className="flex min-w-0 flex-col gap-1.5">
              <button
                type="button"
                data-pile-card={c.key}
                onClick={() => onSelect(c.sel)}
                className="relative block cursor-pointer rounded-[8px] outline-offset-2 hover:ring-2 hover:ring-accent-text"
                aria-label={view.nameOf(c.code)}
              >
                <CardFace code={c.code} name={view.nameOf(c.code)} />
                {c.n > 1 ? (
                  <span className="absolute right-1 top-1 rounded-full border border-line-strong bg-surface-1 px-1.5 text-xs font-semibold text-fg">×{c.n}</span>
                ) : null}
              </button>
              <span className="line-clamp-2 text-xs leading-tight text-muted">{view.nameOf(c.code)}</span>
              {!picking ? (
                <button
                  type="button"
                  onClick={() => onMove(c.sel)}
                  className="min-h-9 cursor-pointer rounded-sm border border-line bg-surface-2 px-2 text-sm text-fg hover:bg-surface-3"
                >
                  {t('combos.moveTo')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
  return wide ? (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} className="max-w-3xl">
      {body}
    </Dialog>
  ) : (
    <BottomSheet open onOpenChange={(o) => !o && onClose()} title={title}>
      {body}
    </BottomSheet>
  )
}
