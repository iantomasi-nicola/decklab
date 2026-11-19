/** Somma di livelli (SELECT_SUM): ogni carta può valere due numeri (basso 16 bit / alto 16 bit, es. Livello o Rango). Pura. */

export const valuesOf = (amount: number): number[] => {
  const lo = amount & 0xffff
  const hi = (amount >>> 16) & 0xffff
  return hi && hi !== lo ? [lo, hi] : [lo]
}

/** Tutti i totali raggiungibili scegliendo un valore per carta. */
export function reachableTotals(amounts: readonly number[]): Set<number> {
  let acc = new Set<number>([0])
  for (const a of amounts) {
    const next = new Set<number>()
    const vs = valuesOf(a)
    for (const t of acc) for (const v of vs) next.add(t + v)
    acc = next
  }
  return acc
}

export interface SumStatus {
  /** totale da mostrare: il raggiungibile più vicino al bersaglio (sotto o uguale se c'è, altrimenti il minore sopra) */
  shown: number
  /** il bersaglio è raggiunto (uguale se `exact`, almeno altrimenti) */
  ok: boolean
  /** anche il valore più basso possibile supera il bersaglio (con `exact`): non si arriverà mai al totale */
  over: boolean
}

export function sumStatus(amount: number, exact: boolean, amounts: readonly number[]): SumStatus {
  const totals = [...reachableTotals(amounts)].sort((a, b) => a - b)
  const min = totals[0] ?? 0
  const hit = exact ? totals.includes(amount) : totals.some((t) => t >= amount)
  const below = totals.filter((t) => t <= amount)
  const shown = hit ? (exact ? amount : (totals.find((t) => t >= amount) ?? min)) : (below[below.length - 1] ?? min)
  return { shown, ok: hit, over: exact ? min > amount : false }
}
