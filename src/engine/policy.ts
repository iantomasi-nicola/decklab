/**
 * Risposte automatiche pure (funzioni del solo messaggio, quindi deterministiche e rigiocabili):
 * - `passOpponent`: l'avversario non agisce mai (nessuna IA; i "comportamenti" dichiarativi della §6.5 arrivano dopo);
 * - `firstLegalAnswer`: prima opzione valida, per pilotare duelli di prova e test (NON è un'IA di gioco).
 */
import {
  OcgLocation, OcgMessageType as T, OcgResponseType as R,
} from './core'
import { SelectBattleCMDAction, SelectIdleCMDAction } from '@n1xx1/ocgcore-wasm'
import type { OcgMessage, OcgResponse } from '@n1xx1/ocgcore-wasm'
import type { AutoSettings } from './protocol'

/** Risposta "passa" a una richiesta dell'avversario; null se non esiste una risposta neutra sicura. */
export function passOpponent(m: OcgMessage): OcgResponse | null {
  switch (m.type) {
    case T.SELECT_IDLECMD: return { type: R.SELECT_IDLECMD, action: m.to_ep ? SelectIdleCMDAction.TO_EP : SelectIdleCMDAction.TO_BP, index: null }
    case T.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: m.to_ep ? SelectBattleCMDAction.TO_EP : SelectBattleCMDAction.TO_M2, index: null }
    case T.SELECT_CHAIN: return m.forced && m.selects.length ? { type: R.SELECT_CHAIN, index: 0 } : { type: R.SELECT_CHAIN, index: null }
    case T.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: false }
    case T.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: false }
    default: return firstLegalAnswer(m, 0)
  }
}

/** Prima opzione legale per ogni tipo di richiesta; `step` varia l'indice della scelta nel menu principale. */
export function firstLegalAnswer(m: OcgMessage, step = 0): OcgResponse | null {
  switch (m.type) {
    case T.SELECT_IDLECMD: {
      const order = [
        ['activates', SelectIdleCMDAction.SELECT_ACTIVATE], ['special_summons', SelectIdleCMDAction.SELECT_SPECIAL_SUMMON],
        ['summons', SelectIdleCMDAction.SELECT_SUMMON], ['monster_sets', SelectIdleCMDAction.SELECT_MONSTER_SET],
        ['spell_sets', SelectIdleCMDAction.SELECT_SPELL_SET],
      ] as const
      for (const [k, a] of order) if (m[k].length) return { type: R.SELECT_IDLECMD, action: a, index: step % m[k].length }
      return { type: R.SELECT_IDLECMD, action: m.to_ep ? SelectIdleCMDAction.TO_EP : SelectIdleCMDAction.TO_BP, index: null }
    }
    case T.SELECT_BATTLECMD: return { type: R.SELECT_BATTLECMD, action: m.to_ep ? SelectBattleCMDAction.TO_EP : SelectBattleCMDAction.TO_M2, index: null }
    case T.SELECT_EFFECTYN: return { type: R.SELECT_EFFECTYN, yes: true }
    case T.SELECT_YESNO: return { type: R.SELECT_YESNO, yes: true }
    case T.SELECT_OPTION: return { type: R.SELECT_OPTION, index: 0 }
    case T.SELECT_CARD: return { type: R.SELECT_CARD, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_TRIBUTE: return { type: R.SELECT_TRIBUTE, indicies: Array.from({ length: m.min }, (_, i) => i) }
    case T.SELECT_UNSELECT_CARD: return m.can_finish ? { type: R.SELECT_UNSELECT_CARD, index: null } : { type: R.SELECT_UNSELECT_CARD, index: 0 }
    case T.SELECT_CHAIN: return m.forced && m.selects.length ? { type: R.SELECT_CHAIN, index: 0 } : { type: R.SELECT_CHAIN, index: m.selects.length ? 0 : null }
    case T.SELECT_PLACE:
    case T.SELECT_DISFIELD: {
      const places: { player: number; location: number; sequence: number }[] = []
      for (const loc of [OcgLocation.MZONE, OcgLocation.SZONE]) {
        for (let s = 0; s < 7 && places.length < m.count; s++) {
          const bit = (loc === OcgLocation.MZONE ? 0 : 8) + s
          if (!(m.field_mask & (1 << bit))) places.push({ player: m.player, location: loc, sequence: s })
        }
        if (places.length >= m.count) break
      }
      return m.type === T.SELECT_PLACE ? { type: R.SELECT_PLACE, places: places as never } : { type: R.SELECT_DISFIELD, places: places as never }
    }
    case T.SELECT_POSITION: return { type: R.SELECT_POSITION, position: (m.positions & 1 ? 1 : m.positions & 4 ? 4 : m.positions & 8 ? 8 : 2) as never }
    case T.SELECT_COUNTER: {
      const c = new Array<number>(m.cards.length).fill(0)
      let left = m.count
      for (let i = 0; left > 0 && i < m.cards.length; i++) { const t = Math.min(left, m.cards[i]!.count); c[i] = t; left -= t }
      return { type: R.SELECT_COUNTER, counters: c }
    }
    case T.SELECT_SUM: return { type: R.SELECT_SUM, indicies: m.selects.slice(0, Math.max(1, m.min)).map((_, i) => i) }
    case T.SORT_CARD:
    case T.SORT_CHAIN: return { type: R.SORT_CARD, order: null }
    case T.ANNOUNCE_RACE: return { type: R.ANNOUNCE_RACE, races: [1n as never] }
    case T.ANNOUNCE_ATTRIB: return { type: R.ANNOUNCE_ATTRIB, attributes: [1 as never] }
    case T.ANNOUNCE_NUMBER: return { type: R.ANNOUNCE_NUMBER, value: 0 }
    case T.ROCK_PAPER_SCISSORS: return { type: R.ROCK_PAPER_SCISSORS, value: 1 as never }
    default: return null
  }
}

const popcount = (n: number): number => { let c = 0; for (let x = n >>> 0; x; x &= x - 1) c++; return c }

/**
 * Politica automatica del GIOCATORE a strati: 1) scelte uniche, 2) finestre senza azioni (secondo `pause`), 3) il resto alla UI.
 * Funzione pura del messaggio: le risposte prodotte vengono comunque registrate (vedi session.ts).
 */
export function autoAnswer(m: OcgMessage, s: AutoSettings): OcgResponse | null {
  switch (m.type) {
    case T.SELECT_CHAIN: {
      if (m.forced) return s.single && m.selects.length === 1 ? { type: R.SELECT_CHAIN, index: 0 } : null
      if (s.pause === 'never') return { type: R.SELECT_CHAIN, index: null }
      if (s.pause === 'ifCanRespond' && m.selects.length === 0) return { type: R.SELECT_CHAIN, index: null }
      return null
    }
    case T.SELECT_CARD:
      return s.single && m.min > 0 && m.selects.length === m.min ? { type: R.SELECT_CARD, indicies: m.selects.map((_, i) => i) } : null
    case T.SELECT_TRIBUTE:
      return s.single && m.min > 0 && m.selects.length === m.min ? { type: R.SELECT_TRIBUTE, indicies: m.selects.map((_, i) => i) } : null
    case T.SELECT_PLACE:
    case T.SELECT_DISFIELD: {
      if (!s.single) return null
      const free: { player: number; location: number; sequence: number }[] = []
      for (const team of [0, 1]) {
        const b = team * 16
        for (let i = 0; i < 7; i++) if (!((m.field_mask >>> (b + i)) & 1)) free.push({ player: team, location: OcgLocation.MZONE, sequence: i })
        for (let i = 0; i < 5; i++) if (!((m.field_mask >>> (b + 8 + i)) & 1)) free.push({ player: team, location: OcgLocation.SZONE, sequence: i })
        if (!((m.field_mask >>> (b + 13)) & 1)) free.push({ player: team, location: OcgLocation.SZONE, sequence: 5 })
      }
      if (free.length !== m.count) return null
      return m.type === T.SELECT_PLACE ? { type: R.SELECT_PLACE, places: free as never } : { type: R.SELECT_DISFIELD, places: free as never }
    }
    case T.SELECT_POSITION: {
      if (!s.single || popcount(m.positions) !== 1) return null
      return { type: R.SELECT_POSITION, position: m.positions as never }
    }
    case T.SELECT_OPTION: return s.single && m.options.length === 1 ? { type: R.SELECT_OPTION, index: 0 } : null
    case T.SORT_CARD:
    case T.SORT_CHAIN: return s.sort ? { type: R.SORT_CARD, order: null } : null
    case T.ANNOUNCE_ATTRIB: return s.single && popcount(m.available) === m.count ? { type: R.ANNOUNCE_ATTRIB, attributes: [1, 2, 4, 8, 16, 32, 64].filter((b) => m.available & b) as never } : null
    case T.ANNOUNCE_NUMBER: return s.single && m.options.length === 1 ? { type: R.ANNOUNCE_NUMBER, value: Number(m.options[0]) } : null
    default: return null
  }
}
