import { describe, expect, it } from 'vitest'
import { checkDeck } from '@/domain/legality/checkDeck'
import { index, filler, ASH } from '@/domain/deck/fixtures'
import type { Banlist } from '@/domain/types'
import { badgeKey, banStatusKey, issueKey, issuesByCard, mainIssue, limitOf } from './legalityView'

const bl: Banlist = { format: 'TCG', id: 't', limits: { [ASH]: 1, 1001: 0 } }

describe('legalityView', () => {
  it('mappa i problemi sulle carte e sceglie la chiave i18n', () => {
    const deck = { main: [...filler(38), ASH, ASH, 1001], extra: [], side: [] }
    const issues = checkDeck(deck, bl, 'TCG', index)
    const m = issuesByCard(issues)
    expect(m.get(ASH)?.map((i) => i.code)).toContain('limited')
    expect(issueKey(m.get(1001)![0]!)).toBe('forbidden')
    expect(badgeKey('semi-limited')).toBe('semi-limited')
    expect(badgeKey('main-size')).toBe('wrongSection')
    expect(mainIssue([{ code: 'too-many-copies', severity: 'error', params: {} }, { code: 'forbidden', severity: 'error', params: {} }])?.code).toBe('forbidden')
  })
  it('stato informativo da banlist', () => {
    expect(banStatusKey(limitOf(bl, ASH))).toBe('limited')
    expect(banStatusKey(limitOf(bl, 1003))).toBeUndefined()
  })
})
