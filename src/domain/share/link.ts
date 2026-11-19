/**
 * Link condivisibili: JSON minimizzato → deflate (fflate) → base64url, con prefisso di versione `1.`
 * (COMBO_FORMAT §14). Rimossi in codifica: `engine.responses`, `deck.ydke` (derivato), `endboard` se ricalcolabile.
 * In decodifica `engine.responses` torna `[]` e l'endboard mancante viene ricalcolato (solo campo). `ydke` non viene ricreato.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import { readCombo, type ReadResult } from '../combo/migrate'
import { allStates, deriveEndboard, endboardsEqual } from '../combo/state'
import type { Branch, ComboDoc } from '../combo/types'

export const LINK_PREFIX = '1.'
const MAX_LINK_CHARS = 200_000
const MAX_JSON_BYTES = 4_000_000

export function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Copia minimizzata del documento (non modifica l'input). */
export function minimizeCombo(doc: ComboDoc): ComboDoc {
  const out = structuredClone(doc) as ComboDoc & { deck: ComboDoc['deck'] }
  delete out.deck.ydke
  if (out.engine) out.engine = { ...out.engine, responses: [] }
  const all = allStates(doc)
  if (doc.endboard && !doc.endboard.summary && !doc.endboard.hash && endboardsEqual(doc.endboard, deriveEndboard(all.main[all.main.length - 1]!))) delete out.endboard
  out.branches = out.branches.map((b, i): Branch => {
    const src = doc.branches[i]!
    if (!src.endboard || src.endboard.summary || src.endboard.hash) return b
    const st = all.branches[src.id]!
    if (endboardsEqual(src.endboard, deriveEndboard(st[st.length - 1]!))) {
      const { endboard: _drop, ...rest } = b
      return rest
    }
    return b
  })
  return out
}

/** Reinserisce ciò che la minimizzazione toglie (engine.responses vuoto già incluso). */
function restore(doc: ComboDoc): ComboDoc {
  const all = allStates(doc)
  const out = { ...doc }
  if (!out.endboard) out.endboard = deriveEndboard(all.main[all.main.length - 1]!)
  return out
}

export function encodeLink(doc: ComboDoc): string {
  const json = JSON.stringify(minimizeCombo(doc))
  return LINK_PREFIX + toBase64Url(deflateSync(strToU8(json), { level: 9 }))
}

/** Costruisce l'URL di condivisione: `<base>#<link>`. */
export function shareUrl(base: string, doc: ComboDoc): string {
  return `${base.split('#')[0]}#${encodeLink(doc)}`
}

const fail = (code: string): ReadResult => ({ ok: false, errors: [{ rule: 'V1', severity: 'error', code: `combo.link.${code}`, path: [] }], warnings: [] })

/** Decodifica un link (o un URL con frammento `#...`). Il risultato passa da `readCombo` (migrazioni + validazione). */
export function decodeLink(input: string): ReadResult {
  let s = input.trim()
  const hash = s.indexOf('#')
  if (hash >= 0) s = s.slice(hash + 1)
  if (s.length > MAX_LINK_CHARS) return fail('tooLarge')
  if (!s.startsWith(LINK_PREFIX)) return fail(/^\d+\./.test(s) ? 'unsupportedVersion' : 'badPrefix')
  let json: string
  try {
    const bytes = inflateSync(fromBase64Url(s.slice(LINK_PREFIX.length)))
    if (bytes.length > MAX_JSON_BYTES) return fail('tooLarge')
    json = strFromU8(bytes)
  } catch {
    return fail('corrupt')
  }
  const res = readCombo(json)
  if (!res.ok || res.readOnly) return res
  return { ...res, doc: restore(res.doc) }
}
