import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sideLocales } from './locales'

type Tree = { [k: string]: string | Tree }
const flat = (o: Tree, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : flat(v, `${p}${k}.`)))
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')
const get = (t: Tree, key: string) => key.split('.').reduce<string | Tree>((a, p) => (a as Tree)[p] as string | Tree, t) as string
const ph = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort().join(',')

describe('side i18n', () => {
  const it_ = flat(sideLocales.it as unknown as Tree)
  const en_ = flat(sideLocales.en as unknown as Tree)
  it('stesse chiavi in it e en, stessi segnaposto, nessun valore vuoto', () => {
    expect(new Set(it_.map(base))).toEqual(new Set(en_.map(base)))
    for (const k of it_.filter((k) => en_.includes(k))) {
      expect(ph(get(sideLocales.it as unknown as Tree, k)), k).toBe(ph(get(sideLocales.en as unknown as Tree, k)))
      expect(get(sideLocales.en as unknown as Tree, k).trim(), k).not.toBe('')
    }
  })
  it('ogni chiave side.* usata nei sorgenti esiste', () => {
    const have = new Set([...it_, ...it_.map(base)])
    const used = new Set<string>()
    for (const f of readdirSync(__dirname)) {
      if (!/\.tsx?$/.test(f) || f.endsWith('.test.ts') || f === 'locales.ts') continue
      const src = readFileSync(join(__dirname, f), 'utf8')
      for (const m of src.matchAll(/['`]side\.([A-Za-z0-9_.]+)['`]/g)) used.add(m[1]!)
    }
    // chiavi composte (side.lane.${kind}, side.turn.${...}) sono verificate per prefisso
    const missing = [...used].filter((k) => !k.includes('$') && !have.has(k))
    expect(missing).toEqual([])
  })
})
