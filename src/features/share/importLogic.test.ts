import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { encodeLink } from '@/domain/share/link'
import type { ComboDoc } from '@/domain/combo/types'
import { createRepos } from '@/data/repo'
import { createTestDb, fakeClock } from '@/data/testing'
import { exportBackupJson } from '@/data/backup'
import { detectImport, extractLink, issueKey, saveImportedCombo, saveImportedDeck } from './importLogic'

const doc = JSON.parse(readFileSync('tests/fixtures/combo/v1.json', 'utf8')) as ComboDoc

describe('detectImport', () => {
  it('riconosce un link (anche con URL e #) e la combo identica', () => {
    const link = encodeLink(doc)
    for (const input of [link, `https://x.it/importa#${link}`, `  #${link} `]) {
      const d = detectImport(input)
      expect(d.kind).toBe('combo')
      if (d.kind === 'combo') {
        expect(d.source).toBe('link')
        expect(d.result.ok).toBe(true)
      }
    }
    expect(extractLink('ciao mondo')).toBeNull()
  })
  it('link rovinato -> combo non valida con errore di link', () => {
    const d = detectImport('1.AAAAAAAAAAAA')
    expect(d.kind).toBe('combo')
    if (d.kind === 'combo') {
      expect(d.result.ok).toBe(false)
      if (!d.result.ok) expect(issueKey(d.result.errors[0]!).key).toMatch(/^importPage\.link\./)
    }
  })
  it('riconosce JSON combo, mazzo ydk, backup ed errori', async () => {
    expect(detectImport(JSON.stringify(doc)).kind).toBe('combo')
    const ydk = detectImport('#main\n14558127\n14558127\n#extra\n!side\n')
    expect(ydk).toMatchObject({ kind: 'deck', format: 'ydk' })
    const bk = await exportBackupJson(createTestDb('i1'))
    expect(detectImport(bk).kind).toBe('backup')
    expect(detectImport('   ')).toEqual({ kind: 'error', code: 'empty' })
    expect(detectImport('{ non json')).toEqual({ kind: 'error', code: 'invalidJson' })
    expect(detectImport('Ash Blossom')).toEqual({ kind: 'error', code: 'needsIndex' })
  })
  it('combo non valida: errori, nessun documento', () => {
    const bad = { ...doc, steps: [...doc.steps, ...doc.steps] }
    const d = detectImport(JSON.stringify(bad))
    expect(d.kind === 'combo' && !d.result.ok).toBe(true)
  })
})

describe('salvataggio', () => {
  it('salva la combo in un archetipo nuovo e, reimportando, crea una copia', async () => {
    const r = createRepos(createTestDb('i2'), fakeClock())
    const a = await saveImportedCombo(r, doc, { archetypeId: null, newArchetypeName: { it: 'Nuovo' }, variantId: null })
    expect(a.copied).toBe(false)
    expect(a.id).toBe(doc.meta.id)
    const saved = await r.combos.get(a.id)
    expect((saved!.payload as ComboDoc).meta.source).toBe('import')
    expect((await r.archetypes.list()).map((x) => x.name.it)).toEqual(['Nuovo'])
    const b = await saveImportedCombo(r, doc, { archetypeId: saved!.archetypeId, variantId: null })
    expect(b.copied).toBe(true)
    expect(b.id).not.toBe(doc.meta.id)
    expect(await r.combos.list()).toHaveLength(2)
  })
  it('salva un mazzo come variante', async () => {
    const r = createRepos(createTestDb('i3'), fakeClock())
    const { variantId } = await saveImportedDeck(r, { main: [1, 2], extra: [], side: [] }, { archetypeId: null, name: { it: 'Mio' }, rules: 'TCG', banlist: { format: 'TCG', id: '2026.01' } })
    expect((await r.variants.get(variantId))!.deck.main).toEqual([1, 2])
  })
})
