/**
 * Dati carte di PROVA per i test visivi/e2e di archetipi e mazzi (nessuna dipendenza da src/features/cards).
 * ~140 carte con tipi, livelli e attributi vari + 4 banlist. Usati solo con E2E_MOCK_CARDS=1 (vedi vite.config.ts).
 */
import type { Banlist, Card } from '@/domain/types'

export const T = { MONSTER: 1, SPELL: 2, TRAP: 4, EFFECT: 0x20, FUSION: 0x40, SYNCHRO: 0x2000, XYZ: 0x800000, LINK: 0x4000000, QUICK: 0x10000, CONT: 0x20000 }
const A = { EARTH: 1, WATER: 2, FIRE: 4, WIND: 8, LIGHT: 0x10, DARK: 0x20 }

const base = { alias: 0, race: 1, def: 0, setcodes: [] as number[], isExtra: false, tcg: true, ocg: true }

const mon = (id: number, en: string, it: string, attr: number, level: number, atk: number, extra: Partial<Card> = {}): Card => ({
  ...base, id, name: { en, it }, type: T.MONSTER | T.EFFECT, attribute: attr, level, atk, ...extra,
})
const spell = (id: number, en: string, it: string, type = T.SPELL): Card => ({ ...base, id, name: { en, it }, type, attribute: 0, level: 0, atk: 0 })
const trap = (id: number, en: string, it: string, type = T.TRAP): Card => ({ ...base, id, name: { en, it }, type, attribute: 0, level: 0, atk: 0 })

export const ID = {
  ash: 14558127,
  ashAlt: 14558128,
  calledByGrave: 24224830,
  potOfGreed: 55144522,
  raigeki: 12580477,
  nibiru: 27204311,
  maxxC: 23434538,
  imperm: 10045474,
  blueEyes: 89631139,
  darkMagician: 46986414,
  accesscode: 86066372,
  apollousa: 4280258,
  baronne: 84815190,
  utopia: 84013237,
  mirrorMon: 70000001,
  mirrorSpell: 70000002,
}

const named: Card[] = [
  mon(ID.ash, 'Ash Blossom & Joyous Spring', 'Fioritura di Cenere & Gioiosa Primavera', A.FIRE, 3, 0),
  { ...mon(ID.ashAlt, 'Ash Blossom & Joyous Spring', 'Fioritura di Cenere & Gioiosa Primavera', A.FIRE, 3, 0), alias: ID.ash },
  trap(ID.calledByGrave, 'Called by the Grave', 'Chiamato dalla Tomba', T.SPELL | T.QUICK),
  spell(ID.potOfGreed, 'Pot of Greed', "Pentola dell'Avidità"),
  spell(ID.raigeki, 'Raigeki', 'Raigeki'),
  mon(ID.nibiru, 'Nibiru, the Primal Being', 'Nibiru, l\'Essere Primordiale', A.LIGHT, 11, 3000),
  mon(ID.maxxC, 'Maxx "C"', 'Maxx "C"', A.EARTH, 2, 500),
  trap(ID.imperm, 'Infinite Impermanence', 'Impermanenza Infinita'),
  mon(ID.blueEyes, 'Blue-Eyes White Dragon', 'Drago Bianco Occhi Blu', A.LIGHT, 8, 3000),
  mon(ID.darkMagician, 'Dark Magician', 'Mago Nero', A.DARK, 7, 2500),
  mon(ID.accesscode, 'Accesscode Talker', 'Accesscode Talker', A.DARK, 4, 2300, { type: T.MONSTER | T.LINK | T.EFFECT, isExtra: true }),
  mon(ID.apollousa, 'Apollousa, Bow of the Goddess', 'Apollousa, Arco della Dea', A.LIGHT, 4, 3000, { type: T.MONSTER | T.LINK | T.EFFECT, isExtra: true }),
  mon(ID.baronne, 'Baronne de Fleur', 'Baronne de Fleur', A.WIND, 10, 3000, { type: T.MONSTER | T.SYNCHRO | T.EFFECT, isExtra: true }),
  mon(ID.utopia, 'Number 39: Utopia', 'Numero 39: Utopia', A.LIGHT, 4, 2500, { type: T.MONSTER | T.XYZ | T.EFFECT, isExtra: true }),
  // stesso nome, carte diverse: serve per la disambiguazione dell'import
  mon(ID.mirrorMon, 'Mirror Sprite', 'Spirito Specchio', A.WATER, 3, 800),
  spell(ID.mirrorSpell, 'Mirror Sprite', 'Spirito Specchio', T.SPELL | T.CONT),
  spell(70000003, 'Mystical Space Typhoon', 'Tifone Spaziale Mistico', T.SPELL | T.QUICK),
  spell(70000004, 'Pot of Prosperity', 'Pentola della Prosperità'),
  trap(70000005, 'Solemn Judgment', 'Giudizio Solenne', T.TRAP | T.CONT),
  mon(70000006, 'Fusion Dragon Alpha', 'Drago Fusione Alfa', A.DARK, 8, 2800, { type: T.MONSTER | T.FUSION, isExtra: true }),
  mon(70000007, 'Synchro Knight Beta', 'Cavaliere Synchro Beta', A.LIGHT, 7, 2600, { type: T.MONSTER | T.SYNCHRO, isExtra: true }),
  mon(70000008, 'Xyz Leviathan', 'Leviatano Xyz', A.WATER, 4, 2400, { type: T.MONSTER | T.XYZ, isExtra: true }),
  mon(70000009, 'Link Guardian', 'Guardiano Link', A.EARTH, 2, 1600, { type: T.MONSTER | T.LINK, isExtra: true }),
]

const WORDS_EN = ['Lunar', 'Ember', 'Tidal', 'Gale', 'Radiant', 'Shadow', 'Stone', 'Frost']
const WORDS_IT = ['Lunare', 'Brace', 'Marea', 'Raffica', 'Radiante', 'Ombra', 'Roccia', 'Gelo']
const ATTRS = [A.EARTH, A.WATER, A.FIRE, A.WIND, A.LIGHT, A.DARK]
const KINDS_EN = ['Sentinel', 'Drake', 'Oracle', 'Warden']
const KINDS_IT = ['Sentinella', 'Draghetto', 'Oracolo', 'Custode']

/** 100 mostri e 12 magie/trappole di riempimento, deterministici (id 80000000+). */
const fillers: Card[] = [
  ...Array.from({ length: 100 }, (_, i) =>
    mon(80000000 + i, `${WORDS_EN[i % 8]} ${KINDS_EN[(i >> 3) % 4]} ${i}`, `${KINDS_IT[(i >> 3) % 4]} ${WORDS_IT[i % 8]} ${i}`, ATTRS[i % 6]!, 1 + (i % 8), 500 + (i % 10) * 200),
  ),
  ...Array.from({ length: 6 }, (_, i) => spell(81000000 + i, `Rite of ${WORDS_EN[i]} ${i}`, `Rito della ${WORDS_IT[i]} ${i}`)),
  ...Array.from({ length: 6 }, (_, i) => trap(82000000 + i, `Snare of ${WORDS_EN[i]} ${i}`, `Trappola della ${WORDS_IT[i]} ${i}`)),
]

export const MOCK_CARDS: Card[] = [...named, ...fillers]

/** Passcode di riempimento (mostri non-Extra) per costruire mazzi di prova. */
export const fillerIds = (n: number, from = 0): number[] => Array.from({ length: n }, (_, i) => 80000000 + ((from + i) % 100))

const bl = (format: Banlist['format'], id: string, limits: Record<number, 0 | 1 | 2>): Banlist => ({ format, id, limits })

export const MOCK_BANLISTS: Banlist[] = [
  bl('TCG', '2026.09', { [ID.potOfGreed]: 0, [ID.raigeki]: 1, [ID.ash]: 2, [ID.nibiru]: 2 }),
  bl('TCG', '2026.10', { [ID.potOfGreed]: 0, [ID.raigeki]: 1, [ID.ash]: 2, [ID.nibiru]: 1, [ID.calledByGrave]: 1, [ID.maxxC]: 1 }),
  bl('OCG', '2026.10', { [ID.potOfGreed]: 0, [ID.raigeki]: 0, [ID.ash]: 1 }),
  { format: 'GENESYS', id: '147.89', limits: {}, points: { [ID.blueEyes]: 10, [ID.darkMagician]: 5 } },
]


