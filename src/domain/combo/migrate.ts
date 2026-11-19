/** Migrazioni del formato combo (docs/COMBO_FORMAT.md §12) e lettura tollerante. */
import { SUPPORTED_VERSION } from './schema'
import { validateCombo, type Issue } from './validate'
import type { ComboDoc } from './types'

export const CURRENT_VERSION = SUPPORTED_VERSION

type Json = Record<string, unknown>
/** `migrations[n]` trasforma un documento vN in vN+1 (funzione pura, deve restituire un nuovo oggetto e preservare i campi ignoti). */
export const migrations: Record<number, (doc: Json) => Json> = {
  // v1 è la versione iniziale: nessuna migrazione. Esempio futuro: 1: (d) => ({ ...d, v: 2, … })
}

/** Applica le migrazioni in sequenza fino a CURRENT_VERSION. Documenti con v > CURRENT_VERSION sono restituiti invariati. */
export function migrateToCurrent(input: Json): { doc: Json; from: number } {
  const from = typeof input.v === 'number' ? input.v : CURRENT_VERSION
  let doc = input
  for (let v = from; v < CURRENT_VERSION; v++) {
    const m = migrations[v]
    if (!m) throw new Error(`missing migration v${v} -> v${v + 1}`)
    doc = m(doc)
  }
  return { doc, from }
}

export type ReadResult =
  | { ok: true; doc: ComboDoc; readOnly: boolean; migratedFrom?: number; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] }

/**
 * Legge una combo (oggetto o stringa JSON): migra, valida, preserva i campi ignoti (il documento restituito è una copia
 * dell'input, non l'output di zod). Se `v` > versione supportata: `readOnly: true`, documento invariato.
 */
export function readCombo(json: unknown): ReadResult {
  let input = json
  if (typeof json === 'string') {
    try {
      input = JSON.parse(json)
    } catch {
      return { ok: false, errors: [{ rule: 'V1', severity: 'error', code: 'combo.validation.invalidJson', path: [] }], warnings: [] }
    }
  }
  const pre = validateCombo(input)
  if (pre.readOnly) return { ok: true, doc: structuredClone(input) as ComboDoc, readOnly: true, warnings: pre.warnings }
  if (!pre.ok && pre.errors.some((e) => e.rule === 'V1')) return { ok: false, errors: pre.errors, warnings: pre.warnings }
  const { doc, from } = migrateToCurrent(structuredClone(input) as Json)
  const res = from === CURRENT_VERSION ? pre : validateCombo(doc)
  if (!res.ok) return { ok: false, errors: res.errors, warnings: res.warnings }
  return { ok: true, doc: doc as unknown as ComboDoc, readOnly: false, ...(from !== CURRENT_VERSION ? { migratedFrom: from } : {}), warnings: res.warnings }
}
