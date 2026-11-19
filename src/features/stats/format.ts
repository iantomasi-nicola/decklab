import type { Lang } from '@/domain/types'

const cache = new Map<string, Intl.NumberFormat>()
const fmt = (lang: Lang, key: string, opts: Intl.NumberFormatOptions) => {
  const k = `${lang}|${key}`
  let f = cache.get(k)
  if (!f) cache.set(k, (f = new Intl.NumberFormat(lang, opts)))
  return f
}

/** 0.9464 → "94,6%" / "94.6%". */
export const pct = (p: number, lang: Lang, digits = 1): string =>
  fmt(lang, `p${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(p)

/** Punti percentuali con segno: "+2,4" / "−0,8" (meno tipografico). */
export const signedPts = (d: number, lang: Lang, digits = 1): string => {
  const s = fmt(lang, `d${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Math.abs(d))
  if (Number(s.replace(',', '.')) === 0) return s
  return `${d < 0 ? '−' : '+'}${s}`
}

export const dec = (n: number, lang: Lang, digits = 1): string =>
  fmt(lang, `n${digits}`, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
