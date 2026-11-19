/**
 * Normalizzatore messaggi del core → `Step` del formato combo (docs/COMBO_FORMAT.md, tabella in docs/SPIKE-ENGINE.md).
 *
 * Funzione PURA di (piano del duello, log dei messaggi, risposte): niente core, niente stato globale; si ricalcola da zero
 * a ogni stato (qualche centinaio di messaggi), quindi annulla/ripeti non richiedono logica incrementale.
 *
 * Un passo = una risposta del giocatore a una richiesta "di menu" (IDLECMD, BATTLECMD, CHAIN con effetto scelto).
 * Le scelte intermedie (carte, zone, posizione) si fondono nel passo in corso; i movimenti prodotti dalla risoluzione di una
 * catena finiscono nel passo del suo anello (`CHAIN_SOLVING n`).
 *
 * LIMITI NOTI (il messaggio non porta l'informazione):
 * - `MOVE` non ha il motivo: distruzione e invio al GY non si distinguono (`why: 'send'`); i costi si deducono dal contesto
 *   (movimenti tra la scelta dell'azione e `CHAINING`), le risorse (materiali/tributi) dal passo di evocazione in corso.
 * - dopo `SHUFFLE_DECK` l'identità delle carte nel mazzo si perde: si abbina per passcode (copie intercambiabili).
 * - i token che lasciano il campo diventano una mossa verso il GY.
 */
import { OcgLocation, OcgMessageType as T, OcgPhase, OcgResponseType } from './core'
import { SelectBattleCMDAction, SelectIdleCMDAction } from '@n1xx1/ocgcore-wasm'
import type { OcgLocPos, OcgMessage, OcgResponse } from '@n1xx1/ocgcore-wasm'
import type {
  ActionKind, Board, BoardPlacement, EffectKind, Endboard, Loc, Move, MoveWhy, Place, PlayerIdx, Position, Step, SummonMethod, Uid,
} from '@/domain/combo/types'
import type { DuelPlan } from './duel'
import type { CardRef, PlayerPiles } from './requests'
import { FILLER_CODE } from './cards'
import { isRequest } from './duel'

// ------------------------------------------------------------------ tipi carta (bitmask cdb)
const TYPE_MONSTER = 0x1
const TYPE_SPELL = 0x2
const TYPE_TRAP = 0x4
const TYPE_TOKEN = 0x4000
const TYPE_FUSION = 0x40
const TYPE_RITUAL = 0x80
const TYPE_SYNCHRO = 0x2000
const TYPE_XYZ = 0x800000
const TYPE_LINK = 0x4000000

// ------------------------------------------------------------------ tracker (zone fisiche)
type Key = number
type Zone = 'deck' | 'hand' | 'extra' | 'gy' | 'rm' | 'mz' | 'sz' | 'ov'
interface Where { p: PlayerIdx; z: Zone; host?: Key }

const MZ = 7
const SZ = 6 // 0-4 zone S/T (0 e 4 = pendulum), 5 = zona campo

/** Slot (0..) di una posizione "di campo" del core; -1 se non è una zona a slot. */
function slotOf(loc: number, seq: number): { z: 'mz' | 'sz'; i: number } | null {
  if (loc === OcgLocation.MZONE) return { z: 'mz', i: seq }
  if (loc === OcgLocation.SZONE) return { z: 'sz', i: seq <= 4 ? seq : seq === 5 ? 5 : seq === 6 ? 0 : 4 }
  if (loc === OcgLocation.FZONE) return { z: 'sz', i: 5 }
  if (loc === OcgLocation.PZONE) return { z: 'sz', i: seq === 0 ? 0 : 4 }
  return null
}

class Tracker {
  codes = new Map<Key, number>()
  where = new Map<Key, Where>()
  pos = new Map<Key, number>()
  arr: Record<'deck' | 'hand' | 'extra' | 'gy' | 'rm', [Key[], Key[]]> = { deck: [[], []], hand: [[], []], extra: [[], []], gy: [[], []], rm: [[], []] }
  mz: [(Key | null)[], (Key | null)[]] = [Array(MZ).fill(null), Array(MZ).fill(null)]
  sz: [(Key | null)[], (Key | null)[]] = [Array(SZ).fill(null), Array(SZ).fill(null)]
  ov = new Map<Key, Key[]>()
  lp: [number, number]
  next: number

  constructor(plan: DuelPlan) {
    this.lp = [plan.lp[0], plan.lp[1]]
    this.next = plan.cards.length
    for (const c of plan.cards) this.codes.set(c.idx, c.code)
    // mazzo del giocatore: nell'array la cima è l'ultimo elemento (come le sequence del core)
    const own = [...plan.deckTop].reverse()
    for (const k of own) this.place(k, 0, 'deck', -1)
    for (const c of plan.cards) {
      if (own.includes(c.idx)) continue
      const p = c.team
      if (c.location === OcgLocation.DECK) this.place(c.idx, p, 'deck', -1)
      else if (c.location === OcgLocation.HAND) this.place(c.idx, p, 'hand', -1)
      else if (c.location === OcgLocation.EXTRA) this.place(c.idx, p, 'extra', -1)
      else if (c.location === OcgLocation.GRAVE) this.place(c.idx, p, 'gy', -1)
      else if (c.location === OcgLocation.REMOVED) this.place(c.idx, p, 'rm', -1)
      else {
        const s = slotOf(c.location, c.sequence)
        if (s) this.place(c.idx, p, s.z, s.i, undefined, c.position)
      }
    }
  }

  create(code: number): Key {
    const k = this.next++
    this.codes.set(k, code)
    return k
  }

  private list(p: PlayerIdx, z: Zone): Key[] | (Key | null)[] {
    if (z === 'mz') return this.mz[p]
    if (z === 'sz') return this.sz[p]
    if (z === 'ov') throw new Error('ov')
    return this.arr[z][p]
  }

  remove(k: Key): void {
    const w = this.where.get(k)
    if (!w) return
    if (w.z === 'ov') {
      const l = this.ov.get(w.host!)
      if (l) { const i = l.indexOf(k); if (i >= 0) l.splice(i, 1) }
    } else {
      const l = this.list(w.p, w.z)
      const i = l.indexOf(k)
      if (i >= 0) { if (w.z === 'mz' || w.z === 'sz') (l as (Key | null)[])[i] = null; else l.splice(i, 1) }
    }
    this.where.delete(k)
  }

  /** `seq` < 0 = in coda. Per le zone a slot `seq` è lo slot. */
  place(k: Key, p: PlayerIdx, z: Zone, seq: number, host?: Key, pos?: number): void {
    this.remove(k)
    if (z === 'ov') {
      const l = this.ov.get(host!) ?? []
      this.ov.set(host!, l)
      if (seq < 0 || seq > l.length) l.push(k); else l.splice(seq, 0, k)
      this.where.set(k, { p, z, host: host! })
    } else if (z === 'mz' || z === 'sz') {
      const l = this.list(p, z) as (Key | null)[]
      const prev = l[seq]
      if (prev != null && prev !== k) this.remove(prev)
      l[seq] = k
      this.where.set(k, { p, z })
    } else {
      const l = this.list(p, z) as Key[]
      if (seq < 0 || seq >= l.length) l.push(k); else l.splice(seq, 0, k)
      this.where.set(k, { p, z })
    }
    if (pos !== undefined) this.pos.set(k, pos)
  }

  /** Tutte le carte sotto un mostro ospitante spariscono con lui solo se il core lo dice (MOVE separati): qui non si fa nulla. */

  /** Chi sta in (p, loc, seq)? Se il passcode non coincide (mano/mazzo mescolati) si cerca per passcode nella stessa zona. */
  find(p: PlayerIdx, loc: number, seq: number, code?: number, ovSeq?: number): Key | undefined {
    const match = (k: Key | null | undefined): k is Key => k != null && (code === undefined || code === 0 || this.codes.get(k) === code)
    if ((loc & OcgLocation.OVERLAY) !== 0) {
      // host = carta sul campo a (p, loc >> 8, seq)
      const hostLoc = loc >> 8 || OcgLocation.MZONE
      const hs = slotOf(hostLoc, seq)
      const host = hs ? (this.list(p, hs.z) as (Key | null)[])[hs.i] : null
      if (host == null) return undefined
      const l = this.ov.get(host) ?? []
      const direct = ovSeq !== undefined ? l[ovSeq] : undefined
      if (match(direct)) return direct
      return l.find((k) => match(k))
    }
    const s = slotOf(loc, seq)
    if (s) {
      const k = (this.list(p, s.z) as (Key | null)[])[s.i]
      return match(k) ? k : undefined
    }
    const z: Zone | null = loc === OcgLocation.DECK ? 'deck' : loc === OcgLocation.HAND ? 'hand' : loc === OcgLocation.GRAVE ? 'gy' : loc === OcgLocation.REMOVED ? 'rm' : loc === OcgLocation.EXTRA ? 'extra' : null
    if (!z) return undefined
    const l = this.list(p, z) as Key[]
    const direct = l[seq]
    if (match(direct)) return direct
    // cerca per passcode; per il mazzo preferisce la cima, altrimenti la prima della lista
    if (z === 'deck') { for (let i = l.length - 1; i >= 0; i--) if (match(l[i])) return l[i] } else { for (const k of l) if (match(k)) return k }
    return undefined
  }

  hostOf(k: Key): Key | undefined { return this.where.get(k)?.host }
  slotIndex(k: Key): number {
    const w = this.where.get(k)
    if (!w) return -1
    if (w.z === 'ov') return this.ov.get(w.host!)?.indexOf(k) ?? -1
    return this.list(w.p, w.z).indexOf(k)
  }
}

// ------------------------------------------------------------------ conversioni di posizione/zona

const POS = { FU_ATK: 1, FD_ATK: 2, FU_DEF: 4, FD_DEF: 8 }

function positionOut(z: Zone, pos: number | undefined): Position | undefined {
  if (z === 'mz') return pos === POS.FU_DEF ? 'FACEUP_DEF' : pos === POS.FD_DEF || pos === POS.FD_ATK || pos === 10 ? 'FACEDOWN_DEF' : 'FACEUP_ATK'
  if (z === 'sz') return pos === POS.FD_DEF || pos === POS.FD_ATK || pos === 10 ? 'FACEDOWN' : 'FACEUP'
  return undefined
}

const PHASES: Record<number, Step['phase']> = {
  [OcgPhase.DRAW]: 'draw', [OcgPhase.STANDBY]: 'standby', [OcgPhase.MAIN1]: 'main1', [OcgPhase.BATTLE_START]: 'battle',
  [OcgPhase.BATTLE_STEP]: 'battle', [OcgPhase.DAMAGE]: 'battle', [OcgPhase.DAMAGE_CAL]: 'battle', [OcgPhase.BATTLE]: 'battle',
  [OcgPhase.MAIN2]: 'main2', [OcgPhase.END]: 'end',
}

// ------------------------------------------------------------------ normalizzatore

export interface NormalizeInput {
  plan: DuelPlan
  /** log[0] = avvio, log[i] = messaggi dopo la risposta i */
  log: readonly (readonly OcgMessage[])[]
  /** risposte del giocatore (answers[i-1] risponde alla richiesta finale di log[i-1]) */
  answers: readonly OcgResponse[]
  /** `combo.cards` di partenza (uid già noti: mano richiesta, board) */
  cards?: Readonly<Record<Uid, number>>
  /** bitmask tipo (cdb) di un passcode, per distinguere il metodo di evocazione */
  cardType?: (code: number) => number
}

export interface NormalizeResult {
  steps: Step[]
  /** uid → passcode di tutte le carte citate (estende `cards` di input) */
  cards: Record<Uid, number>
  /** `setup.hand.required` da salvare: richieste + carte della mano iniziale usate dai passi */
  requiredHand: Uid[]
  /** board a fine duello (stato del core), nel formato combo */
  endboard: Endboard
  lp: [number, number]
  piles: [PlayerPiles, PlayerPiles]
  /** Risolve una posizione del core (come nelle richieste) in uid + Place, allo stato finale. */
  ref(l: { controller: number; location: number; sequence: number; overlay_sequence?: number }, code?: number): CardRef
  outP(team: number): PlayerIdx
}

export function normalizeDuel(inp: NormalizeInput): NormalizeResult {
  const { plan, log, answers } = inp
  const tr = new Tracker(plan)
  /** team del core → giocatore del formato combo (0 = utente) */
  const outP = (c: number): PlayerIdx => (c === plan.userTeam ? 0 : 1)
  const cardType = inp.cardType ?? (() => 0)
  const cards: Record<Uid, number> = { ...(inp.cards ?? {}) }

  // ---- uid
  const known0 = new Set<Key>() // carte del setup con uid noto (board iniziale, mano richiesta)
  const uidOfKey = new Map<Key, Uid>()
  const used = new Set<Uid>(Object.keys(cards))
  for (const c of plan.cards) if (c.uid) { uidOfKey.set(c.idx, c.uid); used.add(c.uid) }
  const counters: [number, number] = [1, 1]
  const presetKeys = new Set<Key>(uidOfKey.keys())
  const uid = (k: Key, p: PlayerIdx = 0): Uid => {
    let u = uidOfKey.get(k)
    if (u) return u
    if (tr.codes.get(k) === FILLER_CODE) { u = `x${k}`; uidOfKey.set(k, u); return u } // riempitivo: mai in `cards`
    const pref = outP(tr.where.get(k)?.p ?? p) === 1 ? 'o' : 'u'
    const ci = pref === 'o' ? 1 : 0
    do u = `${pref}${counters[ci]!++}`
    while (used.has(u))
    used.add(u)
    uidOfKey.set(k, u)
    cards[u] = tr.codes.get(k)!
    return u
  }
  const keyOfUid = (u: Uid): Key | undefined => { for (const [k, v] of uidOfKey) if (v === u) return k; return undefined }

  // uid stabili: a ogni carta fisica del giocatore e dell'avversario (da setup) si assegna l'uid subito, in ordine di piano,
  // così non dipendono da quali carte i passi citano (la UI li usa come chiavi tra una posizione e l'altra)
  for (const c of plan.cards) if (c.origin !== 'filler' && !uidOfKey.has(c.idx)) uid(c.idx, outP(c.team))

  // mano iniziale (dopo le DRAW del primo batch) — usata per `requiredHand`
  for (const c of plan.cards) if (c.uid) known0.add(c.idx)
  const initialHand = new Set<Key>()
  const referenced = new Set<Key>() // carte citate da almeno un passo

  // ---- stato di costruzione
  const steps: Step[] = []
  const movedIn = new Map<Step, Set<Key>>()
  const stepKeys = new Map<Step, { card?: Key; summoned: boolean; activated: boolean }>()
  let nextId = 1
  let cur: Step | null = null
  let pending: Step | null = null // passo creato dall'ultima risposta, in attesa di CHAINING/MOVE
  const chain: Step[] = []
  let phase: Step['phase'] | undefined
  let started = false // dopo la prima richiesta (le mosse iniziali non sono passi)
  const known = new Set<Key>(known0) // carte già "note" a chi legge il doc: possono avere `from`

  const placeOf = (k: Key, withSeq = true): Place => {
    const w = tr.where.get(k)!
    const p: Place['p'] = outP(w.p) === 1 ? 1 : undefined
    const base = (loc: Loc): Place => ({ ...(p ? { p } : {}), loc })
    switch (w.z) {
      case 'deck': return base('deck')
      case 'hand': return base('hand')
      case 'extra': return base('extra')
      case 'gy': return base('gy')
      case 'rm': return base('banished')
      case 'mz': {
        const i = tr.slotIndex(k)
        const pos = positionOut('mz', tr.pos.get(k))
        return i >= 5 ? { ...base('emz'), seq: i - 5, ...(pos ? { pos } : {}) } : { ...base('mzone'), seq: i, ...(pos ? { pos } : {}) }
      }
      case 'sz': {
        const i = tr.slotIndex(k)
        const pos = positionOut('sz', tr.pos.get(k))
        return i === 5 ? { ...base('fzone'), ...(pos ? { pos } : {}) } : { ...base('szone'), seq: i, ...(pos ? { pos } : {}) }
      }
      case 'ov': return { ...base('overlay'), ...(withSeq ? { seq: tr.slotIndex(k) } : {}), host: uid(w.host!) }
    }
  }
  /** Come placeOf, ma senza `seq` per le zone dove l'ordine non è significativo per chi legge. */
  const loose = (pl: Place): Place => (pl.loc === 'hand' || pl.loc === 'gy' || pl.loc === 'banished' || pl.loc === 'extra' || pl.loc === 'deck' ? (({ seq: _s, ...r }) => r)(pl) : pl)

  const newStep = (action: ActionKind, card?: Key, extra: Partial<Step> = {}): Step => {
    const s: Step = { id: `s${nextId++}`, action, moves: [], ...(phase ? { phase } : {}), ...extra }
    if (card !== undefined) { s.card = uid(card); referenced.add(card); s.from = loose(placeOf(card)) }
    steps.push(s)
    stepKeys.set(s, { ...(card !== undefined ? { card } : {}), summoned: false, activated: false })
    cur = s
    return s
  }

  const lpDelta = (s: Step | null, core: number, delta: number) => {
    const p = outP(core)
    if (!s || !delta) return
    const e = (s.lp ??= []).find((x) => x.p === p)
    if (e) e.delta += delta
    else s.lp.push({ p, delta })
  }

  const whyOf = (s: Step | null, k: Key, from: Zone | null, to: Zone, isDraw: boolean): MoveWhy => {
    if (isDraw) return 'draw'
    const info = s ? stepKeys.get(s) : undefined
    if (s && info && info.card === k && (to === 'mz' || to === 'sz')) {
      switch (s.action) {
        case 'setMonster': case 'setSpellTrap': return 'set'
        case 'flipSummon': return 'flip'
        case 'activate': case 'chainActivate': return 'other'
        default: return 'summon'
      }
    }
    const preChain = !!s && !!info && !info.activated
    if (to === 'ov') return 'material'
    if (to === 'mz' || to === 'sz') return from === 'ov' ? 'other' : 'summon'
    if (from === 'ov' && (to === 'gy' || to === 'rm')) return preChain ? 'cost' : 'send'
    if (s && (s.action === 'specialSummon' || s.action === 'tributeSummon') && info && !info.summoned && (from === 'mz' || from === 'sz' || from === 'hand' || from === 'gy' || from === 'rm')) {
      if (s.action === 'tributeSummon') return 'tribute'
      return 'material'
    }
    if (s && s.action === 'normalSummon' && info && !info.summoned && from === 'mz') return 'tribute'
    if (preChain && s && s.card !== undefined && k !== keyOfUid(s.card) && (from === 'hand' || from === 'mz' || from === 'sz' || from === 'gy' || from === 'rm' || from === 'deck') && (to === 'gy' || to === 'rm' || to === 'deck')) return 'cost'
    if (to === 'rm') return 'banish'
    if (to === 'gy') return from === 'hand' ? 'discard' : 'send'
    if (to === 'deck') return 'return'
    if (to === 'hand') return from === 'deck' ? 'search' : 'return'
    return 'other'
  }

  /** Registra il movimento di `k` verso la nuova zona e lo aggiunge al passo in corso. */
  const moveCard = (k: Key, to: { p: PlayerIdx; z: Zone; seq: number; host?: Key; pos?: number; ovSeq?: number }, opts: { isDraw?: boolean; why?: MoveWhy } = {}) => {
    const wasKnown = known.has(k)
    const prev = tr.where.get(k)
    const fromZone = prev?.z ?? null
    const fromPlace = prev ? loose(placeOf(k)) : undefined
    tr.place(k, to.p, to.z, to.seq, to.host, to.pos)
    known.add(k)
    if (!started || !cur || tr.codes.get(k) === FILLER_CODE) return
    const s = cur
    const why = opts.why ?? whyOf(s, k, fromZone, to.z, !!opts.isDraw)
    const toPlace = loose(placeOf(k))
    const u = uid(k, to.p)
    referenced.add(k)
    const mv: Move = { uid: u, to: toPlace, why }
    // il validatore confronta `from` con lo stato a INIZIO passo: solo la prima mossa di una carta nel passo lo porta
    const moved = (movedIn.get(s) ?? movedIn.set(s, new Set()).get(s))!
    if (fromPlace && wasKnown && !moved.has(k)) mv.from = fromPlace
    moved.add(k)
    s.moves.push(mv)
    const info = stepKeys.get(s)!
    if (info.card === k && (to.z === 'mz' || to.z === 'sz')) { info.summoned = true; s.to = toPlace }
    if (why === 'search') (s.searched ??= []).push(u)
  }

  const coreToZone = (loc: number): Zone | null => {
    if (loc & OcgLocation.OVERLAY) return 'ov'
    switch (loc) {
      case OcgLocation.DECK: return 'deck'
      case OcgLocation.HAND: return 'hand'
      case OcgLocation.EXTRA: return 'extra'
      case OcgLocation.GRAVE: return 'gy'
      case OcgLocation.REMOVED: return 'rm'
      case OcgLocation.MZONE: return 'mz'
      case OcgLocation.SZONE: case OcgLocation.FZONE: case OcgLocation.PZONE: return 'sz'
      default: return null
    }
  }

  /** Carta di un OcgLocPos (con creazione al volo se il core la mostra e non la conosciamo, es. token). */
  const keyAt = (lp: { controller: 0 | 1; location: number; sequence: number; overlay_sequence?: number }, code?: number): Key | undefined =>
    tr.find(lp.controller, lp.location, lp.sequence, code, lp.overlay_sequence)

  const methodOf = (code: number, fromExtra: boolean, inEffect: boolean): SummonMethod => {
    const t = cardType(code)
    if (t & TYPE_FUSION) return 'fusion'
    if (t & TYPE_SYNCHRO) return 'synchro'
    if (t & TYPE_XYZ) return 'xyz'
    if (t & TYPE_LINK) return 'link'
    if (t & TYPE_RITUAL) return 'ritual'
    if (inEffect) return 'effect'
    return fromExtra ? 'other' : 'procedure'
  }

  const effectIndex = (code: number, description: bigint): number | undefined => {
    if (description === 0n) return undefined
    return description >> 4n === BigInt(code) ? Number(description & 15n) + 1 : undefined
  }
  const effectKindFor = (code: number, fromChainWindow: boolean, chainOpen: boolean): EffectKind => {
    const t = cardType(code)
    if (t & (TYPE_SPELL | TYPE_TRAP) && !(t & TYPE_MONSTER)) return 'activation'
    if (fromChainWindow) return chainOpen ? 'quick' : 'trigger'
    return 'ignition'
  }

  // ---- gestione risposta
  const onAnswer = (req: OcgMessage, ans: OcgResponse) => {
    if (ans.type === OcgResponseType.SELECT_IDLECMD || ans.type === OcgResponseType.SELECT_BATTLECMD || ans.type === OcgResponseType.SELECT_CHAIN) pending = null
    if (ans.type === OcgResponseType.SELECT_IDLECMD && req.type === T.SELECT_IDLECMD) {
      const a = ans.action
      const idx = ans.index ?? 0
      const pick = (l: readonly { code: number; controller: 0 | 1; location: number; sequence: number }[]) => {
        const e = l[idx]
        return e ? keyAt(e, e.code) : undefined
      }
      switch (a) {
        case SelectIdleCMDAction.SELECT_SUMMON: { const k = pick(req.summons); pending = newStep(isFaceDownMonster(k) ? 'flipSummon' : 'normalSummon', k); return }
        case SelectIdleCMDAction.SELECT_SPECIAL_SUMMON: {
          const k = pick(req.special_summons)
          const code = k !== undefined ? tr.codes.get(k)! : 0
          pending = newStep('specialSummon', k, { method: methodOf(code, tr.where.get(k ?? -1)?.z === 'extra', false) })
          return
        }
        case SelectIdleCMDAction.SELECT_POS_CHANGE: { pending = newStep('changePosition', pick(req.pos_changes)); return }
        case SelectIdleCMDAction.SELECT_MONSTER_SET: { pending = newStep('setMonster', pick(req.monster_sets)); return }
        case SelectIdleCMDAction.SELECT_SPELL_SET: { pending = newStep('setSpellTrap', pick(req.spell_sets)); return }
        case SelectIdleCMDAction.SELECT_ACTIVATE: {
          const e = req.activates[idx]
          const k = e ? keyAt(e, e.code) : undefined
          const code = e?.code ?? 0
          const idxE = e ? effectIndex(code, e.description) : undefined
          pending = newStep('activate', k, { effect: { kind: effectKindFor(code, false, false), ...(idxE ? { index: idxE } : {}) } })
          return
        }
        case SelectIdleCMDAction.TO_BP: { cur = pending = null; newStep('enterPhase', undefined, { phase: 'battle' }); return }
        case SelectIdleCMDAction.TO_EP: { cur = pending = null; newStep('enterPhase', undefined, { phase: 'end' }); return }
        case SelectIdleCMDAction.SHUFFLE: { newStep('shuffle'); return }
        default: return
      }
    }
    if (ans.type === OcgResponseType.SELECT_BATTLECMD && req.type === T.SELECT_BATTLECMD) {
      const idx = ans.index ?? 0
      if (ans.action === SelectBattleCMDAction.SELECT_BATTLE) {
        const e = req.attacks[idx]
        const k = e ? keyAt(e, e.code) : undefined
        pending = newStep('attack', k)
        return
      }
      if (ans.action === SelectBattleCMDAction.SELECT_CHAIN) {
        const e = req.chains[idx]
        const k = e ? keyAt(e, e.code) : undefined
        const code = e?.code ?? 0
        const idxE = e ? effectIndex(code, e.description) : undefined
        pending = newStep('activate', k, { effect: { kind: effectKindFor(code, true, false), ...(idxE ? { index: idxE } : {}) } })
        return
      }
      cur = pending = null
      newStep('enterPhase', undefined, { phase: ans.action === SelectBattleCMDAction.TO_M2 ? 'main2' : 'end' })
      return
    }
    if (ans.type === OcgResponseType.SELECT_CHAIN && req.type === T.SELECT_CHAIN) {
      if (ans.index === null || ans.index === undefined) return
      const e = req.selects[ans.index]
      if (!e) return
      const k = keyAt(e, e.code)
      const open = chain.length > 0
      const idxE = effectIndex(e.code, e.description)
      pending = newStep(open ? 'chainActivate' : 'activate', k, { effect: { kind: effectKindFor(e.code, true, open), ...(idxE ? { index: idxE } : {}) } })
      return
    }
    if (ans.type === OcgResponseType.SELECT_TRIBUTE && cur && cur.action === 'normalSummon') cur.action = 'tributeSummon'
  }
  const isFaceDownMonster = (k: Key | undefined): boolean => k !== undefined && tr.where.get(k)?.z === 'mz' && ((tr.pos.get(k) ?? 1) & 0xa) !== 0

  // ---- gestione messaggi
  const asLp = (m: OcgLocPos | { controller: 0 | 1; location: number; sequence: number }) => m as { controller: 0 | 1; location: number; sequence: number; position?: number; overlay_sequence?: number }

  const onMessage = (m: OcgMessage) => {
    switch (m.type) {
      case T.NEW_PHASE: phase = PHASES[m.phase] ?? phase; return
      case T.DRAW: {
        for (const d of m.drawn) {
          const deck = tr.arr.deck[m.player as 0 | 1]
          let k: Key | undefined = deck[deck.length - 1]
          if (k === undefined || tr.codes.get(k) !== d.code) k = [...deck].reverse().find((x) => tr.codes.get(x) === d.code)
          if (k === undefined) k = tr.create(d.code)
          moveCard(k, { p: m.player as 0 | 1, z: 'hand', seq: -1 }, { isDraw: true })
          if (!started) initialHand.add(k)
        }
        return
      }
      case T.MOVE: {
        const from = asLp(m.from)
        const to = asLp(m.to)
        const zFrom = coreToZone(from.location)
        const zTo = coreToZone(to.location)
        let k = zFrom ? keyAt(from, m.card) : undefined
        if (k === undefined) k = tr.create(m.card) // carta creata (token/evocata da fuori partita)
        if (!zTo) {
          // lascia il gioco (token distrutto): resta tracciata nel GY come mossa
          moveCard(k, { p: from.controller, z: 'gy', seq: -1 })
          return
        }
        let host: Key | undefined
        if (zTo === 'ov') {
          const hs = slotOf((to.location >> 8) || OcgLocation.MZONE, to.sequence)
          host = hs ? (tr.mz[to.controller] as (Key | null)[])[hs.i] ?? undefined : undefined
          if (host === undefined) return
        }
        const slot = slotOf(to.location, to.sequence)
        const seq = zTo === 'mz' || zTo === 'sz' ? slot!.i : zTo === 'ov' ? to.overlay_sequence ?? -1 : -1
        moveCard(k, { p: to.controller, z: zTo, seq, ...(host !== undefined ? { host } : {}), ...(to.position !== undefined ? { pos: to.position } : {}) })
        return
      }
      case T.SET: case T.SUMMONING: case T.SPSUMMONING: case T.FLIPSUMMONING: {
        const s = cur
        if (m.type === T.SPSUMMONING && s) {
          const k = keyAt(asLp(m), m.code)
          const inStepEffect = s.action === 'activate' || s.action === 'chainActivate'
          if (s.action === 'specialSummon' && k !== undefined && s.card === uid(k)) s.method = methodOf(m.code, false, false)
          else if (inStepEffect && s.moves.length) { /* effetto: nessun metodo a livello di passo */ }
        }
        if (m.type === T.FLIPSUMMONING && s && s.action === 'normalSummon') s.action = 'flipSummon'
        return
      }
      case T.POS_CHANGE: {
        const k = keyAt(m, m.code)
        if (k === undefined) return
        const before = loose(placeOf(k))
        tr.pos.set(k, m.position)
        if (started && cur) {
          const after = loose(placeOf(k))
          const moved = (movedIn.get(cur) ?? movedIn.set(cur, new Set()).get(cur))!
          cur.moves.push({ uid: uid(k), ...(known.has(k) && !moved.has(k) ? { from: before } : {}), to: after, why: 'position' })
          moved.add(k)
          known.add(k)
          referenced.add(k)
          if (cur.action === 'changePosition') cur.to = after
        }
        return
      }
      case T.CHAINING: {
        let s = pending
        pending = null
        if (!s) {
          const k = keyAt(m, m.code)
          s = newStep(chain.length ? 'chainActivate' : 'activate', k, { effect: { kind: effectKindFor(m.code, chain.length > 0, chain.length > 0) } })
        }
        const info = stepKeys.get(s)
        if (info) info.activated = true
        const idxE = effectIndex(m.code, m.description)
        if (idxE && s.effect && s.effect.index === undefined) s.effect.index = idxE
        chain[m.chain_size - 1] = s
        s.chain = { id: chain[0]!.id, link: m.chain_size }
        // i costi pagati prima di CHAINING sono già nel passo (why 'cost'); raccolta in `costs`
        cur = s
        return
      }
      case T.CHAIN_SOLVING: cur = chain[m.chain_size - 1] ?? cur; return
      case T.CHAIN_END: chain.length = 0; return
      case T.BECOME_TARGET: case T.CARD_TARGET: {
        const list = m.type === T.BECOME_TARGET ? m.cards : [m.target]
        if (!cur) return
        for (const c of list) {
          const k = keyAt(c as never)
          if (k === undefined) continue
          const u = uid(k)
          referenced.add(k)
          const t = (cur.targets ??= [])
          if (!t.includes(u)) t.push(u)
        }
        return
      }
      case T.EQUIP: {
        const k = keyAt(asLp(m.card) as never)
        const tg = keyAt(asLp(m.target) as never)
        if (cur && tg !== undefined) {
          const t = (cur.targets ??= [])
          const u = uid(tg)
          if (!t.includes(u)) t.push(u)
          referenced.add(tg)
        }
        void k
        return
      }
      case T.ATTACK: {
        if (cur && cur.action === 'attack' && m.target) {
          const tg = keyAt(asLp(m.target) as never)
          if (tg !== undefined) { cur.targets = [uid(tg)]; referenced.add(tg) }
        }
        return
      }
      case T.SHUFFLE_HAND: {
        // il core manda i passcode nel nuovo ordine: riordina le carte della mano abbinando per passcode
        const hand = tr.arr.hand[m.player as 0 | 1]
        const pool = [...hand]
        const ordered: Key[] = []
        for (const code of m.cards) {
          const i = pool.findIndex((x) => tr.codes.get(x) === code)
          if (i >= 0) ordered.push(...pool.splice(i, 1))
        }
        hand.splice(0, hand.length, ...ordered, ...pool)
        return
      }
      case T.LPUPDATE: {
        const p = m.player as PlayerIdx
        lpDelta(started ? cur : null, p, m.lp - tr.lp[p])
        tr.lp[p] = m.lp
        return
      }
      case T.DAMAGE: case T.RECOVER: case T.PAY_LPCOST: {
        const x = m as unknown as { player: number; amount: number }
        const p = x.player as PlayerIdx
        const d = m.type === T.RECOVER ? x.amount : -x.amount
        lpDelta(started ? cur : null, p, d)
        tr.lp[p] += d
        return
      }
      case T.ADD_COUNTER: case T.REMOVE_COUNTER: {
        const k = keyAt(m)
        if (k === undefined || !started || !cur) return
        referenced.add(k)
        const type = `0x${m.counter_type.toString(16)}`
        const delta = m.type === T.ADD_COUNTER ? m.count : -m.count
        const e = (cur.counters ??= []).find((c) => c.uid === uid(k) && c.type === type)
        if (e) e.delta += delta
        else cur.counters.push({ uid: uid(k), type, delta })
        return
      }
      default: return
    }
  }

  // ---- ciclo principale
  for (let i = 0; i < log.length; i++) {
    const batch = log[i]!
    if (i >= 1) {
      const prev = log[i - 1]!
      const req = [...prev].reverse().find(isRequest)
      const ans = answers[i - 1]
      if (req && ans) onAnswer(req, ans)
    }
    for (const m of batch) onMessage(m)
    if (i === 0) {
      started = true
      for (const k of initialHand) known.add(k)
    }
  }

  // costi aggregati per passo
  for (const s of steps) {
    const costs = new Map<string, Uid[]>()
    for (const mv of s.moves) {
      if (mv.why !== 'cost' && mv.why !== 'tribute') continue
      const kind = mv.why === 'tribute' ? 'tribute' : mv.from?.loc === 'overlay' ? 'detach' : mv.to.loc === 'banished' ? 'banish' : mv.to.loc === 'gy' ? (mv.from?.loc === 'hand' ? 'discard' : 'send') : mv.to.loc === 'deck' ? 'return' : 'other'
      const l = costs.get(kind) ?? []
      l.push(mv.uid)
      costs.set(kind, l)
    }
    if (costs.size) s.costs = [...costs].map(([kind, c]) => ({ kind, cards: c }))
  }

  // mano richiesta: quelle date + carte della mano iniziale citate nei passi
  const requiredHand: Uid[] = []
  for (const c of plan.cards) if (c.uid && c.origin === 'main' && tr.where.get(c.idx) && initialHand.has(c.idx)) requiredHand.push(c.uid)
  for (const k of initialHand) {
    if (referenced.has(k) || presetKeys.has(k)) {
      const u = uid(k)
      if (!requiredHand.includes(u)) requiredHand.push(u)
    }
  }

  // endboard dallo stato del core
  const boardOfPlayer = (pOut: PlayerIdx): Board => {
    const p = pOut === 0 ? plan.userTeam : ((1 - plan.userTeam) as 0 | 1)
    const places: BoardPlacement[] = []
    const add = (k: Key | null) => { if (k != null) { places.push({ uid: uid(k), place: placeOf(k) }); for (const m of tr.ov.get(k) ?? []) places.push({ uid: uid(m), place: placeOf(m) }) } }
    for (const k of tr.mz[p]) add(k)
    for (const k of tr.sz[p]) add(k)
    places.sort((a, b) => a.uid.localeCompare(b.uid, 'en', { numeric: true }))
    return { lp: tr.lp[p], places }
  }
  const opp = boardOfPlayer(1)
  const own = boardOfPlayer(0)
  const endboard: Endboard = opp.places.length === 0 && opp.lp === 8000 ? { own } : { own, opponent: opp }
  void TYPE_TOKEN

  const pileOf = (pOut: PlayerIdx): PlayerPiles => {
    const p = pOut === 0 ? plan.userTeam : ((1 - plan.userTeam) as 0 | 1)
    const list = (arr: Key[]): CardRef[] =>
      arr.map((k, i) => {
        const hidden = tr.codes.get(k) === FILLER_CODE
        return { uid: uid(k, pOut), code: hidden ? 0 : tr.codes.get(k) ?? 0, place: { ...placeOf(k), seq: i } }
      })
    return {
      hand: list(tr.arr.hand[p]), gy: list(tr.arr.gy[p]), banished: list(tr.arr.rm[p]), extra: list(tr.arr.extra[p]),
      deckCount: tr.arr.deck[p].length, handCount: tr.arr.hand[p].length,
    }
  }
  const piles: [PlayerPiles, PlayerPiles] = [pileOf(0), pileOf(1)]

  const ref: NormalizeResult['ref'] = (l, code) => {
    const k = tr.find(l.controller as 0 | 1, l.location, l.sequence, code, l.overlay_sequence)
    if (k !== undefined && tr.where.has(k)) return { uid: uid(k), code: tr.codes.get(k) ?? code ?? 0, place: placeOf(k) }
    // carta che non conosciamo (coperta dell'avversario, creata dal core): uid nuovo con la posizione grezza
    const nk = tr.create(code ?? 0)
    const z = coreToZone(l.location)
    const slot = slotOf(l.location, l.sequence)
    if (z && z !== 'ov' && slot) tr.place(nk, l.controller as 0 | 1, slot.z, slot.i)
    else if (z && z !== 'ov') tr.place(nk, l.controller as 0 | 1, z, -1)
    const u = uid(nk, l.controller as 0 | 1)
    return { uid: u, code: code ?? 0, place: tr.where.has(nk) ? placeOf(nk) : { loc: 'hand' } }
  }

  return { steps, cards, requiredHand, endboard, lp: [tr.lp[plan.userTeam], tr.lp[(1 - plan.userTeam) as 0 | 1]], piles, ref, outP }
}
