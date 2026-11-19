// Lettura di un .cdb (SQLite) di BabelCDB con node:sqlite (solo build, mai nel bundle client).
import { DatabaseSync } from 'node:sqlite'

export const TYPE = {
  MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, NORMAL: 0x10, EFFECT: 0x20, FUSION: 0x40, RITUAL: 0x80,
  SPIRIT: 0x200, UNION: 0x400, GEMINI: 0x800, TUNER: 0x1000, SYNCHRO: 0x2000, TOKEN: 0x4000,
  QUICKPLAY: 0x10000, CONTINUOUS: 0x20000, EQUIP: 0x40000, FIELD: 0x80000, COUNTER: 0x100000,
  FLIP: 0x200000, TOON: 0x400000, XYZ: 0x800000, PENDULUM: 0x1000000, LINK: 0x4000000,
}
export const EXTRA_MASK = TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK

/**
 * Restituisce Map<id, riga>. `setcode` è un intero a 64 bit = 4 setcode da 16 bit: li spezziamo in SQL
 * (node:sqlite non rappresenta interi > 2^53 come Number) e scartiamo gli zeri.
 */
export function readCdb(path) {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    const rows = db
      .prepare(
        `SELECT d.id, d.ot, d.alias, d.type, d.atk, d.def, d.level, d.race, d.attribute,
                (d.setcode & 65535) AS s0, ((d.setcode >> 16) & 65535) AS s1,
                ((d.setcode >> 32) & 65535) AS s2, ((d.setcode >> 48) & 65535) AS s3,
                t.name AS name
           FROM datas d LEFT JOIN texts t ON t.id = d.id`,
      )
      .all()
    const out = new Map()
    for (const r of rows) {
      out.set(r.id, {
        id: r.id,
        ot: r.ot,
        alias: r.alias,
        type: r.type,
        atk: r.atk,
        def: r.def,
        // Pendulum: level = livello | (scala dx << 16) | (scala sx << 24)
        level: r.level & 0xffff,
        scale: r.type & TYPE.PENDULUM ? (r.level >>> 24) & 0xff : undefined,
        race: r.race,
        attribute: r.attribute,
        setcodes: [r.s0, r.s1, r.s2, r.s3].filter((s) => s !== 0),
        name: r.name ?? '',
      })
    }
    return out
  } finally {
    db.close()
  }
}
