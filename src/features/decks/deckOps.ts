import type { Card, DeckLists } from '@/domain/types'

export type Section = 'main' | 'extra' | 'side'
export const SECTIONS: readonly Section[] = ['main', 'extra', 'side']

/** Limiti di dimensione (gli stessi di domain/legality, ripetuti per la UI dei contatori). */
export const SECTION_LIMITS: Record<Section, { min: number; max: number }> = {
  main: { min: 40, max: 60 },
  extra: { min: 0, max: 15 },
  side: { min: 0, max: 15 },
}

export const emptyDeck = (): DeckLists => ({ main: [], extra: [], side: [] })

/** Sezione di destinazione predefinita di una carta. */
export const defaultSection = (card: Pick<Card, 'isExtra'>): 'main' | 'extra' => (card.isExtra ? 'extra' : 'main')

export const countIn = (list: readonly number[], id: number): number => list.reduce((n, x) => (x === id ? n + 1 : n), 0)

/** Aggiunge una copia, accanto alle copie già presenti (la lista resta raggruppata). */
export function addCard(deck: DeckLists, section: Section, id: number): DeckLists {
  const list = deck[section]
  const last = list.lastIndexOf(id)
  const next = last < 0 ? [...list, id] : [...list.slice(0, last + 1), id, ...list.slice(last + 1)]
  return { ...deck, [section]: next }
}

/** Toglie una copia (l'ultima). Senza copie restituisce lo stesso oggetto. */
export function removeCard(deck: DeckLists, section: Section, id: number): DeckLists {
  const i = deck[section].lastIndexOf(id)
  if (i < 0) return deck
  return { ...deck, [section]: [...deck[section].slice(0, i), ...deck[section].slice(i + 1)] }
}

export function removeAll(deck: DeckLists, section: Section, id: number): DeckLists {
  if (!deck[section].includes(id)) return deck
  return { ...deck, [section]: deck[section].filter((x) => x !== id) }
}

/** Sposta una copia da una sezione a un'altra. */
export function moveCard(deck: DeckLists, from: Section, to: Section, id: number): DeckLists {
  if (from === to || !deck[from].includes(id)) return deck
  return addCard(removeCard(deck, from, id), to, id)
}

export interface Stack {
  id: number
  count: number
}

/** Raggruppa per passcode mantenendo l'ordine di prima apparizione. */
export function toStacks(list: readonly number[]): Stack[] {
  const m = new Map<number, number>()
  for (const id of list) m.set(id, (m.get(id) ?? 0) + 1)
  return [...m].map(([id, count]) => ({ id, count }))
}

export const deckSize = (deck: DeckLists): number => deck.main.length + deck.extra.length + deck.side.length

export const sameDeck = (a: DeckLists, b: DeckLists): boolean =>
  SECTIONS.every((s) => a[s].length === b[s].length && a[s].every((x, i) => x === b[s][i]))

/* ---------------- Annulla / ripeti ---------------- */

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

export const HISTORY_LIMIT = 200

export const newHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] })

export function pushState<T>(h: History<T>, next: T): History<T> {
  if (next === h.present) return h
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] }
}

/** Sostituisce lo stato corrente mantenendo la cronologia (per unire due gesti in un solo passo). */
export function replacePresent<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next, future: [] }
}

export function undoState<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  if (prev === undefined) return h
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redoState<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future: rest }
}
