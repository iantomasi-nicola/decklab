/**
 * Schema zod del formato combolab.combo v1 (struttura; le regole V2–V9 stanno in validate.ts).
 * Oggetti "loose": i campi sconosciuti sono ammessi (e preservati da readCombo).
 * NB: nessun import relativo a runtime, così scripts/gen-combo-schema.mjs lo carica direttamente con node.
 */
import { z } from 'zod'

export const SUPPORTED_VERSION = 1

const obj = <T extends z.ZodRawShape>(shape: T) => z.looseObject(shape)

const loc = z.enum(['deck', 'hand', 'extra', 'gy', 'banished', 'mzone', 'emz', 'szone', 'fzone', 'overlay'])
const position = z.enum(['FACEUP_ATK', 'FACEUP_DEF', 'FACEDOWN_DEF', 'FACEUP', 'FACEDOWN'])
const player = z.union([z.literal(0), z.literal(1)])
const uid = z.string().min(1)
const localized = obj({ it: z.string().optional(), en: z.string().optional() })

const place = obj({
  p: player.optional(),
  loc,
  seq: z.number().int().min(0).optional(),
  pos: position.optional(),
  host: uid.optional(),
})

const board = obj({
  lp: z.number(),
  places: z.array(obj({ uid, place })),
  counters: z.record(uid, z.record(z.string(), z.number())).optional(),
})

const actionKind = z.enum([
  'normalSummon', 'tributeSummon', 'setMonster', 'flipSummon', 'specialSummon',
  'activate', 'setSpellTrap', 'chainActivate',
  'search', 'draw', 'discard', 'sendToGY', 'banish', 'returnToHand', 'returnToDeck', 'destroy', 'detach', 'shuffle',
  'changePosition', 'equip', 'attach', 'placeCounter', 'changeLP',
  'attack', 'enterPhase', 'endTurn',
  'resolve', 'declare', 'choice', 'custom',
])
const summonMethod = z.enum(['fusion', 'synchro', 'xyz', 'link', 'ritual', 'pendulum', 'effect', 'procedure', 'other'])
const moveWhy = z.enum([
  'summon', 'tribute', 'material', 'cost', 'search', 'draw', 'discard', 'destroy', 'send',
  'banish', 'return', 'set', 'flip', 'position', 'equip', 'shuffle', 'other',
])
const effectKind = z.enum(['activation', 'ignition', 'trigger', 'quick', 'continuous', 'summon-proc', 'other'])

const move = obj({ uid, from: place.optional(), to: place, why: moveWhy.optional() })

const step = obj({
  id: z.string().min(1),
  action: actionKind,
  method: summonMethod.optional(),
  label: z.string().optional(),
  card: uid.optional(),
  effect: obj({ kind: effectKind, index: z.number().int().min(1).optional() }).optional(),
  from: place.optional(),
  to: place.optional(),
  targets: z.array(uid).optional(),
  costs: z.array(obj({ kind: z.string(), cards: z.array(uid) })).optional(),
  searched: z.array(uid).optional(),
  moves: z.array(move),
  lp: z.array(obj({ p: player, delta: z.number() })).optional(),
  counters: z.array(obj({ uid, type: z.string(), delta: z.number() })).optional(),
  chain: obj({ id: z.string(), link: z.number().int() }).optional(),
  ref: z.string().optional(),
  group: z.string().optional(),
  phase: z.enum(['draw', 'standby', 'main1', 'battle', 'main2', 'end']).optional(),
  note: localized.optional(),
  optional: z.boolean().optional(),
  x: z.record(z.string(), z.unknown()).optional(),
})

const endboard = obj({ own: board, opponent: board.optional(), summary: localized.optional(), hash: z.string().optional() })

const interrupt = obj({
  uid,
  mode: z.enum(['ask', 'auto-first', 'auto-selected', 'never']),
  when: z.array(obj({ card: z.number().int() })).optional(),
  target: z.enum(['manual', 'priority']),
  priority: z.array(z.number().int()).optional(),
})

const branch = obj({
  id: z.string().min(1),
  title: localized.optional(),
  condition: obj({
    afterStep: z.string(),
    window: z.enum(['activation', 'resolution']),
    opponent: obj({ code: z.number().int(), effect: z.number().int().optional() }),
  }),
  steps: z.array(step),
  rejoin: z.string().nullable(),
  endboard: endboard.nullable().optional(),
  note: localized.optional(),
})

const named = obj({ id: z.string().optional(), name: localized })

export const comboSchema = obj({
  format: z.literal('combolab.combo'),
  v: z.literal(SUPPORTED_VERSION),
  meta: obj({
    id: z.string().min(1),
    title: localized,
    scope: z.enum(['variant', 'archetype']),
    archetype: named,
    variant: named.nullable(),
    rules: z.enum(['TCG', 'OCG']),
    banlist: obj({ format: z.string(), id: z.string() }),
    tags: z.array(z.string()),
    noteLang: z.array(z.string()),
    favorite: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    author: z.string().optional(),
    source: z.enum(['manual', 'engine', 'import']),
    derivedFrom: z.object({ comboId: z.string(), afterStep: z.string().nullable(), title: z.record(z.string(), z.string()).optional() }).optional(),
  }),
  deck: obj({
    main: z.array(z.number().int()),
    extra: z.array(z.number().int()),
    side: z.array(z.number().int()),
    ydke: z.string().optional(),
  }),
  cards: z.record(uid, z.number().int()),
  setup: obj({
    first: z.boolean(),
    hand: obj({ required: z.array(uid), size: z.number().int().min(0), fill: z.enum(['random', 'none']) }),
    own: board.optional(),
    opponent: obj({ board: board.optional(), interrupts: z.array(interrupt).optional() }).optional(),
  }),
  steps: z.array(step),
  branches: z.array(branch),
  endboard: endboard.optional(),
  engine: obj({
    core: z.string(),
    scriptsCommit: z.string(),
    cdbVersion: z.string(),
    mode: z.string(),
    seed: z.array(z.number()),
    responses: z.array(z.string()),
  }).optional(),
  x: z.record(z.string(), z.unknown()).optional(),
})
