/**
 * Accesso ai piani di side per gli altri moduli (Stats Lab: probabilità post-side).
 *
 *   const plans = await listSidePlans(variantId)             // piani vivi della variante
 *   const deckAfter = applySidePlan(variant.deck, plan, (id) => index.canonicalId(id))   // da '@/domain/side'
 */
import { repos, type Repos } from './repo'
import type { SidePlan } from '@/domain/side/types'

export type { SidePlan }

/** Piani di side (non cancellati) di una variante, ordinati per nome e poi per turno (primo prima di secondo). */
export async function listSidePlans(variantId: string, r: Pick<Repos, 'sidePlans'> = repos): Promise<SidePlan[]> {
  const rows = await r.sidePlans.listByVariant(variantId)
  return rows.sort((a, b) => a.matchup.name.localeCompare(b.matchup.name) || a.matchup.turn.localeCompare(b.matchup.turn))
}

export { applySidePlan } from '@/domain/side/apply'
