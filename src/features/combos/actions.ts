/**
 * Tabella origine → destinazione del drag & drop (docs/ARCHITECTURE.md §8.1), pura e testabile.
 * Nel manuale valgono solo regole di buon senso (nessuna regola di gioco): `destinations` dice dove ha senso
 * rilasciare, `optionsFor` quali azioni proporre (la prima è il default).
 */
import { ownerOfUid, type GameState, type NPlace } from '@/domain/combo/state'
import type { ActionKind, Move, MoveWhy, Place, PlayerIdx, Position, Step, SummonMethod, Uid } from '@/domain/combo/types'
import type { CardInfo } from './cardKind'
import { countAt, freeSeq, occupantAt, pileSeq, PENDULUM_SEQS, ZONE_COUNT, type Dest, type PileLoc, type ZoneLoc } from './zones'

export type StepDraft = Omit<Step, 'id'>

/** Operazione da completare toccando le carte (tributi, materiali). */
export type Follow =
  | { kind: 'tribute'; need: number }
  | { kind: 'materials'; xyz: boolean; host: Uid }

export interface Option {
  /** id stabile (per "ricorda l'ultima scelta"); la chiave i18n è `combos.act.<id>` */
  id: string
  draft: StepDraft
  follow?: Follow
}

export interface Src {
  uid: Uid
  place: NPlace
  info: CardInfo
  /** Carta non ancora rivelata (Deck/Extra): l'uid nasce al salvataggio del passo. */
  fresh?: boolean
}

export interface Ctx {
  state: GameState
  infoOf: (uid: Uid) => CardInfo
  mode: 'steps' | 'setup'
}

export interface Modifiers { shift?: boolean; alt?: boolean; ctrl?: boolean }

const clean = (pl: NPlace): Place => {
  const out: Place = { p: pl.p, loc: pl.loc }
  if (pl.seq !== undefined) out.seq = pl.seq
  if (pl.pos !== undefined) out.pos = pl.pos
  if (pl.host !== undefined) out.host = pl.host
  return out
}

const isField = (loc: string) => loc === 'mzone' || loc === 'emz' || loc === 'szone' || loc === 'fzone'

function move(src: Src, to: Place, why: MoveWhy): Move {
  const m: Move = { uid: src.uid, to, why }
  if (!src.fresh) m.from = clean(src.place)
  return m
}

function toPlace(d: Dest & { t: 'zone' | 'pile' }, pos?: Position, seq?: number): Place {
  const pl: Place = { p: d.p, loc: d.loc }
  if (d.t === 'zone') pl.seq = d.seq
  else if (seq !== undefined) pl.seq = seq
  if (pos) pl.pos = pos
  return pl
}

/** Dove ha senso rilasciare la carta. */
export function destinations(src: Src, ctx: Ctx): Dest[] {
  const out: Dest[] = []
  const p: PlayerIdx = src.place.p
  const { info } = src
  const here = src.place
  const add = (d: Dest) => {
    if (d.t === 'zone' && here.p === d.p && here.loc === d.loc && here.seq === d.seq) return
    out.push(d)
  }
  const monster = info.kind === 'monster'
  const st = info.kind !== 'monster'
  for (let seq = 0; seq < ZONE_COUNT.mzone; seq++) {
    if (monster && occupantAt(ctx.state, p, 'mzone', seq) === undefined) add({ t: 'zone', p, loc: 'mzone', seq })
  }
  for (let seq = 0; seq < ZONE_COUNT.emz; seq++) {
    // la EMZ è condivisa: la occupa chiunque, ma ci vanno solo mostri dell'Extra Deck
    if (monster && info.extra && occupantAt(ctx.state, 0, 'emz', seq) === undefined && occupantAt(ctx.state, 1, 'emz', seq) === undefined) {
      add({ t: 'zone', p: 0, loc: 'emz', seq })
    }
  }
  for (let seq = 0; seq < ZONE_COUNT.szone; seq++) {
    const ok = (st && !info.field) || (monster && info.pendulum && (PENDULUM_SEQS as readonly number[]).includes(seq))
    if (ok && occupantAt(ctx.state, p, 'szone', seq) === undefined) add({ t: 'zone', p, loc: 'szone', seq })
  }
  if (st && info.field && occupantAt(ctx.state, p, 'fzone', 0) === undefined) add({ t: 'zone', p, loc: 'fzone', seq: 0 })

  const pile = (loc: PileLoc) => {
    if (here.p === p && here.loc === loc) return
    out.push({ t: 'pile', p, loc })
  }
  pile('gy')
  pile('banished')
  pile('hand')
  pile('deck')
  if (info.extra || info.pendulum) pile('extra')

  // sopra un altro mostro: materiale Xyz o equipaggiamento
  for (const [uid, pl] of Object.entries(ctx.state.places)) {
    if (uid === src.uid || (pl.loc !== 'mzone' && pl.loc !== 'emz')) continue
    if (ctx.infoOf(uid).extra === 'xyz' || info.equip) out.push({ t: 'card', uid })
  }
  return out
}

const SUMMON_POS: Position = 'FACEUP_ATK'

function methodFor(info: CardInfo): SummonMethod {
  return info.extra ?? 'effect'
}

function handSeq(ctx: Ctx, p: PlayerIdx): number {
  return countAt(ctx.state, p, 'hand')
}

export function optionsFor(src: Src, dest: Dest, ctx: Ctx): Option[] {
  const from = src.place.loc
  const { info } = src
  const opts: Option[] = []
  const push = (id: string, action: ActionKind, moves: Move[], extra: Partial<StepDraft> = {}, follow?: Follow) => {
    const draft: StepDraft = { action, card: src.uid, moves, ...extra }
    if (!src.fresh) draft.from = clean(src.place)
    opts.push(follow ? { id, draft, follow } : { id, draft })
  }

  if (dest.t === 'card') {
    const host = ctx.state.places[dest.uid]
    if (!host) return []
    if (ctx.infoOf(dest.uid).extra === 'xyz') {
      const n = Object.values(ctx.state.places).filter((pl) => pl.loc === 'overlay' && pl.host === dest.uid).length
      const to: Place = { p: host.p, loc: 'overlay', seq: n, host: dest.uid }
      push('attach', 'attach', [move(src, to, 'material')], { targets: [dest.uid], to })
    }
    if (info.equip) {
      const seq = freeSeq(ctx.state, src.place.p, 'szone', [1, 2, 3, 0, 4])
      if (seq !== undefined) {
        const to: Place = { p: src.place.p, loc: 'szone', seq, pos: 'FACEUP' }
        push('equip', 'equip', [move(src, to, 'equip')], { targets: [dest.uid], to })
      }
    }
    return opts
  }

  if (dest.t === 'zone') {
    // la EMZ è condivisa (chiave p:0), ma la carta resta del suo proprietario
    const to = (pos: Position): Place => ({ ...toPlace(dest, pos), p: src.place.p })
    const sameKind = isField(from)
    if (ctx.mode === 'setup') {
      const poss: [string, Position][] =
        dest.loc === 'mzone' || dest.loc === 'emz'
          ? [['placeAtk', 'FACEUP_ATK'], ['placeDef', 'FACEUP_DEF'], ['placeSet', 'FACEDOWN_DEF']]
          : [['placeUp', 'FACEUP'], ['placeSet', 'FACEDOWN']]
      for (const [id, pos] of poss) push(id, 'custom', [move(src, to(pos), 'other')])
      return opts
    }
    if (dest.loc === 'mzone' || dest.loc === 'emz') {
      if (sameKind) {
        const pos = src.place.pos ?? SUMMON_POS
        push('moveZone', 'custom', [move(src, to(pos), 'other')], { to: to(pos), x: { kind: 'moveZone' } })
        return opts
      }
      if (from === 'hand') {
        const tribute: Option | null =
          info.level >= 5 && dest.loc === 'mzone'
            ? { id: 'tributeSummon', draft: { action: 'tributeSummon', card: src.uid, from: clean(src.place), to: to(SUMMON_POS), moves: [move(src, to(SUMMON_POS), 'summon')] }, follow: { kind: 'tribute', need: info.level >= 7 ? 2 : 1 } }
            : null
        const normal: Option = { id: 'normalSummon', draft: { action: 'normalSummon', card: src.uid, from: clean(src.place), to: to(SUMMON_POS), moves: [move(src, to(SUMMON_POS), 'summon')] } }
        if (dest.loc === 'mzone') opts.push(...(tribute ? [tribute, normal] : [normal]))
        push('specialSummon', 'specialSummon', [move(src, to(SUMMON_POS), 'summon')], { method: methodFor(info), to: to(SUMMON_POS) })
        if (dest.loc === 'mzone') push('setMonster', 'setMonster', [move(src, to('FACEDOWN_DEF'), 'set')], { to: to('FACEDOWN_DEF') })
        if (info.pendulum) push('pendulumSummon', 'specialSummon', [move(src, to(SUMMON_POS), 'summon')], { method: 'pendulum', to: to(SUMMON_POS) })
        if (info.ritual) {
          opts.splice(0, opts.length, ...opts.filter((o) => o.id !== 'specialSummon'))
          push('ritualSummon', 'specialSummon', [move(src, to(SUMMON_POS), 'summon')], { method: 'ritual', to: to(SUMMON_POS) }, { kind: 'materials', xyz: false, host: src.uid })
        }
        return opts
      }
      if (from === 'extra') {
        const follow: Follow | undefined = info.extra ? { kind: 'materials', xyz: info.extra === 'xyz', host: src.uid } : undefined
        const method: SummonMethod = info.extra ?? 'pendulum'
        const pos: Position = info.extra === 'link' ? 'FACEUP_ATK' : SUMMON_POS
        push('specialSummon', 'specialSummon', [move(src, to(pos), 'summon')], { method, to: to(pos) }, follow)
        return opts
      }
      // Cimitero / Bandite / Deck / materiale / zona Pendulum
      push('specialSummon', 'specialSummon', [move(src, to(SUMMON_POS), 'summon')], { method: methodFor(info), to: to(SUMMON_POS) })
      if (dest.loc === 'mzone') push('setMonster', 'setMonster', [move(src, to('FACEDOWN_DEF'), 'set')], { to: to('FACEDOWN_DEF') })
      return opts
    }
    // zone Magia/Trappola e Terreno
    if (sameKind) {
      const pos = src.place.pos ?? 'FACEUP'
      push('moveZone', 'custom', [move(src, to(pos), 'other')], { to: to(pos), x: { kind: 'moveZone' } })
      return opts
    }
    if (ctx.mode === 'steps') {
      push('activate', 'activate', [move(src, to('FACEUP'), 'other')], { to: to('FACEUP'), effect: { kind: 'activation' } })
      push('setSpellTrap', 'setSpellTrap', [move(src, to('FACEDOWN'), 'set')], { to: to('FACEDOWN') })
    }
    return opts
  }

  // ---- piles ----
  const owner = src.place.p
  const pileTo = (loc: PileLoc, seq?: number): Place =>
    toPlace({ t: 'pile', p: owner, loc }, undefined, seq ?? (loc === 'gy' || loc === 'banished' ? pileSeq(ctx.state, owner, loc) : undefined))
  if (ctx.mode === 'setup') {
    if (dest.loc === 'hand') push('placeHand', 'custom', [move(src, pileTo('hand', handSeq(ctx, owner)), 'other')])
    else push(`place_${dest.loc}`, 'custom', [move(src, pileTo(dest.loc), 'other')])
    return opts
  }
  switch (dest.loc) {
    case 'gy':
      push('sendToGY', 'sendToGY', [move(src, pileTo('gy'), 'send')], { to: pileTo('gy') })
      if (isField(from)) push('destroy', 'destroy', [move(src, pileTo('gy'), 'destroy')], { to: pileTo('gy') })
      if (from === 'hand') push('discard', 'discard', [move(src, pileTo('gy'), 'discard')], { to: pileTo('gy') })
      if (from === 'hand') [opts[0], opts[opts.length - 1]] = [opts[opts.length - 1]!, opts[0]!]
      break
    case 'banished':
      push('banish', 'banish', [move(src, pileTo('banished'), 'banish')], { to: pileTo('banished') })
      break
    case 'hand':
      if (from === 'deck') {
        push('search', 'search', [move(src, pileTo('hand', handSeq(ctx, owner)), 'search')], { to: pileTo('hand', handSeq(ctx, owner)), searched: [src.uid] })
        push('draw', 'draw', [move(src, pileTo('hand', handSeq(ctx, owner)), 'draw')], { to: pileTo('hand', handSeq(ctx, owner)) })
      } else {
        push('returnToHand', 'returnToHand', [move(src, pileTo('hand', handSeq(ctx, owner)), 'return')], { to: pileTo('hand', handSeq(ctx, owner)) })
      }
      break
    case 'deck': {
      const n = countAt(ctx.state, owner, 'deck')
      push('deckTop', 'returnToDeck', [move(src, pileTo('deck', 0), 'return')], { to: pileTo('deck', 0), x: { deckPos: 'top' } })
      push('deckBottom', 'returnToDeck', [move(src, pileTo('deck', n), 'return')], { to: pileTo('deck', n), x: { deckPos: 'bottom' } })
      push('deckShuffle', 'returnToDeck', [move(src, pileTo('deck'), 'shuffle')], { to: pileTo('deck'), x: { deckPos: 'shuffle' } })
      break
    }
    case 'extra':
      push('returnToExtra', 'returnToDeck', [move(src, pileTo('extra'), 'return')], { to: pileTo('extra') })
      break
  }
  return opts
}

/** Applica scorciatoie da tastiera: Shift = Speciale, Alt = Cala, Ctrl = Attiva. */
export function pickByModifier(opts: Option[], m: Modifiers): Option | null {
  const find = (ids: string[]) => opts.find((o) => ids.includes(o.id) || (ids.includes(o.draft.action) && o.id !== 'pendulumSummon'))
  if (m.shift) return find(['specialSummon', 'ritualSummon']) ?? null
  if (m.alt) return find(['setMonster', 'setSpellTrap']) ?? null
  if (m.ctrl) return find(['activate']) ?? null
  return null
}

/** Doppio clic/tocco: attiva l'effetto principale. */
export function activateOption(src: Src, ctx: Ctx): Option | null {
  const { info, place } = src
  const mk = (draft: Omit<StepDraft, 'card'>): Option => ({ id: 'activate', draft: { card: src.uid, ...draft } })
  if (ctx.mode === 'setup' || src.fresh) return null
  if (info.kind === 'monster') {
    if (place.pos === 'FACEDOWN_DEF' && isField(place.loc)) {
      const to: Place = { ...clean(place), pos: 'FACEUP_ATK' }
      return { id: 'flipSummon', draft: { action: 'flipSummon', card: src.uid, from: clean(place), to, moves: [move(src, to, 'flip')] } }
    }
    return mk({ action: 'activate', effect: { kind: 'ignition' }, moves: [] })
  }
  if (isField(place.loc)) {
    if (place.pos === 'FACEDOWN') {
      const to: Place = { ...clean(place), pos: 'FACEUP' }
      return mk({ action: 'activate', effect: { kind: 'activation' }, from: clean(place), to, moves: [move(src, to, 'flip')] })
    }
    return mk({ action: 'activate', effect: { kind: info.kind === 'trap' ? 'activation' : 'ignition' }, moves: [] })
  }
  if (place.loc === 'hand') {
    const loc: ZoneLoc = info.field ? 'fzone' : 'szone'
    const seq = loc === 'fzone' ? (occupantAt(ctx.state, place.p, 'fzone', 0) === undefined ? 0 : undefined) : freeSeq(ctx.state, place.p, 'szone', [1, 2, 3, 0, 4])
    if (seq !== undefined) {
      const to: Place = { p: place.p, loc, seq, pos: 'FACEUP' }
      return mk({ action: 'activate', effect: { kind: 'activation' }, from: clean(place), to, moves: [move(src, to, 'other')] })
    }
  }
  return mk({ action: 'activate', effect: { kind: 'ignition' }, from: clean(place), moves: [] })
}

/** Cambi di posizione/coperta per il menu contestuale. */
export function positionOptions(src: Src, ctx: Ctx): Option[] {
  const { place, info } = src
  if (ctx.mode === 'setup' || src.fresh || (place.loc !== 'mzone' && place.loc !== 'emz' && place.loc !== 'szone' && place.loc !== 'fzone')) return []
  const out: Option[] = []
  const to = (pos: Position): Place => ({ ...clean(place), pos })
  const pos = place.pos
  const pos_ = (id: string, action: ActionKind, p: Position, why: MoveWhy) =>
    out.push({ id, draft: { action, card: src.uid, from: clean(place), to: to(p), moves: [move(src, to(p), why)] } })
  if (info.kind === 'monster') {
    if (pos === 'FACEUP_ATK') pos_('posDef', 'changePosition', 'FACEUP_DEF', 'position')
    if (pos === 'FACEUP_DEF') pos_('posAtk', 'changePosition', 'FACEUP_ATK', 'position')
    if (pos === 'FACEUP_ATK' || pos === 'FACEUP_DEF') pos_('posSet', 'changePosition', 'FACEDOWN_DEF', 'set')
    if (pos === 'FACEDOWN_DEF') {
      pos_('flipSummon', 'flipSummon', 'FACEUP_ATK', 'flip')
      pos_('flipDef', 'changePosition', 'FACEUP_DEF', 'flip')
    }
  } else if (pos === 'FACEUP') pos_('posSet', 'setSpellTrap', 'FACEDOWN', 'set')
  return out
}

/** Prossimo id passo ("s12") libero in tutto il documento, rami compresi. */
export function nextStepId(ids: Iterable<string>): string {
  let max = 0
  for (const id of ids) {
    const m = /^s(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `s${max + 1}`
}

export { ownerOfUid }
