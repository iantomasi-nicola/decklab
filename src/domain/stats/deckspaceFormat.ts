/**
 * Formato di export di Deckspace (`YGO_DECKSPACE` v1): parser e serializzatore.
 * Interpretazione dei campi in ARCHITECTURE.md §11.1. Il parser è tollerante (campi mancanti → default) ma rifiuta file di altro formato;
 * il serializzatore riproduce lo stesso schema, così `parse → serialize → parse` non perde nulla.
 */
import { DEFAULT_SETTINGS, type Label, type StatsSettings } from './types'
import { labelKey, parseLabelKey } from './hand'

export const DECKSPACE_FORMAT = 'YGO_DECKSPACE'
export const DECKSPACE_VERSION = 1

export interface DeckspaceCard {
  id: number
  name: string
  count: number
  sideCount: number
  order: number
  tags: string[]
  garnetLinks: number[]
  comboWith: number[]
  brickWith: number[]
  forbiddenWith: number[]
  drawWith: number[]
  imageUrl: string
  localImageUrl: string
}

export interface DeckspaceProject {
  name: string
  exportedAt: string
  settings: StatsSettings
  cards: DeckspaceCard[]
  /** Etichette appiattite (chiave = passcode ordinati). */
  labels: Record<string, Label>
  /** Gruppi di etichette come nel file (nome del gruppo → etichette). */
  labelSets: Record<string, Record<string, Label>>
}

export type ParseError = 'notJson' | 'notObject' | 'wrongFormat' | 'unsupportedVersion' | 'noDeck'
export type ParseResult = { ok: true; project: DeckspaceProject; warnings: string[] } | { ok: false; error: ParseError }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const flag = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : d)
const ids = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [])
const tags = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function parseDeckspace(input: unknown): ParseResult {
  let raw: unknown = input
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input.replace(/^﻿/, ''))
    } catch {
      return { ok: false, error: 'notJson' }
    }
  }
  if (!isObj(raw)) return { ok: false, error: 'notObject' }
  if (raw.format !== DECKSPACE_FORMAT) return { ok: false, error: 'wrongFormat' }
  const version = num(raw.format_version, 1)
  if (version > DECKSPACE_VERSION) return { ok: false, error: 'unsupportedVersion' }
  if (!Array.isArray(raw.deck)) return { ok: false, error: 'noDeck' }

  const warnings: string[] = []
  const ps = isObj(raw.project_settings) ? raw.project_settings : {}
  const settings: StatsSettings = {
    useAssumedDeckSize: flag(ps.use_assumed_deck_size, DEFAULT_SETTINGS.useAssumedDeckSize),
    assumedDeckSize: Math.max(1, Math.round(num(ps.assumed_deck_size, DEFAULT_SETTINGS.assumedDeckSize))),
    useSixCardHand: flag(ps.use_six_card_hand, DEFAULT_SETTINGS.useSixCardHand),
    tournamentRounds: Math.max(1, Math.round(num(ps.tournament_rounds, DEFAULT_SETTINGS.tournamentRounds))),
    tournamentMode: str(ps.tournament_mode, DEFAULT_SETTINGS.tournamentMode),
    drawPowerMode: str(ps.draw_power_mode, DEFAULT_SETTINGS.drawPowerMode),
  }

  const cards: DeckspaceCard[] = []
  raw.deck.forEach((c, i) => {
    if (!isObj(c) || typeof c.id !== 'number') {
      warnings.push(`deck[${i}]`)
      return
    }
    cards.push({
      id: c.id,
      name: str(c.name),
      count: Math.max(0, Math.round(num(c.count, 0))),
      sideCount: Math.max(0, Math.round(num(c.side_count, 0))),
      order: num(c.order, i + 1),
      tags: tags(c.tags),
      garnetLinks: ids(c.garnet_links),
      comboWith: ids(c.combo_strings),
      brickWith: ids(c.brick_strings),
      forbiddenWith: ids(c.forbidden_strings),
      drawWith: ids(c.draw_strings),
      imageUrl: str(c.image_url),
      localImageUrl: str(c.local_image_url),
    })
  })

  const labelSets: Record<string, Record<string, Label>> = {}
  const labels: Record<string, Label> = {}
  if (isObj(raw.combo_labels)) {
    for (const [setName, set] of Object.entries(raw.combo_labels)) {
      if (!isObj(set)) continue
      const out: Record<string, Label> = {}
      for (const [key, v] of Object.entries(set)) {
        const parts = parseLabelKey(key)
        if (!parts.length || (v !== 'PLAYABLE' && v !== 'BRICK')) {
          warnings.push(`${setName}:${key}`)
          continue
        }
        const k = labelKey(parts)
        out[k] = v
        labels[k] = v
      }
      labelSets[setName] = out
    }
  }

  return {
    ok: true,
    warnings,
    project: { name: str(raw.project_name, 'Deckspace Project'), exportedAt: str(raw.exported_at), settings, cards, labels, labelSets },
  }
}

/** Gruppo di etichette per dimensione dell'insieme, usato quando il progetto non ha gruppi propri. */
const defaultSetName = (size: number) => (size === 2 ? 'C2PAIR_NE_FILL' : size === 3 ? 'C2_BRICKPAIR_PLUS_C3_NE_FILL' : size === 1 ? 'SINGLE' : `SET_${size}`)

export function serializeDeckspace(p: DeckspaceProject, exportedAt = new Date().toISOString()): string {
  // i gruppi del progetto che coprono ancora l'etichetta si mantengono; le etichette nuove finiscono nel gruppo per dimensione
  const sets: Record<string, Record<string, Label>> = {}
  const placed = new Set<string>()
  for (const [name, set] of Object.entries(p.labelSets)) {
    const out: Record<string, Label> = {}
    for (const key of Object.keys(set)) {
      const v = p.labels[key]
      if (v) {
        out[key] = v
        placed.add(key)
      }
    }
    sets[name] = out
  }
  for (const [key, v] of Object.entries(p.labels)) {
    if (placed.has(key)) continue
    const name = defaultSetName(parseLabelKey(key).length)
    ;(sets[name] ??= {})[key] = v
  }
  const s = p.settings
  return JSON.stringify(
    {
      format: DECKSPACE_FORMAT,
      format_version: DECKSPACE_VERSION,
      exported_at: exportedAt,
      project_name: p.name,
      project_settings: {
        use_assumed_deck_size: s.useAssumedDeckSize ? 1 : 0,
        assumed_deck_size: s.assumedDeckSize,
        use_six_card_hand: s.useSixCardHand ? 1 : 0,
        tournament_rounds: s.tournamentRounds,
        tournament_mode: s.tournamentMode,
        draw_power_mode: s.drawPowerMode,
      },
      deck: p.cards.map((c) => ({
        id: c.id,
        name: c.name,
        image_url: c.imageUrl,
        local_image_url: c.localImageUrl,
        count: c.count,
        side_count: c.sideCount,
        order: c.order,
        tags: c.tags,
        garnet_links: c.garnetLinks,
        combo_strings: c.comboWith,
        brick_strings: c.brickWith,
        forbidden_strings: c.forbiddenWith,
        draw_strings: c.drawWith,
      })),
      combo_labels: sets,
    },
    null,
    2,
  )
}
