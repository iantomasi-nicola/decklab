import type { DeckLists } from '../types'

/** Parse .ydk: sezioni #main, #extra, !side; ignora commenti, righe vuote, CRLF. */
export function parseYdk(text: string): DeckLists {
  const deck: DeckLists = { main: [], extra: [], side: [] }
  let section: keyof DeckLists = 'main'
  for (const raw of text.replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line) continue
    const lower = line.toLowerCase()
    if (lower === '#main') section = 'main'
    else if (lower === '#extra') section = 'extra'
    else if (lower === '!side') section = 'side'
    else if (/^\d+$/.test(line)) deck[section].push(Number(line))
  }
  return deck
}

export function serializeYdk(deck: DeckLists, createdBy = 'Combo Lab'): string {
  return [`#created by ${createdBy}`, '#main', ...deck.main, '#extra', ...deck.extra, '!side', ...deck.side, ''].join('\n')
}
