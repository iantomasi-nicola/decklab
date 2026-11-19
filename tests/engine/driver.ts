/** Pilota di prova per i test: sceglie una risposta valida per ogni `PendingRequest` (NON è un'IA di gioco). */
import * as A from '../../src/engine/answers'
import type { PendingRequest } from '../../src/engine/requests'
import type { Answer } from '../../src/engine/protocol'

export interface DriveOpts {
  /** indice dell'azione da fare in IDLECMD (varia la scelta); default 0 */
  step?: number
  /** priorità fra le azioni del menu principale */
  idleOrder?: ('activate' | 'specialSummon' | 'summon' | 'monsterSet' | 'spellSet')[]
  /** se true, in IDLECMD termina il turno quando non resta nulla da fare */
  chain?: 'pass' | 'first'
}

export function drive(p: PendingRequest, o: DriveOpts = {}): Answer {
  const step = o.step ?? 0
  switch (p.kind) {
    case 'idle': {
      const lists = { activate: p.activates, specialSummon: p.specialSummons, summon: p.summons, monsterSet: p.monsterSets, spellSet: p.spellSets }
      for (const k of o.idleOrder ?? (['activate', 'specialSummon', 'summon', 'monsterSet', 'spellSet'] as const)) {
        const l = lists[k]
        if (l.length) return A.answerIdle(k, l[step % l.length]!.index)
      }
      return A.answerIdle('toEnd')
    }
    case 'battle': return A.answerBattle('toEnd')
    case 'chain': return A.answerChain(o.chain === 'first' && p.options.length ? p.options[0]!.index : p.forced && p.options.length ? p.options[0]!.index : null)
    case 'effectYn': return A.answerEffectYn(true)
    case 'yesNo': return A.answerYesNo(true)
    case 'option': return A.answerOption(0)
    case 'cards': return A.answerCards(p, p.options.slice(0, Math.max(p.min, 1)).map((x) => x.index))
    case 'unselect': return p.canFinish ? A.answerUnselect(null) : A.answerUnselect(p.selectable[0]!.index)
    case 'sum': {
      const picked = [...p.mustSelect.map((x) => x.index)]
      let total = p.mustSelect.reduce((a, x) => a + x.value, 0)
      for (const x of p.options) { if (total >= p.amount) break; picked.push(x.index); total += x.value }
      return A.answerSum(picked)
    }
    case 'counter': { let left = p.count; return A.answerCounter(p.options.map((x) => { const t = Math.min(left, x.available); left -= t; return t })) }
    case 'place': return A.answerPlace(p, p.available.filter((x) => x.p === 0).slice(0, p.count))
    case 'position': return A.answerPosition(p.positions[0]!)
    case 'sort': return A.answerSort(null)
    case 'announceRace': return A.answerRace(p.available.slice(0, p.count))
    case 'announceAttribute': return A.answerAttribute(p.available.slice(0, p.count))
    case 'announceNumber': return A.answerNumber(p.options[0] ?? 0)
    case 'announceCard': return A.answerCard(p.candidates[0] ?? 0)
    case 'rps': return A.answerRps(1)
  }
}
