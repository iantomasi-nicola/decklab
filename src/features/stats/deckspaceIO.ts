import { parseLabelKey, labelKey, serializeDeckspace, type DeckspaceCard, type DeckspaceProject, type Label } from '@/domain/stats'
import type { Variant } from '@/domain/types'
import type { DeckRow } from './useStatsModel'
import { emptySaved, type Partners, type SavedStats } from './statsStore'

const IMG = (id: number) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`

/** Progetto Deckspace dal Main della variante + ruoli/etichette salvati. */
export function buildProject(variant: Variant, rows: DeckRow[], saved: SavedStats, nameEn: (id: number) => string, canonical: (id: number) => number): DeckspaceProject {
  const side = new Map<number, number>()
  for (const raw of variant.deck.side) side.set(canonical(raw), (side.get(canonical(raw)) ?? 0) + 1)
  const cards: DeckspaceCard[] = rows.map((r, i) => {
    const p = saved.partners[String(r.id)]
    return {
      id: r.id,
      name: nameEn(r.id),
      count: r.count,
      sideCount: side.get(r.id) ?? 0,
      order: i + 1,
      tags: saved.tags[String(r.id)] ?? [],
      garnetLinks: p?.garnet ?? [],
      comboWith: p?.combo ?? [],
      brickWith: p?.brick ?? [],
      forbiddenWith: p?.forbidden ?? [],
      drawWith: p?.draw ?? [],
      imageUrl: IMG(r.id),
      localImageUrl: '',
    }
  })
  return {
    name: variant.name.en ?? variant.name.it ?? 'Combo Lab',
    exportedAt: '',
    settings: saved.settings,
    cards,
    labels: saved.labels,
    labelSets: {},
  }
}

export const exportText = (p: DeckspaceProject): string => serializeDeckspace(p)

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export interface ImportReport {
  /** Carte del file presenti nel Main della variante. */
  matched: number
  missing: { id: number; name: string; count: number }[]
  countDiffs: { id: number; name: string; file: number; deck: number }[]
  labels: number
  copies: number
}

export function planImport(project: DeckspaceProject, rows: DeckRow[], canonical: (id: number) => number): ImportReport {
  const deck = new Map(rows.map((r) => [r.id, r.count]))
  const report: ImportReport = { matched: 0, missing: [], countDiffs: [], labels: Object.keys(project.labels).length, copies: 0 }
  for (const c of project.cards) {
    report.copies += c.count
    const id = canonical(c.id)
    const have = deck.get(id)
    if (have === undefined) report.missing.push({ id, name: c.name, count: c.count })
    else {
      report.matched++
      if (have !== c.count) report.countDiffs.push({ id, name: c.name, file: c.count, deck: have })
    }
  }
  return report
}

/** Applica ruoli, partner, etichette e impostazioni del file (le carte fuori dal Main si ignorano). */
export function applyImport(project: DeckspaceProject, rows: DeckRow[], canonical: (id: number) => number, base: SavedStats = emptySaved()): SavedStats {
  const inDeck = new Set(rows.map((r) => r.id))
  const tags: Record<string, string[]> = {}
  const partners: Record<string, Partners> = {}
  const map = (ids: number[]) => ids.map(canonical)
  for (const c of project.cards) {
    const id = canonical(c.id)
    if (!inDeck.has(id)) continue
    if (c.tags.length) tags[String(id)] = [...new Set([...(tags[String(id)] ?? []), ...c.tags])]
    partners[String(id)] = { combo: map(c.comboWith), brick: map(c.brickWith), forbidden: map(c.forbiddenWith), draw: map(c.drawWith), garnet: map(c.garnetLinks) }
  }
  const labels: Record<string, Label> = {}
  for (const [k, v] of Object.entries(project.labels)) labels[labelKey(parseLabelKey(k).map(canonical))] = v
  return { ...base, tags, partners, labels, settings: { ...project.settings } }
}
