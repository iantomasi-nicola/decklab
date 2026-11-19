import type { DeckLists, Lang } from '../types'
import type { CardIndex } from './cardIndex'

const HEADERS: Record<Lang, [string, string, string]> = {
  it: ['Main Deck', 'Extra Deck', 'Side Deck'],
  en: ['Main Deck', 'Extra Deck', 'Side Deck'],
}

/** Export testuale ("3 Nome") nella lingua scelta; raggruppa per carta canonica mantenendo l'ordine di prima apparizione. */
export function exportDeckText(deck: DeckLists, index: CardIndex, lang: Lang): string {
  const sections: [string, number[]][] = [
    [HEADERS[lang][0], deck.main],
    [HEADERS[lang][1], deck.extra],
    [HEADERS[lang][2], deck.side],
  ]
  const blocks: string[] = []
  for (const [title, ids] of sections) {
    if (!ids.length) continue
    const counts = new Map<number, number>()
    for (const id of ids) {
      const c = index.canonicalId(id)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    const lines = [...counts].map(([id, n]) => {
      const card = index.byId(id)
      const name = card ? (card.name[lang] ?? card.name.en) : String(id)
      return `${n} ${name}`
    })
    blocks.push(`${title} (${ids.length})\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n') + '\n'
}
