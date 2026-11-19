import { describe, expect, it } from 'vitest'
import { lflistToBanlist, parseLflist } from '../../src/domain/legality/parseLflist'

const SAMPLE = `#[2026.10 OCG]
!2026.10 OCG
#Forbidden
21044178 0 --Abyss Dweller
4280258 0 --Apollousa, Bow of the Goddess
4280259 0 --Apollousa, Bow of the Goddess
#Limited
14558127 1 --Ash Blossom
#Semi Limited
10000 2 --Foo
99999 3 --Esplicita illimitata

!2026.04 TCG
$whitelist
14558127 2
`

describe('parseLflist', () => {
  it('legge testate, voci e commenti', () => {
    const lists = parseLflist(SAMPLE)
    expect(lists.map((l) => [l.id, l.name])).toEqual([['2026.10', 'OCG'], ['2026.04', 'TCG']])
    expect(lists[0]!.entries).toEqual({ 21044178: 0, 4280258: 0, 4280259: 0, 14558127: 1, 10000: 2, 99999: 3 })
    expect(lists[1]!.entries).toEqual({ 14558127: 2 })
    expect(lists[1]!.directives).toEqual(['$whitelist'])
  })

  it('gestisce CRLF, BOM e righe prima della testata', () => {
    const lists = parseLflist('﻿123 0 --x\r\n!2020.01 OCG\r\n555 1 --y\r\n')
    expect(lists).toHaveLength(1)
    expect(lists[0]!.entries).toEqual({ 555: 1 })
  })

  it('ignora righe malformate', () => {
    const lists = parseLflist('!2020.01 OCG\nabc 1\n123 9\n456 1\n')
    expect(lists[0]!.entries).toEqual({ 456: 1 })
  })
})

describe('lflistToBanlist', () => {
  const list = parseLflist(SAMPLE)[0]!
  it('esclude le voci illimitate', () => {
    const b = lflistToBanlist(list, 'OCG')
    expect(b.format).toBe('OCG')
    expect(b.id).toBe('2026.10')
    expect(b.limits[99999]).toBeUndefined()
    expect(b.limits[14558127]).toBe(1)
  })
  it('riporta gli alias alla carta base (vince il più restrittivo)', () => {
    const canon = (n: number) => (n === 4280259 ? 4280258 : n)
    const b = lflistToBanlist({ id: 'x', entries: { 4280258: 1, 4280259: 0 } }, 'TCG', canon)
    expect(b.limits).toEqual({ 4280258: 0 })
  })
})
