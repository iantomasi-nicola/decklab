/** (De)serializzazione delle risposte per `combo.engine.responses` (base64 di JSON; i bigint di ANNOUNCE_RACE ecc. come {"$b":"…"}). */
import type { Answer } from './protocol'

const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? { $b: v.toString() } : v)
const reviver = (_k: string, v: unknown) =>
  v && typeof v === 'object' && '$b' in (v as object) && typeof (v as { $b: unknown }).$b === 'string' ? BigInt((v as { $b: string }).$b) : v

const b64 = (s: string): string => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'))
const unb64 = (s: string): string => (typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary'))

export const encodeAnswer = (a: Answer): string => b64(JSON.stringify(a, replacer))
export const decodeAnswer = (s: string): Answer => JSON.parse(unb64(s), reviver) as Answer
export const encodeAnswers = (l: readonly Answer[]): string[] => l.map(encodeAnswer)
export const decodeAnswers = (l: readonly string[]): Answer[] => l.map(decodeAnswer)

/** Uguaglianza strutturale di due risposte (supporta bigint). */
export const sameAnswer = (a: Answer, b: Answer): boolean => JSON.stringify(a, replacer) === JSON.stringify(b, replacer)

/** Voce di cronologia ⇄ stringa di `engine.responses`: le risposte automatiche hanno il prefisso `a.`. */
export const encodeEntries = (l: readonly { answer: Answer; auto: boolean }[]): string[] => l.map((e) => (e.auto ? 'a.' : '') + encodeAnswer(e.answer))
export const decodeEntries = (l: readonly string[]): { answers: Answer[]; auto: boolean[] } => ({
  answers: l.map((s) => decodeAnswer(s.startsWith('a.') ? s.slice(2) : s)),
  auto: l.map((s) => s.startsWith('a.')),
})
