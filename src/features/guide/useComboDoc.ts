import { useEffect, useState } from 'react'
import { readCombo } from '@/domain/combo/migrate'
import type { ComboDoc } from '@/domain/combo/types'
import { repos, type ComboRecord } from '@/data/repo'

export type ComboLoad =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'invalid'; record: ComboRecord; errors: string[] }
  | { status: 'ready'; record: ComboRecord; doc: ComboDoc; readOnly: boolean }

/** Carica una combo (Dexie, local-first) e l'elenco di tutte le combo vive (per varianti e madre). */
export function useComboDoc(comboId: string): { load: ComboLoad; all: ComboRecord[] } {
  const [load, setLoad] = useState<ComboLoad>({ status: 'loading' })
  const [all, setAll] = useState<ComboRecord[]>([])
  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    void repos.combos
      .get(comboId)
      .then((r) => {
        if (!live) return
        if (!r || r.deletedAt !== null) return setLoad({ status: 'missing' })
        const res = readCombo(r.payload)
        if (!res.ok) return setLoad({ status: 'invalid', record: r, errors: res.errors.map((e) => `${e.code} ${e.path.join('.')}`) })
        setLoad({ status: 'ready', record: r, doc: res.doc, readOnly: res.readOnly })
      })
      .catch(() => live && setLoad({ status: 'missing' }))
    const sub = repos.combos.watchList().subscribe({ next: (rows) => live && setAll(rows) })
    return () => {
      live = false
      sub.unsubscribe()
    }
  }, [comboId])
  return { load, all }
}
