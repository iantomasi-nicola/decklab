import { it } from 'vitest'
import { validateCombo } from '@/domain/combo/validate'
it('x', () => {
  const doc = { format:'combolab.combo', v:1, meta:{id:'a', title:{it:'P'}, scope:'archetype', archetype:{id:'x', name:{it:'P'}}, variant:null, rules:'TCG', banlist:{format:'TCG', id:''}, tags:[], noteLang:[], favorite:false, createdAt:'2026-11-19T00:00:00.000Z', updatedAt:'2026-11-19T00:00:00.000Z', source:'manual'},
    deck:{main:[],extra:[],side:[]}, cards:{u1:10028593}, setup:{first:true, hand:{required:['u1'], size:5, fill:'none'}, own:{lp:8000, places:[]}, opponent:{board:{lp:8000, places:[]}, interrupts:[]}}, steps:[], branches:[] }
  console.log(JSON.stringify(validateCombo(doc), null, 1))
})
