import { it } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeHand, sensitivity, parseDeckspace } from './index'
it('bench', () => {
  const out: string[] = []
  const t = (name: string, f: () => unknown) => { const s = performance.now(); f(); out.push(`${name} ${Math.round(performance.now() - s)}ms`) }
  const p = parseDeckspace(readFileSync('tests/fixtures/deckspace-unchained.json', 'utf8'))
  if (!p.ok) throw 1
  const fx = { cards: p.project.cards.map((c) => ({ id: c.id, count: c.count, tags: c.tags, comboWith: c.comboWith, brickWith: c.brickWith })), labels: p.project.labels, assumedDeckSize: null }
  t('fixture hand6 detail', () => computeHand(fx, 6, { detail: true }))
  t('fixture sens h5', () => sensitivity(fx, 5))
  t('fixture sens h6', () => sensitivity(fx, 6))
  const c25 = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, count: i < 15 ? 2 : 1, tags: i % 3 === 0 ? ['S1'] : ['C2'], comboWith: [((i + 1) % 25) + 1, ((i + 5) % 25) + 1] }))
  const d25 = { cards: c25, labels: {}, assumedDeckSize: 40 }
  t('25 types h5 sens', () => sensitivity(d25, 5))
  t('25 types h6 sens', () => sensitivity(d25, 6))
  const c40 = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, count: 1, tags: ['C2'], comboWith: [((i + 1) % 40) + 1] }))
  const d40 = { cards: c40, labels: {}, assumedDeckSize: 40 }
  t('40 distinct h6 hand', () => computeHand(d40, 6, { detail: true }))
  t('40 distinct h5 sens', () => sensitivity(d40, 5))
  throw new Error(out.join(' | '))
})
