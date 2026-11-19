/** Store del dataset carte: manifest + CardIndex + banlist/archetipi, caricati una volta sola e on demand. */
import { create } from 'zustand'
import type { Lang } from '@/domain/types'
import { createCardIndex } from '@/domain/deck/cardIndex'
import { decodeCards, loadArchetypes, loadBanlists, loadManifest, loadTexts, type DataManifest } from '@/domain/cards/loadCards'
import type { CardDataState } from './api'
import { initSearchIndex } from './searchClient'

export const dataBaseUrl = () => `${import.meta.env.BASE_URL ?? '/'}data/`.replace(/\/{2,}/g, '/')

const useStore = create<{ state: CardDataState }>(() => ({ state: { status: 'loading' } }))
export const useCardDataState = () => useStore((s) => s.state)
export const getCardDataState = () => useStore.getState().state

let manifestPromise: Promise<DataManifest> | undefined
let loadPromise: Promise<void> | undefined
let manifestRef: DataManifest | undefined

/** Manifest (scaricato una volta per sessione). */
export function ensureManifest(): Promise<DataManifest> {
  manifestPromise ??= loadManifest(dataBaseUrl()).then((m) => (manifestRef = m))
  manifestPromise.catch(() => (manifestPromise = undefined))
  return manifestPromise
}

/** Carica tutto (idempotente). In caso di errore lo stato diventa 'error' e una nuova chiamata riprova. */
export function loadCardData(): Promise<void> {
  if (loadPromise) return loadPromise
  useStore.setState({ state: { status: 'loading' } })
  const p = (async () => {
    const base = dataBaseUrl()
    const m = await ensureManifest()
    // l'indice di ricerca si costruisce nel worker, in parallelo al decode sul main thread
    void initSearchIndex(new URL(base + m.files.cards, globalThis.location?.href ?? 'http://localhost/').href).catch(() => {})
    const [cards, banlists, archetypes] = await Promise.all([
      fetch(base + m.files.cards).then(async (r) => {
        if (!r.ok) throw new Error(`Download fallito (${r.status}): ${m.files.cards}`)
        return decodeCards(await r.json())
      }),
      loadBanlists(m, base),
      loadArchetypes(m, base),
    ])
    useStore.setState({ state: { status: 'ready', index: createCardIndex(cards), banlists, archetypes, datasetVersion: m.version } })
  })()
  loadPromise = p
  p.catch((err: unknown) => {
    loadPromise = undefined
    useStore.setState({ state: { status: 'error', message: err instanceof Error ? err.message : String(err) } })
  })
  return p
}

const textsCache = new Map<Lang, Promise<Record<string, string>>>()
export function loadTextsOnce(lang: Lang): Promise<Record<string, string>> {
  let p = textsCache.get(lang)
  if (!p) {
    p = ensureManifest().then((m) => loadTexts(m, lang, dataBaseUrl()))
    textsCache.set(lang, p)
    p.catch(() => textsCache.delete(lang))
  }
  return p
}

export const currentManifest = () => manifestRef
