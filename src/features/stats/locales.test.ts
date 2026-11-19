import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { statsLocales } from './locales'

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flat(v, `${p}${k}.`)))
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')

describe('statsLab i18n', () => {
  const it_ = flat(statsLocales.it as unknown as Tree)
  const en_ = flat(statsLocales.en as unknown as Tree)
  it('stesse chiavi (per concetto) in it e en, nessun valore vuoto', () => {
    expect(new Set(it_.map(base))).toEqual(new Set(en_.map(base)))
    expect(it_.filter((k) => !en_.includes(k) && !/_(zero|one|two|few|many|other)$/.test(k))).toEqual([])
  })
  it('ogni chiave usata nei sorgenti esiste', () => {
    const have = new Set([...it_, ...it_.map(base)])
    const dir = __dirname
    const used = new Set<string>()
    const walk = (d: string) => {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        if (f.isDirectory()) walk(join(d, f.name))
        else if (/\.tsx?$/.test(f.name) && !f.name.endsWith('.test.ts') && f.name !== 'locales.ts') {
          const src = readFileSync(join(d, f.name), 'utf8')
          for (const m of src.matchAll(/['`]statsLab\.([A-Za-z0-9_.]+)['`]/g)) used.add(m[1]!)
        }
      }
    }
    walk(dir)
    const missing = [...used].filter((k) => !have.has(k))
    expect(missing).toEqual([])
  })
})
