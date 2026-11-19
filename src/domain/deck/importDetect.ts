import type { DeckLists } from '../types'
import type { CardIndex } from './cardIndex'
import { parseYdk } from './ydk'
import { isYdke, parseYdke } from './ydke'
import { parseTextList, textResultToDeck, type TextListResult } from './textList'

export type ImportFormat = 'ydk' | 'ydke' | 'text' | 'json' | 'unknown'

export interface ImportResult {
  format: ImportFormat
  deck?: DeckLists
  /** solo per format 'text': dettaglio di match/ambigui/non trovati */
  text?: TextListResult
  error?: string
}

export interface DeckJson extends DeckLists {
  format: 'combolab.deck'
  v: 1
}

export function serializeDeckJson(deck: DeckLists): string {
  const o: DeckJson = { format: 'combolab.deck', v: 1, main: deck.main, extra: deck.extra, side: deck.side }
  return JSON.stringify(o)
}

const isIdList = (x: unknown): x is number[] => Array.isArray(x) && x.every((n) => Number.isInteger(n) && n >= 0)

export function parseDeckJson(text: string): DeckLists {
  const o: unknown = JSON.parse(text)
  if (!o || typeof o !== 'object') throw new Error('JSON non valido')
  const r = o as Record<string, unknown>
  if (r.format !== 'combolab.deck' || r.v !== 1) throw new Error('formato JSON non riconosciuto')
  if (!isIdList(r.main) || !isIdList(r.extra) || !isIdList(r.side)) throw new Error('liste carte non valide')
  return { main: r.main, extra: r.extra, side: r.side }
}

/** Riconosce ydk / ydke / JSON dell'app / testo e li converte. Il testo richiede `index`. */
export function detectAndParse(input: string, index?: CardIndex): ImportResult {
  const text = input.replace(/^﻿/, '').trim()
  if (!text) return { format: 'unknown', error: 'vuoto' }
  try {
    if (isYdke(text)) return { format: 'ydke', deck: parseYdke(text) }
    if (text.startsWith('{')) return { format: 'json', deck: parseDeckJson(text) }
  } catch (e) {
    return { format: isYdke(text) ? 'ydke' : 'json', error: (e as Error).message }
  }
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean)
  const looksYdk =
    lines.some((l) => /^(#main|#extra|!side)$/i.test(l)) ||
    (lines.every((l) => /^\d+$/.test(l) || l.startsWith('#')) && lines.some((l) => /^\d+$/.test(l)))
  if (looksYdk) return { format: 'ydk', deck: parseYdk(text) }
  if (!index) return { format: 'text', error: 'serve un CardIndex per importare liste testuali' }
  const r = parseTextList(text, index)
  return { format: 'text', text: r, deck: textResultToDeck(r) }
}
