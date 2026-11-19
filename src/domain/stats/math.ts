/** Aritmetica esatta/stabile per le probabilità. Gli interi restano esatti in double fino a 2^53 (C(60,6) ≈ 5·10^7). */

/** Coefficiente binomiale C(n, k); 0 fuori dall'intervallo. */
export function comb(n: number, k: number): number {
  if (k < 0 || n < 0 || k > n) return 0
  const m = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= m; i++) r = (r * (n - m + i)) / i
  return Math.round(r)
}

/** P(X = k) ipergeometrica: k successi in `h` estrazioni da `n` carte di cui `s` successi. */
export function hypergeom(n: number, s: number, h: number, k: number): number {
  return (comb(s, k) * comb(n - s, h - k)) / comb(n, h)
}

/** P(almeno una carta tra `s` su `n`, pescandone `h`) = 1 − C(n−s, h)/C(n, h). */
export function atLeastOne(n: number, s: number, h: number): number {
  if (s <= 0 || h <= 0) return 0
  return 1 - comb(n - s, h) / comb(n, h)
}

/** Distribuzione del numero di successi in n prove indipendenti con probabilità p[i] (Poisson-binomiale), O(n²). */
export function poissonBinomial(ps: readonly number[]): number[] {
  let pmf = [1]
  for (const p of ps) {
    const next = new Array<number>(pmf.length + 1).fill(0)
    for (let j = 0; j < pmf.length; j++) {
      next[j]! += pmf[j]! * (1 - p)
      next[j + 1]! += pmf[j]! * p
    }
    pmf = next
  }
  return pmf
}

export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
