import type { DeckLists } from '../types'

const PREFIX = 'ydke://'

function encodeSection(ids: number[]): string {
  const bytes = new Uint8Array(ids.length * 4)
  const view = new DataView(bytes.buffer)
  ids.forEach((id, i) => view.setUint32(i * 4, id >>> 0, true))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function decodeSection(b64: string): number[] {
  if (!b64) return []
  let bin: string
  try {
    bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  } catch {
    throw new Error('ydke: base64 non valido')
  }
  if (bin.length % 4 !== 0) throw new Error('ydke: lunghezza sezione non multipla di 4 byte')
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  const out: number[] = []
  for (let i = 0; i < bytes.length; i += 4) out.push(view.getUint32(i, true))
  return out
}

export function isYdke(text: string): boolean {
  return text.trim().toLowerCase().startsWith(PREFIX)
}

/** Parse `ydke://main!extra!side!`. Lancia Error se il formato non è valido. */
export function parseYdke(text: string): DeckLists {
  const t = text.trim()
  if (!isYdke(t)) throw new Error('ydke: prefisso mancante')
  const parts = t.slice(PREFIX.length).split('!')
  if (parts.length < 3) throw new Error('ydke: servono tre sezioni separate da "!"')
  return { main: decodeSection(parts[0]!), extra: decodeSection(parts[1]!), side: decodeSection(parts[2]!) }
}

export function serializeYdke(deck: DeckLists): string {
  return `${PREFIX}${encodeSection(deck.main)}!${encodeSection(deck.extra)}!${encodeSection(deck.side)}!`
}
