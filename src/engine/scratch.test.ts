import { it } from 'vitest'
import { loadDataset, loadNodeCore, nodeScriptStore } from '../../tests/engine/helpers'
import { SCRIPTS_COMMIT } from './constants'
import { makeCardReader } from './cards'
import { buildPlan, runDuel } from './duel'
import { passOpponent, firstLegalAnswer } from './policy'
import { OcgMessageType } from './core'

it('scratch', async () => {
  const cards = loadDataset()
  const byName = (n: string) => [...cards.values()].find((c) => c.name.en === n && c.alias === 0)!.id
  const lib = await loadNodeCore()
  const store = nodeScriptStore(SCRIPTS_COMMIT)
  const main = ['Sky Striker Ace - Raye','Sky Striker Mobilize - Engage!','Sky Striker Mecha - Hornet Drones','Ash Blossom & Joyous Spring','Pot of Desires','Foolish Burial','Raigeki'].flatMap((n)=>[byName(n),byName(n),byName(n)])
  const extra = ['Sky Striker Ace - Kagari','Sky Striker Ace - Hayate'].map(byName)
  const plan = buildPlan({ deck: { main, extra }, setup: { first: true, hand: { required: [], size: 5, fill: 'random' } }, seed: 7 })
  console.log('deckTop', plan.deckTop.slice(0,6).map((i)=>plan.cards[i]!.code), 'draw', plan.startingDraw)
  await store.preload([...main, ...extra])
  const reader = makeCardReader(cards)
  const answers: any[] = []
  let r
  for (let k = 0; k < 14; k++) {
    store.clearMissing()
    r = runDuel({ lib, plan, cardReader: reader, scripts: store, answers, opponentPolicy: passOpponent })
    if (store.missing.length) { await store.fetchMissing(); k--; continue }
    if (!r.pending) break
    const a = firstLegalAnswer(r.pending, k)!
    answers.push(a)
  }
  const flat = r!.log.flat()
  const names: Record<number,string> = Object.fromEntries(Object.entries(OcgMessageType).filter(([,v])=>typeof v==='number').map(([k,v])=>[v as number,k]))
  for (const [i, b] of r!.log.entries()) { console.log('--- batch', i, answers[i-1] ? JSON.stringify(answers[i-1], (_,v)=>typeof v==='bigint'?v.toString()+'n':v) : ''); for (const m of b) { const x:any = {...m}; const t = names[x.type]; if (['HINT','CARD_HINT','UPDATE_DATA','SHOW_HINT'].includes(t)) continue; delete x.type; console.log(t, JSON.stringify(x, (_,v)=>typeof v==='bigint'?v.toString()+'n':v).slice(0,300)) } }
  console.log(r!.errors, flat.length)
}, 60000)
