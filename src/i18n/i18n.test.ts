import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import itJson from './it.json'
import enJson from './en.json'
import { localized } from './index'

type Tree = { [k: string]: string | Tree }

function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatten(v, `${prefix}${k}.`),
  )
}

/** Normalizza i suffissi plurali (_one/_other/...) per confrontare le lingue sul concetto, non sulle forme. */
const base = (k: string) => k.replace(/_(zero|one|two|few|many|other)$/, '')

describe('i18n: completezza chiavi', () => {
  const it_ = flatten(itJson as Tree)
  const en_ = flatten(enJson as Tree)

  it('ogni chiave di it esiste in en', () => {
    const missing = it_.filter((k) => !en_.includes(k))
    expect(missing, `mancano in en.json: ${missing.join(', ')}`).toEqual([])
  })
  it('ogni chiave di en esiste in it', () => {
    const missing = en_.filter((k) => !it_.includes(k))
    expect(missing, `mancano in it.json: ${missing.join(', ')}`).toEqual([])
  })
  it('nessun valore vuoto', () => {
    const check = (t: Tree, lang: string, p = ''): string[] =>
      Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? (v.trim() ? [] : [`${lang}:${p}${k}`]) : check(v, lang, `${p}${k}.`)))
    expect([...check(itJson as Tree, 'it'), ...check(enJson as Tree, 'en')]).toEqual([])
  })
  it('stessi segnaposto {{...}} in entrambe le lingue', () => {
    const get = (t: Tree, key: string): string => key.split('.').reduce<string | Tree>((a, p) => (a as Tree)[p] as string | Tree, t) as string
    const ph = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort().join(',')
    for (const k of it_) expect(ph(get(itJson as Tree, k)), k).toBe(ph(get(enJson as Tree, k)))
  })
  it('le forme plurali coincidono per concetto', () => {
    expect(new Set(it_.map(base))).toEqual(new Set(en_.map(base)))
  })
})

describe('localized()', () => {
  it('usa la lingua richiesta, poi en, poi it, poi il fallback', () => {
    expect(localized({ it: 'Cenere', en: 'Ash' }, 'it')).toBe('Cenere')
    expect(localized({ en: 'Ash' }, 'it')).toBe('Ash')
    expect(localized({ it: 'Cenere' }, 'en')).toBe('Cenere')
    expect(localized(undefined, 'it', '?')).toBe('?')
  })
})

/* ---- Euristica: testo hardcoded evidente nei .tsx di src/app e src/ui ---- */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
  })
}

const ATTRS = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt', 'label']

export function findHardcoded(src: string): string[] {
  // toglie commenti
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const found: string[] = []
  // 1) testo JSX tra tag: >Testo<   (lettere, non solo simboli/numeri; esclude generics e frecce)
  for (const m of code.matchAll(/(?<![=\-])>([^<>{}\n]*?[A-Za-zÀ-ÿ]{2,}[^<>{}\n]*?)</g)) {
    const text = (m[1] ?? '').trim()
    if (text && /^[A-ZÀ-ÿa-z]/.test(text) && !/[;()=]/.test(text)) found.push(text)
  }
  // 2) testo JSX su righe proprie (JSX multilinea)
  for (const line of code.split('\n')) {
    const t = line.trim()
    if (/^[A-ZÀ-Ý][a-zà-ÿ]+(\s+[\wÀ-ÿ'’.,!?-]+)+$/.test(t) && !/[;(){}=<>]/.test(t) && !/^(import|export|return|const|type|case)\b/.test(t)) found.push(t)
  }
  // 3) attributi con stringa letterale contenente lettere
  for (const a of ATTRS) {
    for (const m of code.matchAll(new RegExp(`\\s${a}="([^"{}]*[A-Za-zÀ-ÿ]{2,}[^"{}]*)"`, 'g'))) found.push(`${a}="${m[1]}"`)
  }
  return found
}

describe('i18n: nessun testo hardcoded evidente', () => {
  const root = join(__dirname, '..')
  const files = [...walk(join(root, 'app')), ...walk(join(root, 'ui')), ...walk(join(root, 'features/archetypes')), ...walk(join(root, 'features/decks'))]

  it('trova almeno un file da controllare', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('l\'euristica riconosce testo hardcoded', () => {
    expect(findHardcoded('<button aria-label="Chiudi">Salva</button>').length).toBeGreaterThanOrEqual(2)
    expect(findHardcoded('<p>{t(\'a.b\')}</p><x aria-label={t(\'c\')} />')).toEqual([])
  })

  for (const f of files) {
    it(relative(root, f), () => {
      expect(findHardcoded(readFileSync(f, 'utf8'))).toEqual([])
    })
  }
})
