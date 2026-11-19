import type { Step } from '@/domain/combo/types'

type T = (key: string, opts?: Record<string, unknown>) => string

export interface Headline { verb: string; card: string; sub: string }

/** Parti del titolo di un passo: verbo dell'azione, carta, e (metodo · effetto). Testi sotto `guide.act/method/effect`. */
export function stepHeadline(step: Step, t: T, nameOfUid: (uid: string) => string): Headline {
  const verb = step.action === 'custom' ? (step.label ?? t('guide.act.custom')) : t(`guide.act.${step.action}`)
  const method = step.action === 'specialSummon' && step.method ? t(`guide.method.${step.method}`) : ''
  const effect = step.action === 'activate' && step.effect?.index ? t('guide.effect', { n: step.effect.index }) : ''
  return { verb, card: step.card ? nameOfUid(step.card) : '', sub: [method, effect].filter(Boolean).join(' · ') }
}

/** Titolo in una sola riga di testo. */
export const headlineText = (h: Headline) => [h.verb, h.card, h.sub ? `(${h.sub})` : ''].filter(Boolean).join(' ')
