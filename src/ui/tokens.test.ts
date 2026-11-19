import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8')

/** Estrae le variabili (#rrggbb) di un blocco, dal selettore indicato fino alla graffa di chiusura. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  const end = css.indexOf('\n}', start)
  const out: Record<string, string> = {}
  for (const m of css.slice(start, end).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]!] = m[2]!
  return out
}

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!
}
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const themes = { scuro: { ...tokens(':root {') }, chiaro: { ...tokens(":root[data-theme='light'] {") } }

describe('token: contrasto WCAG AA', () => {
  for (const [name, t] of Object.entries(themes)) {
    describe(name, () => {
      it('ha tutti i token attesi', () => {
        for (const k of ['bg', 'surface-1', 'surface-2', 'surface-3', 'fg', 'fg-muted', 'fg-subtle', 'accent', 'accent-text', 'accent-soft']) {
          expect(t[k], k).toBeDefined()
        }
      })
      // Testo normale >= 4.5 su ogni superficie
      for (const fg of ['fg', 'fg-muted', 'fg-subtle', 'accent-text', 'ok', 'warn', 'danger']) {
        for (const bg of ['bg', 'surface-1', 'surface-2', 'surface-3']) {
          it(`${fg} su ${bg} >= 4.5`, () => {
            expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5)
          })
        }
      }
      it('accent-text su accent-soft >= 4.5', () => expect(contrast(t['accent-text']!, t['accent-soft']!)).toBeGreaterThanOrEqual(4.5))
      it('testo su accent pieno >= 4.5', () => expect(contrast(t['accent-fg']!, t['accent']!)).toBeGreaterThanOrEqual(4.5))
      it('testo su danger pieno >= 4.5', () => expect(contrast(t['danger-fg']!, t['danger-solid']!)).toBeGreaterThanOrEqual(4.5))
      // Componenti non testuali (bordi di campi, focus) >= 3
      it('border-strong su bg >= 3', () => expect(contrast(t['border-strong']!, t['bg']!)).toBeGreaterThanOrEqual(3))
      it('border-strong su surface-1 >= 3', () => expect(contrast(t['border-strong']!, t['surface-1']!)).toBeGreaterThanOrEqual(3))
      it('focus su bg >= 3', () => expect(contrast(t['focus']!, t['bg']!)).toBeGreaterThanOrEqual(3))
    })
  }
})
