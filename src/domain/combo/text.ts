/** Export testuale delle combo (docs/COMBO_FORMAT.md §15): numerato leggibile e compatto per Discord. Puro: i nomi arrivano da `nameOf`. */
import type { Lang, Localized } from '../types'
import { deriveEndboard, allStates } from './state'
import type { ActionKind, Board, ComboDoc, Place, Step, SummonMethod, Uid } from './types'

export type NameOf = (code: number, lang: Lang) => string

export interface TextOptions {
  lang: Lang
  nameOf: NameOf
  /** Testo del badge di legalità già localizzato (calcolato dalla UI), es. "✔ legale". Facoltativo. */
  legality?: string
}
export interface CompactOptions extends TextOptions {
  /** 'inline' (default, come l'esempio §15): tutti i passi sulla stessa riga; 'lines': una riga per passo. */
  layout?: 'inline' | 'lines'
}

interface Dict {
  hand: string; random: string; first: string; second: string; endboard: string; opponent: string
  freeOrder: string; ifOpp: string; effect: string; onActivation: string; onResolution: string; rejoin: string; none: string
  search: string; targets: string; costs: string; materials: string; discard: string
  zone: { mzone: string; emz: string; szone: string; fzone: string; overlay: string; emzSides: [string, string] }
  actions: Partial<Record<ActionKind, string>>
  methods: Partial<Record<SummonMethod, string>>
  abbr: Partial<Record<ActionKind, string>>
  methodAbbr: Partial<Record<SummonMethod, string>>
  activateEffect: (n: number, card: string) => string
  activate: (card: string) => string
  lp: (p: 0 | 1, d: number) => string
}

const IT: Dict = {
  hand: 'Mano', random: 'casuali', first: 'Giochi per primo', second: 'Giochi per secondo', endboard: 'Board finale', opponent: 'Avversario',
  freeOrder: 'ordine libero', ifOpp: "Se l'avversario usa", effect: 'effetto', onActivation: "in risposta all'attivazione", onResolution: 'alla risoluzione',
  rejoin: 'si rientra al passo', none: 'nessuna carta', search: 'cerca', targets: 'bersagli', costs: 'costo', materials: 'materiali', discard: 'scarta',
  zone: { mzone: 'Zona Mostro', emz: 'Extra Monster Zone', szone: 'Zona Magia/Trappola', fzone: 'Zona Terreno', overlay: 'materiale Xyz', emzSides: ['sinistra', 'destra'] },
  actions: {
    normalSummon: 'Evoca Normalmente', tributeSummon: 'Evoca Normalmente con Tributo', setMonster: 'Setta il mostro', flipSummon: 'Evoca a Capovolgimento', specialSummon: 'Evoca Specialmente',
    setSpellTrap: 'Setta', chainActivate: 'Rispondi attivando', search: 'Cerca', draw: 'Pesca', discard: 'Scarta', sendToGY: 'Manda al Cimitero', banish: 'Bandisci',
    returnToHand: 'Rimetti in mano', returnToDeck: 'Rimetti nel Deck', destroy: 'Distruggi', detach: 'Stacca un materiale da', shuffle: 'Mescola', changePosition: 'Cambia posizione a',
    equip: 'Equipaggia', attach: 'Attacca come materiale', placeCounter: 'Piazza un segnalino su', changeLP: 'Variazione LP', attack: 'Attacca con', enterPhase: 'Passa alla fase', endTurn: 'Termina il turno',
    resolve: 'Risolvi', declare: 'Dichiara', choice: 'Scegli',
  },
  methods: { fusion: 'Fusione', synchro: 'Synchro', xyz: 'Xyz', link: 'Link', ritual: 'Rituale', pendulum: 'Pendulum', effect: 'da effetto', procedure: 'da procedura' },
  abbr: {
    normalSummon: 'NS', tributeSummon: 'NS-T', setMonster: 'Set', flipSummon: 'Flip', specialSummon: 'SS', setSpellTrap: 'Set', chainActivate: 'Ris.', search: 'Cerca', draw: 'Pesca', discard: 'Scarta',
    sendToGY: 'Cim.', banish: 'Band.', returnToHand: '→Mano', returnToDeck: '→Deck', destroy: 'Dist.', detach: 'Stacca', shuffle: 'Mesc.', changePosition: 'Pos.', equip: 'Equip.', attach: 'Attach',
    placeCounter: 'Segn.', changeLP: 'LP', attack: 'Att.', enterPhase: 'Fase', endTurn: 'Fine turno', resolve: 'Ris.', declare: 'Dich.', choice: 'Scelta',
  },
  methodAbbr: { fusion: 'Fus', synchro: 'Sync', xyz: 'Xyz', link: 'Link', ritual: 'Rit', pendulum: 'Pend' },
  activateEffect: (n, c) => `Attiva l'effetto ${n} di ${c}`,
  activate: (c) => `Attiva ${c}`,
  lp: (p, d) => `LP ${p === 0 ? 'tuoi' : 'avversario'} ${d > 0 ? '+' : ''}${d}`,
}
const EN: Dict = {
  hand: 'Hand', random: 'random', first: 'Going first', second: 'Going second', endboard: 'End board', opponent: 'Opponent',
  freeOrder: 'any order', ifOpp: 'If the opponent uses', effect: 'effect', onActivation: 'in response to the activation', onResolution: 'on resolution',
  rejoin: 'rejoin at step', none: 'no cards', search: 'search', targets: 'targets', costs: 'cost', materials: 'materials', discard: 'discard',
  zone: { mzone: 'Monster Zone', emz: 'Extra Monster Zone', szone: 'Spell/Trap Zone', fzone: 'Field Zone', overlay: 'Xyz material', emzSides: ['left', 'right'] },
  actions: {
    normalSummon: 'Normal Summon', tributeSummon: 'Tribute Summon', setMonster: 'Set', flipSummon: 'Flip Summon', specialSummon: 'Special Summon',
    setSpellTrap: 'Set', chainActivate: 'Chain', search: 'Search', draw: 'Draw', discard: 'Discard', sendToGY: 'Send to the GY', banish: 'Banish',
    returnToHand: 'Return to the hand', returnToDeck: 'Return to the Deck', destroy: 'Destroy', detach: 'Detach a material from', shuffle: 'Shuffle', changePosition: 'Change the position of',
    equip: 'Equip', attach: 'Attach as material', placeCounter: 'Place a counter on', changeLP: 'LP change', attack: 'Attack with', enterPhase: 'Enter the phase', endTurn: 'End the turn',
    resolve: 'Resolve', declare: 'Declare', choice: 'Choose',
  },
  methods: { fusion: 'Fusion', synchro: 'Synchro', xyz: 'Xyz', link: 'Link', ritual: 'Ritual', pendulum: 'Pendulum', effect: 'by effect', procedure: 'by procedure' },
  abbr: {
    normalSummon: 'NS', tributeSummon: 'TS', setMonster: 'Set', flipSummon: 'Flip', specialSummon: 'SS', setSpellTrap: 'Set', chainActivate: 'Chain', search: 'Search', draw: 'Draw', discard: 'Disc.',
    sendToGY: 'GY', banish: 'Ban.', returnToHand: '→Hand', returnToDeck: '→Deck', destroy: 'Dest.', detach: 'Detach', shuffle: 'Shuf.', changePosition: 'Pos.', equip: 'Equip', attach: 'Attach',
    placeCounter: 'Ctr.', changeLP: 'LP', attack: 'Atk', enterPhase: 'Phase', endTurn: 'End', resolve: 'Res.', declare: 'Decl.', choice: 'Choice',
  },
  methodAbbr: { fusion: 'Fus', synchro: 'Sync', xyz: 'Xyz', link: 'Link', ritual: 'Rit', pendulum: 'Pend' },
  activateEffect: (n, c) => `Activate effect ${n} of ${c}`,
  activate: (c) => `Activate ${c}`,
  lp: (p, d) => `${p === 0 ? 'Your' : "Opponent's"} LP ${d > 0 ? '+' : ''}${d}`,
}
const DICT: Record<Lang, Dict> = { it: IT, en: EN }

const loc = (t: Localized | undefined, lang: Lang): string | undefined => t?.[lang] ?? t?.[lang === 'it' ? 'en' : 'it']

class Ctx {
  d: Dict
  constructor(public doc: ComboDoc, public o: TextOptions) { this.d = DICT[o.lang] }
  name(uid: Uid): string {
    const code = this.doc.cards[uid]
    return code === undefined ? uid : this.o.nameOf(code, this.o.lang)
  }
  code(code: number): string { return this.o.nameOf(code, this.o.lang) }
  names(uids: Uid[]): string { return uids.map((u) => this.name(u)).join(', ') }
  title(): string {
    const m = this.doc.meta
    const t = loc(m.title, this.o.lang) ?? m.id
    const arch = loc(m.archetype.name, this.o.lang)
    const variant = m.variant ? loc(m.variant.name, this.o.lang) : undefined
    return [t, [arch, variant].filter(Boolean).join(' / ')].filter(Boolean).join(' — ')
  }
  zone(pl: Place): string {
    const z = this.d.zone
    switch (pl.loc) {
      case 'mzone': return `${z.mzone} ${(pl.seq ?? 0) + 1}`
      case 'szone': return `${z.szone} ${(pl.seq ?? 0) + 1}`
      case 'emz': return `${z.emz} ${z.emzSides[pl.seq === 1 ? 1 : 0]}`
      case 'fzone': return z.fzone
      default: return pl.loc
    }
  }
  /** Parti descrittive di un passo (cerca, costi, materiali, bersagli, LP). */
  details(s: Step): string[] {
    const d = this.d
    const out: string[] = []
    if (s.searched?.length) out.push(`${d.search} ${this.names(s.searched)}`)
    const mats = s.moves.filter((m) => m.why === 'material' || m.why === 'tribute').map((m) => m.uid)
    if (mats.length) out.push(`${d.materials} ${this.names(mats)}`)
    s.costs?.forEach((c) => c.cards.length && out.push(`${d.costs} ${c.kind} ${this.names(c.cards)}`))
    if (s.targets?.length) out.push(`${d.targets} ${this.names(s.targets)}`)
    s.lp?.forEach((l) => out.push(d.lp(l.p, l.delta)))
    return out
  }
  stepText(s: Step): string {
    const d = this.d
    const card = s.card ? this.name(s.card) : ''
    let base: string
    if (s.action === 'activate') {
      base = s.effect?.index ? d.activateEffect(s.effect.index, card) : d.activate(card)
    } else if (s.action === 'custom') {
      base = [s.label, card].filter(Boolean).join(' ')
    } else {
      base = [d.actions[s.action] ?? s.action, card].filter(Boolean).join(' ')
      if (s.action === 'specialSummon' && s.method && d.methods[s.method]) base += ` (${d.methods[s.method]})`
      if (s.action === 'enterPhase' && s.phase) base = `${d.actions.enterPhase} ${s.phase}`
    }
    const det = this.details(s)
    let line = base + (det.length ? `: ${det.join('; ')}` : '') + '.'
    const note = loc(s.note, this.o.lang)
    if (note && note.replace(/\.$/, '') !== base) line += ` ${note}`
    return line
  }
  boardLine(b: Board | undefined): string {
    const items = (b?.places ?? []).filter((bp) => bp.place.loc !== 'overlay')
    const ov = (b?.places ?? []).filter((bp) => bp.place.loc === 'overlay').length
    if (!items.length) return this.d.none
    const s = items.map((bp) => `${this.name(bp.uid)} (${this.zone(bp.place)})`).join(', ')
    return ov ? `${s} + ${ov} ${this.d.zone.overlay}` : s
  }
  endboard(): { own: Board; opponent?: Board } {
    const eb = this.doc.endboard
    if (eb) return eb
    const all = allStates(this.doc)
    return deriveEndboard(all.main[all.main.length - 1]!)
  }
  oppRef(b: ComboDoc['branches'][number]): string {
    const o = b.condition.opponent
    return this.code(o.code) + (o.effect ? ` (${this.d.effect} ${o.effect})` : '')
  }
}

/** Export numerato e leggibile (§15). */
export function exportText(doc: ComboDoc, o: TextOptions): string {
  const c = new Ctx(doc, o)
  const d = c.d
  const m = doc.meta
  const head = `${c.title()} — ${m.rules}, banlist ${m.banlist.id}${o.legality ? ` ${o.legality}` : ''}`
  const req = c.names(doc.setup.hand.required)
  const extra = doc.setup.hand.fill === 'random' ? doc.setup.hand.size - doc.setup.hand.required.length : 0
  const hand = `${d.hand}: ${[req, extra > 0 ? `${extra} ${d.random}` : ''].filter(Boolean).join(' + ')} · ${doc.setup.first ? d.first : d.second}`
  const lines = [head, hand]
  const byAfter = new Map<string, ComboDoc['branches']>()
  doc.branches.forEach((b) => byAfter.set(b.condition.afterStep, [...(byAfter.get(b.condition.afterStep) ?? []), b]))
  const num = new Map(doc.steps.map((s, i) => [s.id, i + 1]))
  doc.steps.forEach((s, i) => {
    lines.push(`${i + 1}. ${c.stepText(s)}${s.group ? ` (${d.freeOrder})` : ''}`)
    for (const b of byAfter.get(s.id) ?? []) {
      const when = b.condition.window === 'activation' ? d.onActivation : d.onResolution
      const title = loc(b.title, o.lang)
      const note = loc(b.note, o.lang)
      const rejoin = b.rejoin ? `${d.rejoin} ${num.get(b.rejoin) ?? b.rejoin}` : ''
      lines.push(`   ↳ ${d.ifOpp} ${c.oppRef(b)} ${when}${title ? `: ${title}` : ''}${note ? `. ${note}` : ''}${rejoin ? ` → ${rejoin}` : ''}`)
      b.steps.forEach((bs, j) => lines.push(`      ${String.fromCharCode(97 + (j % 26))}. ${c.stepText(bs)}`))
    }
  })
  const eb = c.endboard()
  lines.push(`${d.endboard}: ${c.boardLine(eb.own)}`)
  if (eb.opponent?.places.length) lines.push(`${d.opponent}: ${c.boardLine(eb.opponent)}`)
  return lines.join('\n')
}

function compactStep(c: Ctx, s: Step): string {
  const d = c.d
  const card = s.card ? c.name(s.card) : ''
  if (s.action === 'activate') {
    const eff = s.effect?.index ? `Eff.${s.effect.index}` : 'Eff.'
    const det = c.details(s)
    return [`${eff} ${card}`, det.length ? `→ ${det.join('; ')}` : ''].filter(Boolean).join(' ')
  }
  if (s.action === 'custom') return [s.label, card].filter(Boolean).join(' ')
  let a = d.abbr[s.action] ?? s.action
  if (s.action === 'specialSummon' && s.method && d.methodAbbr[s.method]) a = `${a} ${d.methodAbbr[s.method]}`
  const det = c.details(s)
  return [a, card, det.length ? `→ ${det.join('; ')}` : ''].filter(Boolean).join(' ')
}

/** Export compatto per Discord (§15): abbreviazioni fisse per lingua. */
export function exportCompact(doc: ComboDoc, o: CompactOptions): string {
  const c = new Ctx(doc, o)
  const d = c.d
  const m = doc.meta
  const title = loc(m.title, o.lang) ?? m.id
  const hand = [c.names(doc.setup.hand.required)].filter(Boolean).join(', ')
  const head = `**${title}** (${m.rules} ${m.banlist.id}) | ${d.hand}: ${hand}`
  const byAfter = new Map<string, string[]>()
  for (const b of doc.branches) {
    const t = loc(b.title, o.lang)
    const tag = `[${c.code(b.condition.opponent.code)}→${t ?? b.steps.map((s) => compactStep(c, s)).join(', ')}]`
    byAfter.set(b.condition.afterStep, [...(byAfter.get(b.condition.afterStep) ?? []), tag])
  }
  const steps = doc.steps.map((s, i) => [`${i + 1}) ${compactStep(c, s)}`, ...(byAfter.get(s.id) ?? [])].join(' '))
  const body = o.layout === 'lines' ? steps.join('\n') : steps.join('  ')
  const eb = c.endboard()
  const end = `${d.endboard}: ${eb.own.places.filter((p) => p.place.loc !== 'overlay').map((p) => c.name(p.uid)).join(', ') || d.none}`
  return `${head}\n${body}\n${end}`
}

