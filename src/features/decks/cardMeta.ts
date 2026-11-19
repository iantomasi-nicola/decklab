import type { TFunction } from 'i18next'
import type { Card } from '@/domain/types'
import { ATTRIBUTES, extraKindOf, kindOf, levelOf, T } from './deckStats'
import type { Stack } from './deckOps'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { Lang } from '@/domain/types'
import { cardName } from './cardData'

/** Riga descrittiva breve: "Oscurità · Lv 7 · ATK 2500" oppure "Magia". Tutti i testi vengono da i18n. */
export function cardSubtitle(card: Card | undefined, t: TFunction): string {
  if (!card) return t('deck.unknownCard')
  const kind = kindOf(card)
  if (kind === 'spell') return t('deck.kind.spell')
  if (kind === 'trap') return t('deck.kind.trap')
  const parts: string[] = []
  const attr = ATTRIBUTES.find(([, bit]) => card.attribute & bit)
  if (attr) parts.push(t(`deck.attr.${attr[0]}`))
  const lv = levelOf(card)
  if (card.isExtra) {
    const ek = extraKindOf(card)
    parts.push(t(`deck.extraKind.${ek}`))
    if (lv) parts.push(t(ek === 'link' ? 'deck.linkN' : ek === 'xyz' ? 'deck.rankN' : 'deck.levelN', { n: lv }))
  } else if (lv) parts.push(t('deck.levelN', { n: lv }))
  if (card.type & T.PENDULUM) parts.push(t('deck.pendulum'))
  if (card.atk >= 0) parts.push(`ATK ${card.atk}`)
  else if (card.atk === -2) parts.push('ATK ?')
  return parts.join(' · ')
}

const KIND_ORDER = { monster: 0, spell: 1, trap: 2 } as const
const EXTRA_ORDER = { fusion: 0, synchro: 1, xyz: 2, link: 3 } as const

/** Ordine di visualizzazione: mostri (livello decrescente), magie, trappole; l'Extra per tipo. */
export function sortStacks(stacks: readonly Stack[], index: CardIndex, lang: Lang): Stack[] {
  const key = (s: Stack) => {
    const c = index.byId(s.id)
    if (!c) return [9, 0, 0] as const
    const k = KIND_ORDER[kindOf(c)]
    const e = c.isExtra && k === 0 ? EXTRA_ORDER[extraKindOf(c)] : 0
    return [k, e, -levelOf(c)] as const
  }
  return [...stacks].sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || cardName(index.byId(a.id), lang).localeCompare(cardName(index.byId(b.id), lang), lang)
  })
}
