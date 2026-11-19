/** Finestra di risposta (SELECT_CHAIN): effetti attivabili con icona del tipo di effetto e "Passa". */
import type { Answer } from '@/engine/protocol'
import { answerChain } from '@/engine/answers'
import type { PendingRequest } from '@/engine/requests'
import { cardInfo } from '@/features/combos/cardKind'
import { playSound } from '@/features/sound'
import { EffectBadge, type BadgeKind } from '@/ui/gameIcons'
import { CardBox, descLabel, EngBtn, Sheet, useNames, useRequestKeys } from './parts'

type Req = Extract<PendingRequest, { kind: 'chain' }>

export function ChainRequest({ req, onAnswer }: { req: Req; onAnswer: (a: Answer) => void }) {
  const { nameOf, t, cards } = useNames()
  const go = (index: number | null) => {
    playSound(index === null ? 'uiTap' : 'activate')
    onAnswer(answerChain(index))
  }
  useRequestKeys({
    digit: (n) => req.options[n - 1] && go(req.options[n - 1]!.index),
    escape: req.forced ? undefined : () => go(null),
  })
  const n = req.options.length
  return (
    <Sheet
      testId="req-chain"
      title={t('sel.chainTitle')}
      subtitle={n === 0 ? t('sel.chainEmpty') : req.forced ? t('sel.chainForced') : t('sel.chainCount', { n })}
      footer={req.forced ? undefined : <EngBtn primary={n === 0} onClick={() => go(null)} data-testid="chain-pass">{t('sel.pass')}</EngBtn>}
    >
      {n > 0 ? (
        <ul className="flex flex-col gap-2 pb-3">
          {req.options.map((o, i) => {
            const info = cardInfo(cards.byId(o.code))
            const kind: BadgeKind = req.forced ? 'trigger' : info.kind !== 'monster' && o.place.loc === 'hand' ? 'activation' : 'quick'
            return (
              <li key={`${o.uid}:${o.index}`}>
                <button type="button" className="eng-row" data-autofocus={i === 0 || undefined} onClick={() => go(o.index)} data-testid={`chain-opt-${i}`}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-xs font-semibold tabular-nums text-muted" aria-hidden>{i + 1}</span>
                  <CardBox code={o.code} name={nameOf(o.code)} width={40} pos={o.place.pos} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{nameOf(o.code)}</span>
                    <span className="line-clamp-2 text-sm leading-snug text-muted">{descLabel(o.desc, nameOf, t, t(`kind.${kind}` as const))}</span>
                  </span>
                  <EffectBadge kind={kind} size="md" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="pb-3" />
      )}
    </Sheet>
  )
}
