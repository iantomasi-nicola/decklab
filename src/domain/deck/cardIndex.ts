import type { Card, Lang } from '../types'

/** Normalizza un nome carta per il confronto: minuscole, senza accenti/apostrofi, "&" → "and", punteggiatura → spazio. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export interface NameEntry {
  normalized: string
  lang: Lang
  card: Card
}

/** Accesso ai dati carte richiesto dalla logica pura (legalità/import/export). */
export interface CardIndex {
  byId(id: number): Card | undefined
  /** alias || id (se la carta è sconosciuta restituisce id). */
  canonicalId(id: number): number
  /** Match esatto sul nome già normalizzato (EN e IT); restituisce le carte canoniche, senza duplicati. */
  findByName(normalized: string): Card[]
  /** Tutti i nomi normalizzati (per la ricerca tollerante). */
  names(): readonly NameEntry[]
}

/** Implementazione in memoria di CardIndex a partire da un elenco di carte. */
export function createCardIndex(cards: readonly Card[]): CardIndex {
  const ids = new Map<number, Card>()
  for (const c of cards) ids.set(c.id, c)
  const canonical = (c: Card): Card => (c.alias ? (ids.get(c.alias) ?? c) : c)
  const entries: NameEntry[] = []
  const byName = new Map<string, Map<number, Card>>()
  for (const c of cards) {
    const base = canonical(c)
    const langs: [Lang, string | undefined][] = [['en', c.name.en], ['it', c.name.it]]
    for (const [lang, name] of langs) {
      if (!name) continue
      const normalized = normalizeName(name)
      if (!normalized) continue
      entries.push({ normalized, lang, card: base })
      let m = byName.get(normalized)
      if (!m) byName.set(normalized, (m = new Map()))
      m.set(base.id, base)
    }
  }
  return {
    byId: (id) => ids.get(id),
    canonicalId: (id) => {
      const c = ids.get(id)
      return c && c.alias ? c.alias : id
    },
    findByName: (n) => [...(byName.get(n)?.values() ?? [])],
    names: () => entries,
  }
}
