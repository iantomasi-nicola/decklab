import { it } from 'vitest'
import { computeHand, sensitivity } from './index'
it('bench', () => {
  const cards = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, count: 1, tags: ['C2'], comboWith: [((i + 1) % 40) + 1] }))
  let t = performance.now()
  const r = computeHand({ cards, labels: {}, assumedDeckSize: 40 }, 6, { detail: true })
  console.log('40 distinct h6', Math.round(performance.now() - t), 'ms', r.playable)
  const cards2 = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, count: 2, tags: ['C2'], comboWith: [((i + 1) % 20) + 1] }))
  t = performance.now()
  computeHand({ cards: cards2, labels: {}, assumedDeckSize: 40 }, 6, { detail: true })
  console.log('20x2 h6', Math.round(performance.now() - t), 'ms')
  t = performance.now()
  sensitivity({ cards: cards2, labels: {}, assumedDeckSize: 40 }, 6)
  console.log('sens 20x2 h6', Math.round(performance.now() - t), 'ms')
})
