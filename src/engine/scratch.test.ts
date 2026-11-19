import { it } from 'vitest'
import { loadDataset, nodeScriptStore } from '../../tests/engine/helpers'
import { SCRIPTS_COMMIT } from './constants'
import { EngineHost } from './host'
import { firstLegalAnswer } from './policy'
import { validateCombo } from '@/domain/combo/validate'
import fs from 'node:fs'

it('scratch', async () => {
  const cards = loadDataset()
  const byName = (n: string) => [...cards.values()].find((c) => c.name.en === n && c.alias === 0)!.id
  const store = nodeScriptStore(SCRIPTS_COMMIT)
  const host = new EngineHost({
    loadWasm: async () => { const b = fs.readFileSync('node_modules/@n1xx1/ocgcore-wasm/lib/ocgcore.sync.wasm'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer },
    loadCards: async () => ({ cards: [...cards.values()], version: 'test' }),
    makeScripts: () => store,
  })
  console.log(await host.init())
  const main = ['Sky Striker Ace - Raye','Sky Striker Mobilize - Engage!','Sky Striker Mecha - Hornet Drones','Ash Blossom & Joyous Spring','Pot of Desires','Foolish Burial','Raigeki'].flatMap((n)=>[byName(n),byName(n),byName(n)])
  const extra = ['Sky Striker Ace - Kagari','Sky Striker Ace - Hayate'].map(byName)
  let st: any = await host.handle({ op: 'startDuel', req: { deck: { main, extra }, setup: { first: true, hand: { required: [], size: 5, fill: 'random' } }, seed: 7 } })
  for (let k = 0; k < 14 && st.pending; k++) st = await host.handle({ op: 'respond', answer: firstLegalAnswer(st.pending, k)! })
  console.log(JSON.stringify(st.steps, null, 0).replace(/\},\{"id"/g, '},\n{"id"'))
  console.log(st.requiredHand, st.cards, JSON.stringify(st.endboard), st.lp, st.errors)
  const doc = { format: 'combolab.combo', v: 1, meta: { id: '5b3f3e5e-0f1a-4f64-9a8b-0f4a6f5e0001', title: { it: 'x', en: 'x' }, scope: 'variant', archetype: { name: { it: 'x', en: 'x' } }, variant: null, rules: 'TCG', banlist: { format: 'TCG', id: '2026.10' }, tags: [], noteLang: ['it'], favorite: false, createdAt: '2026-11-19T10:00:00Z', updatedAt: '2026-11-19T10:00:00Z', source: 'engine' }, deck: { main, extra, side: [] }, cards: st.cards, setup: { first: true, hand: { required: st.requiredHand, size: 5, fill: 'random' } }, steps: st.steps, branches: [], endboard: st.endboard }
  const v = validateCombo(doc)
  console.log('valid', v.ok, JSON.stringify(v.errors), JSON.stringify(v.warnings))
}, 60000)
