/** Loader client dei dati generati da `npm run data:build` (public/data/). Il formato è in cardsFormat.ts. */
import type { Banlist, Card, Lang } from '../types'
import { decodeCards, type CardsFile } from './cardsFormat'

export { decodeCards, encodeCards, type CardsFile } from './cardsFormat'

/** public/data/manifest.json */
export interface DataManifest {
  schema: 1
  /** versione del dataset, usata nei nomi dei file (es. "147.89-3fa9c1d2") */
  version: string
  builtAt: string
  files: {
    cards: string
    banlists: string
    archetypes: string
    texts: Partial<Record<Lang, string>>
  }
  [extra: string]: unknown
}

/** public/data/texts.<lang>.<ver>.json: testo effetto per passcode della carta BASE. */
export interface TextsFile {
  format: 'combo-lab/texts'
  v: 1
  lang: Lang
  texts: Record<string, string>
}

export interface ArchetypeEntry {
  setcode: number
  name: { en: string; it?: string }
}

export interface ArchetypesFile {
  format: 'combo-lab/archetypes'
  v: 1
  archetypes: ArchetypeEntry[]
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

async function getJson<T>(url: string, f: FetchLike): Promise<T> {
  const res = await f(url)
  if (!res.ok) throw new Error(`Download fallito (${res.status}): ${url}`)
  return (await res.json()) as T
}

const join = (base: string, file: string) => (base.endsWith('/') ? base : base + '/') + file

export function loadManifest(baseUrl = '/data/', f: FetchLike = fetch): Promise<DataManifest> {
  // il manifest è l'unico file non immutabile: va sempre riscaricato
  return getJson<DataManifest>(join(baseUrl, 'manifest.json') + `?t=${Date.now()}`, f)
}

export async function loadCards(m: DataManifest, baseUrl = '/data/', f: FetchLike = fetch): Promise<Card[]> {
  return decodeCards(await getJson<CardsFile>(join(baseUrl, m.files.cards), f))
}

export async function loadTexts(m: DataManifest, lang: Lang, baseUrl = '/data/', f: FetchLike = fetch): Promise<Record<string, string>> {
  const file = m.files.texts[lang]
  if (!file) return {}
  return (await getJson<TextsFile>(join(baseUrl, file), f)).texts
}

export function loadBanlists(m: DataManifest, baseUrl = '/data/', f: FetchLike = fetch): Promise<Banlist[]> {
  return getJson<Banlist[]>(join(baseUrl, m.files.banlists), f)
}

export async function loadArchetypes(m: DataManifest, baseUrl = '/data/', f: FetchLike = fetch): Promise<ArchetypeEntry[]> {
  return (await getJson<ArchetypesFile>(join(baseUrl, m.files.archetypes), f)).archetypes
}
