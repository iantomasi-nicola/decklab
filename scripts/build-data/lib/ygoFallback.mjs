// Deriva i campi "tipo cards.cdb" da una carta YGOPRODeck quando nessun .cdb di BabelCDB la contiene
// (tipicamente carte OCG appena annunciate). Approssimato: nessun setcode, nessun bit "special summon".
import { TYPE } from './cdb.mjs'

const RACE = {
  Warrior: 0x1, Spellcaster: 0x2, Fairy: 0x4, Fiend: 0x8, Zombie: 0x10, Machine: 0x20, Aqua: 0x40, Pyro: 0x80,
  Rock: 0x100, 'Winged Beast': 0x200, Plant: 0x400, Insect: 0x800, Thunder: 0x1000, Dragon: 0x2000, Beast: 0x4000,
  'Beast-Warrior': 0x8000, Dinosaur: 0x10000, Fish: 0x20000, 'Sea Serpent': 0x40000, Reptile: 0x80000,
  Psychic: 0x100000, 'Divine-Beast': 0x200000, 'Creator-God': 0x400000, Wyrm: 0x800000, Cyberse: 0x1000000,
  Illusion: 0x2000000,
}
const ATTR = { EARTH: 1, WATER: 2, FIRE: 4, WIND: 8, LIGHT: 0x10, DARK: 0x20, DIVINE: 0x40 }
const WORD = {
  Normal: TYPE.NORMAL, Effect: TYPE.EFFECT, Fusion: TYPE.FUSION, Ritual: TYPE.RITUAL, Spirit: TYPE.SPIRIT,
  Union: TYPE.UNION, Gemini: TYPE.GEMINI, Tuner: TYPE.TUNER, Synchro: TYPE.SYNCHRO, Token: TYPE.TOKEN,
  Flip: TYPE.FLIP, Toon: TYPE.TOON, Xyz: TYPE.XYZ, Pendulum: TYPE.PENDULUM, Link: TYPE.LINK,
}
const SPELL_RACE = { Normal: 0, 'Quick-Play': TYPE.QUICKPLAY, Continuous: TYPE.CONTINUOUS, Equip: TYPE.EQUIP, Field: TYPE.FIELD, Ritual: TYPE.RITUAL }
const TRAP_RACE = { Normal: 0, Continuous: TYPE.CONTINUOUS, Counter: TYPE.COUNTER }
const MARKERS = { 'Bottom-Left': 1, Bottom: 2, 'Bottom-Right': 4, Left: 8, Right: 32, 'Top-Left': 64, Top: 128, 'Top-Right': 256 }

export function deriveFromYgo(c) {
  let type = 0
  let race = 0
  let attribute = 0
  if (c.type === 'Spell Card') { type = TYPE.SPELL | (SPELL_RACE[c.race] ?? 0) }
  else if (c.type === 'Trap Card') { type = TYPE.TRAP | (TRAP_RACE[c.race] ?? 0) }
  else {
    type = TYPE.MONSTER
    for (const w of c.typeline ?? []) {
      if (RACE[w] !== undefined) race = RACE[w]
      else if (WORD[w] !== undefined) type |= WORD[w]
    }
    attribute = ATTR[c.attribute] ?? 0
  }
  const link = type & TYPE.LINK
  const m = c.misc_info?.[0] ?? {}
  return {
    type,
    race,
    attribute,
    level: link ? (c.linkval ?? 0) : (c.level ?? 0),
    atk: m.question_atk ? -2 : (c.atk ?? 0),
    def: link ? (c.linkmarkers ?? []).reduce((a, k) => a | (MARKERS[k] ?? 0), 0) : m.question_def ? -2 : (c.def ?? 0),
    scale: type & TYPE.PENDULUM ? c.scale : undefined,
  }
}
