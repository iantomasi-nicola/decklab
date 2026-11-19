import type { DeckLists } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { detectAndParse, type ImportFormat } from '@/domain/deck/importDetect'
import { textResultToDeck, type MatchedLine, type TextListResult } from '@/domain/deck/textList'

export type ImportErrorCode = 'empty' | 'invalid' | 'needsIndex' | 'noCards'

export type ImportOutcome =
  | { kind: 'deck'; deck: DeckLists; format: ImportFormat; fuzzy: number }
  | { kind: 'review'; result: TextListResult }
  | { kind: 'error'; code: ImportErrorCode; format: ImportFormat }

const countCards = (d: DeckLists) => d.main.length + d.extra.length + d.side.length
export { countCards }

/** Riconosce il contenuto incollato/trascinato e decide se serve la revisione (ambigui / non trovati). */
export function interpretImport(input: string, index?: CardIndex): ImportOutcome {
  const r = detectAndParse(input, index)
  if (r.format === 'unknown') return { kind: 'error', code: 'empty', format: r.format }
  if (r.format === 'text') {
    if (!r.text) return { kind: 'error', code: index ? 'invalid' : 'needsIndex', format: 'text' }
    const t = r.text
    if (!t.matched.length && !t.ambiguous.length) return { kind: 'error', code: 'noCards', format: 'text' }
    if (t.ambiguous.length || t.unmatched.length) return { kind: 'review', result: t }
    return { kind: 'deck', deck: textResultToDeck(t), format: 'text', fuzzy: t.matched.filter((m) => m.fuzzy).length }
  }
  if (r.error || !r.deck) return { kind: 'error', code: 'invalid', format: r.format }
  if (countCards(r.deck) === 0) return { kind: 'error', code: 'noCards', format: r.format }
  return { kind: 'deck', deck: r.deck, format: r.format, fuzzy: 0 }
}

/** Applica le scelte dell'utente alle righe ambigue (indice riga → passcode scelto; assente = salta). */
export function resolveReview(result: TextListResult, choices: Readonly<Record<number, number | undefined>>): DeckLists {
  const extra: MatchedLine[] = []
  result.ambiguous.forEach((a, i) => {
    const id = choices[i]
    const card = a.candidates.find((c) => c.id === id)
    if (card) extra.push({ line: a.line, card, count: a.count, section: a.section, fuzzy: false })
  })
  return textResultToDeck({ matched: [...result.matched, ...extra], ambiguous: [], unmatched: [] })
}

/* ---------------- condivisione (Web Share Target) ---------------- */

export const SHARE_CACHE = 'combolab-share'
export interface SharedImport {
  text: string
  name?: string
}

/** Legge il contenuto messo in cache dal service worker (vedi src/sw.ts). */
export async function readSharedImport(): Promise<SharedImport | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(SHARE_CACHE)
    const metaRes = await cache.match('/__share/meta')
    if (!metaRes) return null
    const meta = (await metaRes.json()) as { title?: string; text?: string; url?: string; files?: string[] }
    for (let i = 0; i < (meta.files?.length ?? 0); i++) {
      const res = await cache.match(`/__share/file/${i}`)
      const text = res ? await res.text() : ''
      if (text.trim()) return { text, name: meta.files?.[i] }
    }
    const blob = `${meta.text ?? ''}\n${meta.url ?? ''}`
    const ydke = /ydke:\/\/\S+/i.exec(blob)
    if (ydke) return { text: ydke[0], name: meta.title || undefined }
    const text = (meta.text ?? '').trim()
    return text ? { text, name: meta.title || undefined } : null
  } catch {
    return null
  }
}

export async function clearSharedImport(): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await caches.delete(SHARE_CACHE)
  } catch {
    /* ignora */
  }
}

/** "My Deck.ydk" → "My Deck". */
export const baseName = (file?: string): string | undefined => file?.replace(/\.[a-z0-9]{1,5}$/i, '').trim() || undefined

export const slug = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck'

/** Copia negli appunti (con ripiego per contesti senza Clipboard API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
