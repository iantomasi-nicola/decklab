/** Elenco di una pila (mano, Cimitero, Bandite, Extra) in modalità automatica: le carte con un'azione legale sono evidenziate. */
import type { GameState } from '@/domain/combo/state'
import type { Uid } from '@/domain/combo/types'
import type { CardRef } from '@/engine/requests'
import { useCards } from '@/features/combos/useCards'
import type { PileLoc } from '@/features/combos/zones'
import { Grid, type Tile } from './requests/choice'
import { Sheet, useNames } from './requests/parts'

export function PileView({ p, loc, state, registry, legalUids, onPick, onClose }: {
  p: 0 | 1
  loc: PileLoc
  state: GameState
  registry: Record<Uid, number>
  legalUids: ReadonlySet<Uid>
  onPick: (uid: Uid) => void
  onClose: () => void
}) {
  const { t } = useNames()
  const cards = useCards()
  const uids = Object.entries(state.places).filter(([, pl]) => pl.p === p && pl.loc === loc).sort((a, b) => (a[1].seq ?? 0) - (b[1].seq ?? 0)).map(([u]) => u)
  const ordered = loc === 'gy' || loc === 'banished' ? [...uids].reverse() : uids
  const tiles: Tile[] = ordered.map((u) => ({
    key: u,
    ref: { uid: u, code: registry[u] ?? 0, place: state.places[u]! } as CardRef,
    disabled: !legalUids.has(u),
    label: legalUids.has(u) ? t('act.menu') : '',
  }))
  const title = `${t(loc === 'gy' ? 'sel.inGy' : loc === 'banished' ? 'sel.inBanished' : loc === 'extra' ? 'sel.inExtra' : loc === 'deck' ? 'sel.inDeck' : 'sel.inHand')} · ${tiles.length}`
  return (
    <Sheet title={title} onCancel={onClose} wide testId="pile-view" footer={<button type="button" className="eng-btn" onClick={onClose}>{t('sel.cancel')}</button>}>
      <Grid tiles={tiles} onToggle={onPick} t={t} nameOf={cards.nameOf} />
    </Sheet>
  )
}
