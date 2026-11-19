import { poissonBinomial, sum } from './math'
import type { TournamentPlan, TournamentResult } from './types'

/**
 * Torneo di N round indipendenti, ciascuno con probabilità di brick propria (mano da 5 se si gioca per primi, da 6 per secondi).
 * Restituisce media, P(0), P(≥1), P(≥k) e la distribuzione completa del numero di brick.
 */
export function tournament(roundBrick: readonly number[], k: number): TournamentResult {
  const rounds = roundBrick.length
  const pmf = poissonBinomial(roundBrick)
  const kk = Math.max(0, Math.min(Math.floor(k), rounds + 1))
  const expectedBricks = sum(roundBrick)
  return {
    rounds,
    roundBrick: [...roundBrick],
    expectedBricks,
    expectedPlayable: rounds - expectedBricks,
    pNone: pmf[0] ?? 1,
    pAtLeast1: rounds === 0 ? 0 : 1 - (pmf[0] ?? 1),
    k: kk,
    pAtLeastK: sum(pmf.slice(kk)),
    pmf,
  }
}

/** Probabilità di brick per round secondo il piano: tutti per primi (5 carte), tutti per secondi (6), o metà e metà. */
export function roundPlan(plan: TournamentPlan, rounds: number, brickFirst: number, brickSecond: number): number[] {
  const n = Math.max(0, Math.floor(rounds))
  if (plan === 'first') return new Array<number>(n).fill(brickFirst)
  if (plan === 'second') return new Array<number>(n).fill(brickSecond)
  const first = Math.ceil(n / 2)
  return [...new Array<number>(first).fill(brickFirst), ...new Array<number>(n - first).fill(brickSecond)]
}
