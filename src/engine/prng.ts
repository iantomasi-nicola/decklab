/** PRNG nostro (mulberry32) e mescolata del mazzo: il core NON mescola all'avvio (SPIKE-ENGINE.md), l'ordine è un dato di setup. */

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fisher-Yates con seed. Restituisce una NUOVA lista di indici 0..n-1 (indice 0 = cima del mazzo):
 * `order[i]` è la posizione, nell'elenco originale, della carta che sta all'i-esimo posto.
 * Lavora sugli indici (non sui codici) per distinguere le copie di una stessa carta.
 */
export function shuffleDeck(seed: number, n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  const rnd = mulberry32(seed)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Seed del core (4 interi a 64 bit) derivato da un seed numerico: mai [0,0,0,0]. */
export function coreSeedFrom(seed: number): [bigint, bigint, bigint, bigint] {
  const r = mulberry32(seed ^ 0x9e3779b9)
  const u64 = () => (BigInt(Math.floor(r() * 4294967296)) << 32n) | BigInt(Math.floor(r() * 4294967296))
  const s: [bigint, bigint, bigint, bigint] = [u64(), u64(), u64(), u64()]
  if (s.every((x) => x === 0n)) s[0] = 1n
  return s
}
