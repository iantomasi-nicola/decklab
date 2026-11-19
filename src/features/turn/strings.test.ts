import { describe, expect, it } from 'vitest'
import { TURN_STRINGS, turnText } from './strings'
import { ICON_LABELS } from '@/ui/gameIcons/labels'
import { ICON_NAMES } from '@/ui/gameIcons/paths'

describe('testi del turno', () => {
  it('it e en hanno le stesse chiavi e gli stessi segnaposto', () => {
    expect(Object.keys(TURN_STRINGS.en).sort()).toEqual(Object.keys(TURN_STRINGS.it).sort())
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')
    for (const k of Object.keys(TURN_STRINGS.it) as (keyof typeof TURN_STRINGS.it)[]) {
      expect(ph(TURN_STRINGS.en[k]), k).toBe(ph(TURN_STRINGS.it[k]))
      expect(TURN_STRINGS.it[k].trim(), k).not.toBe('')
    }
  })
  it('plurali e variabili', () => {
    expect(turnText('it', 'status.attacked', { n: 1 })).toBe('1 ha attaccato')
    expect(turnText('it', 'status.attacked', { n: 3 })).toBe('3 hanno attaccato')
    expect(turnText('en', 'pick.title', { n: 2, m: 5 })).toBe('Choose 2 of 5')
  })
  it('ogni icona ha etichetta in it e en', () => {
    for (const n of ICON_NAMES) {
      expect(ICON_LABELS.it[n], n).toBeTruthy()
      expect(ICON_LABELS.en[n], n).toBeTruthy()
    }
  })
})
