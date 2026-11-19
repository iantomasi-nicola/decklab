import type { CardIndex } from '@/domain/deck/cardIndex'
import { detectAndParse, type ImportFormat } from '@/domain/deck/importDetect'
import { resolveReview } from '@/features/decks/importHelpers'
import { decodeLink } from '@/domain/share/link'
import { readCombo, type ReadResult } from '@/domain/combo/migrate'
import type { Issue } from '@/domain/combo/validate'
import type { ComboDoc } from '@/domain/combo/types'
import type { DeckLists, Localized, Rules, Variant } from '@/domain/types'
import type { Repos } from '@/data/repo'
import { BACKUP_APP } from '@/data/backup'

export type DetectedSource = 'link' | 'json' | 'text'
export type ImportErrorCode = 'empty' | 'unknown' | 'invalidJson' | 'needsIndex' | 'noCards' | 'invalidDeck'

export type Detected =
  | { kind: 'combo'; source: DetectedSource; result: ReadResult }
  | { kind: 'deck'; format: ImportFormat; deck: DeckLists; unmatched: string[]; skippedAmbiguous: number; fuzzy: number }
  | { kind: 'backup' }
  | { kind: 'error'; code: ImportErrorCode }

/** Un link `1.xxxx` (anche dentro un URL con `#`). */
export function extractLink(input: string): string | null {
  const s = input.trim()
  const hash = s.lastIndexOf('#')
  const cand = (hash >= 0 ? s.slice(hash + 1) : s).trim()
  return /^\d+\.[A-Za-z0-9_-]{8,}$/.test(cand) ? cand : null
}

const countCards = (d: DeckLists) => d.main.length + d.extra.length + d.side.length

/** Riconosce combo (link o JSON), backup e mazzi (ydk/ydke/testo/JSON mazzo). Puro: l'indice carte serve solo alle liste testuali. */
export function detectImport(input: string, index?: CardIndex): Detected {
  const text = input.replace(/^﻿/, '').trim()
  if (!text) return { kind: 'error', code: 'empty' }

  const link = extractLink(text)
  if (link) return { kind: 'combo', source: 'link', result: decodeLink(link) }

  if (text.startsWith('{')) {
    let obj: unknown
    try {
      obj = JSON.parse(text)
    } catch {
      return { kind: 'error', code: 'invalidJson' }
    }
    const o = obj as Record<string, unknown>
    if (o.format === 'combolab.combo') return { kind: 'combo', source: 'json', result: readCombo(obj) }
    if (o.app === BACKUP_APP && o.tables) return { kind: 'backup' }
  }

  const r = detectAndParse(text, index)
  if (r.format === 'unknown') return { kind: 'error', code: 'unknown' }
  if (r.format === 'text' && !r.text) return { kind: 'error', code: index ? 'invalidDeck' : 'needsIndex' }
  if (r.error || !r.deck) return { kind: 'error', code: r.format === 'text' ? 'noCards' : 'invalidDeck' }
  const t = r.text
  const deck = t ? resolveReview(t, {}) : r.deck
  if (countCards(deck) === 0) return { kind: 'error', code: 'noCards' }
  return {
    kind: 'deck',
    format: r.format,
    deck,
    unmatched: t ? t.unmatched.map((u) => u.line) : [],
    skippedAmbiguous: t ? t.ambiguous.length : 0,
    fuzzy: t ? t.matched.filter((m) => m.fuzzy).length : 0,
  }
}

/** Chiave i18n e parametri di un avviso/errore di validazione (le chiavi `combo.*` del dominio). */
export function issueKey(issue: Issue): { key: string; params: Record<string, string | number> } {
  const last = issue.code.split('.').pop() ?? issue.code
  const ns = issue.code.startsWith('combo.link.') ? 'link' : 'issue'
  return { key: `importPage.${ns}.${last}`, params: { ...(issue.params ?? {}), path: issue.path.join('.') } }
}

export interface ComboTarget {
  /** archetipo esistente, oppure null per crearne uno nuovo con `newArchetypeName` */
  archetypeId: string | null
  newArchetypeName?: Localized
  variantId: string | null
  variantName?: Localized
}

/** Salva una combo importata. Se esiste gia' una combo con lo stesso id ne crea una nuova (mai sovrascrive). */
export async function saveImportedCombo(
  r: Repos,
  doc: ComboDoc,
  target: ComboTarget,
  now = new Date(),
): Promise<{ id: string; copied: boolean }> {
  let archetypeId = target.archetypeId
  let archetypeName = doc.meta.archetype.name
  if (!archetypeId) {
    const a = await r.archetypes.create({
      name: target.newArchetypeName ?? doc.meta.archetype.name,
      keyCards: [],
      starters: [],
      extenders: [],
    })
    archetypeId = a.id
    archetypeName = a.name
  } else {
    const a = await r.archetypes.get(archetypeId)
    if (a) archetypeName = a.name
  }
  const copied = Boolean(await r.combos.get(doc.meta.id))
  const id = copied ? crypto.randomUUID() : doc.meta.id
  const variant = target.variantId ? { id: target.variantId, name: target.variantName ?? doc.meta.variant?.name ?? {} } : null
  const next: ComboDoc = {
    ...doc,
    meta: {
      ...doc.meta,
      id,
      source: 'import',
      scope: variant ? 'variant' : 'archetype',
      archetype: { id: archetypeId, name: archetypeName },
      variant,
      updatedAt: now.toISOString(),
    },
  }
  await r.combos.create({ id, archetypeId, variantId: target.variantId, name: next.meta.title, tagIds: [], payload: next })
  return { id, copied }
}

export interface DeckTarget {
  archetypeId: string | null
  newArchetypeName?: Localized
  name: Localized
  rules: Rules
  banlist: Variant['banlist']
}

/** Salva un mazzo importato come nuova variante. */
export async function saveImportedDeck(r: Repos, deck: DeckLists, target: DeckTarget): Promise<{ variantId: string; archetypeId: string }> {
  let archetypeId = target.archetypeId
  if (!archetypeId) {
    const a = await r.archetypes.create({ name: target.newArchetypeName ?? target.name, keyCards: [], starters: [], extenders: [] })
    archetypeId = a.id
  }
  const v = await r.variants.create({
    archetypeId,
    name: target.name,
    deck,
    rules: target.rules,
    banlist: target.banlist,
  })
  return { variantId: v.id, archetypeId }
}
