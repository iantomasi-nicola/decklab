/**
 * Parser puro per i file `*.lflist.conf` di EDOPro/ProjectIgnis (LFLists).
 *
 * Formato:
 *   #commento
 *   !2026.10 OCG            <- testata: `!<id> <nome>`; inizia una nuova lista
 *   $whitelist              <- (opzionale) direttive, ignorate
 *   21044178 0 --Abyss Dweller   <- `<passcode> <0|1|2|3> --commento`
 *
 * 0 = Proibita, 1 = Limitata, 2 = Semi-Limitata, 3 = Illimitata (esplicita).
 * Nessuna dipendenza da DOM/Node: usabile sia dallo script di build sia dal client.
 */
import type { Banlist } from '../types'

export type LflistLimit = 0 | 1 | 2 | 3

export interface ParsedLflist {
  /** es. "2026.10" */
  id: string
  /** nome dopo l'id nella testata, es. "OCG", "TCG" */
  name: string
  /** passcode (come scritto nel file, può essere un alias) → limite */
  entries: Record<number, LflistLimit>
  /** direttive `$...` incontrate (es. `$whitelist`) */
  directives: string[]
}

const HEADER_RE = /^!\s*(\S+)\s*(.*)$/
const ENTRY_RE = /^(\d+)\s+([0-3])\b/

export function parseLflist(text: string): ParsedLflist[] {
  const lists: ParsedLflist[] = []
  let cur: ParsedLflist | null = null
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    if (line.startsWith('!')) {
      const m = HEADER_RE.exec(line)
      if (!m) continue
      cur = { id: m[1]!, name: (m[2] ?? '').trim(), entries: {}, directives: [] }
      lists.push(cur)
      continue
    }
    if (!cur) continue // righe prima della prima testata: ignorate
    if (line.startsWith('$')) {
      cur.directives.push(line)
      continue
    }
    const e = ENTRY_RE.exec(line)
    if (!e) continue
    cur.entries[Number(e[1])] = Number(e[2]) as LflistLimit
  }
  return lists
}

/**
 * Converte una lista parsata in `Banlist`, indicizzando per passcode della carta BASE.
 * `canonical` mappa un passcode (anche alias/artwork) alla carta base (default: identità).
 * Se più passcode della stessa carta base hanno limiti diversi vince il più restrittivo.
 * Le voci "3" (illimitata) non finiscono in `limits` (assente = 3 copie).
 */
export function lflistToBanlist(
  list: Pick<ParsedLflist, 'id' | 'entries'>,
  format: Banlist['format'],
  canonical: (passcode: number) => number = (n) => n,
): Banlist {
  const limits: Record<number, 0 | 1 | 2> = {}
  for (const [k, v] of Object.entries(list.entries)) {
    if (v === 3) continue
    const base = canonical(Number(k))
    const prev = limits[base]
    limits[base] = prev === undefined ? v : (Math.min(prev, v) as 0 | 1 | 2)
  }
  return { format, id: list.id, limits }
}
