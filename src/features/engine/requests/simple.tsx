/** Richieste semplici: Sì/No (effetto e generica), opzioni, posizione, sasso-carta-forbici. */
import Hand from 'lucide-react/icons/hand'
import Mountain from 'lucide-react/icons/mountain'
import Scissors from 'lucide-react/icons/scissors'
import type { Answer } from '@/engine/protocol'
import { answerEffectYn, answerOption, answerPosition, answerRps, answerYesNo } from '@/engine/answers'
import type { PendingRequest } from '@/engine/requests'
import { GameIcon, type GameIconName } from '@/ui/gameIcons'
import { playSound } from '@/features/sound'
import { descLabel, EngBtn, Sheet, useNames, useRequestKeys, CardBox } from './parts'

type Of<K extends PendingRequest['kind']> = Extract<PendingRequest, { kind: K }>
interface P<K extends PendingRequest['kind']> { req: Of<K>; onAnswer: (a: Answer) => void }

export function YesNoRequest({ req, onAnswer }: { req: Of<'effectYn'> | Of<'yesNo'>; onAnswer: (a: Answer) => void }) {
  const { nameOf, t } = useNames()
  const card = req.kind === 'effectYn' ? req.card : null
  const yes = (v: boolean) => {
    playSound(v ? 'targetConfirm' : 'uiTap')
    onAnswer(req.kind === 'effectYn' ? answerEffectYn(v) : answerYesNo(v))
  }
  useRequestKeys({ y: () => yes(true), n: () => yes(false), escape: () => yes(false) })
  const text = descLabel(req.desc, nameOf, t)
  return (
    <Sheet
      testId="req-yesno"
      title={t(req.kind === 'effectYn' ? 'sel.effectYnTitle' : 'sel.yesNoTitle')}
      footer={
        <>
          <EngBtn onClick={() => yes(false)} data-testid="answer-no">{t('sel.no')}</EngBtn>
          <EngBtn primary onClick={() => yes(true)} data-testid="answer-yes">{t('sel.yes')}</EngBtn>
        </>
      }
    >
      <div className="flex items-center gap-3 pb-2">
        {card ? <CardBox code={card.code} name={nameOf(card.code)} width={64} pos={card.place.pos} /> : null}
        <div className="min-w-0">
          {card ? <p className="font-medium leading-snug text-fg">{nameOf(card.code)}</p> : null}
          {text ? <p className="text-[15px] leading-snug text-muted">{text}</p> : null}
        </div>
      </div>
    </Sheet>
  )
}

export function OptionRequest({ req, onAnswer }: P<'option'>) {
  const { nameOf, t } = useNames()
  const pick = (i: number) => {
    playSound('targetConfirm')
    onAnswer(answerOption(i))
  }
  useRequestKeys({ digit: (n) => n <= req.options.length && pick(n - 1) })
  return (
    <Sheet testId="req-option" title={t('sel.optionTitle')} subtitle={t('sel.shortcuts')}>
      <ul className="flex flex-col gap-2 pb-3">
        {req.options.map((d, i) => (
          <li key={i}>
            <button type="button" className="eng-row" data-autofocus={i === 0 || undefined} onClick={() => pick(i)} data-testid={`option-${i}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-1 text-sm font-semibold tabular-nums" aria-hidden>{i + 1}</span>
              {d?.kind === 'card' ? <GameIcon name="activation" size={22} label={false} /> : null}
              <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug">{descLabel(d, nameOf, t, t('sel.optionN', { n: i + 1 }))}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}

const POS_ICON: Record<string, GameIconName> = { FACEUP_ATK: 'posAtk', FACEUP_DEF: 'posDef', FACEDOWN_DEF: 'posFacedown' }
const POS_LABEL: Record<string, { it: string; en: string }> = {
  FACEUP_ATK: { it: 'Attacco', en: 'Attack' },
  FACEUP_DEF: { it: 'Difesa', en: 'Defense' },
  FACEDOWN_DEF: { it: 'Difesa coperta', en: 'Face-down Defense' },
}

export function PositionRequest({ req, onAnswer }: P<'position'>) {
  const { nameOf, t, lang } = useNames()
  const pick = (p: (typeof req.positions)[number]) => {
    playSound('positionChange')
    onAnswer(answerPosition(p))
  }
  useRequestKeys({ digit: (n) => req.positions[n - 1] && pick(req.positions[n - 1]!) })
  return (
    <Sheet testId="req-position" title={t('sel.positionTitle')} subtitle={nameOf(req.code)}>
      <ul className="grid gap-3 pb-3" style={{ gridTemplateColumns: `repeat(${Math.min(3, req.positions.length)}, minmax(0, 1fr))` }}>
        {req.positions.map((p, i) => {
          const def = p !== 'FACEUP_ATK'
          return (
            <li key={p}>
              <button type="button" className="eng-row flex-col !justify-start !gap-2 !py-3 text-center" data-autofocus={i === 0 || undefined} onClick={() => pick(p)} data-testid={`pos-${p}`}>
                <span className="grid h-[88px] w-full place-items-center">
                  <span style={{ width: 52, transform: def ? 'rotate(90deg)' : undefined }} className="block">
                    <CardBox code={req.code} name={nameOf(req.code)} width={52} pos={p === 'FACEDOWN_DEF' ? 'FACEDOWN_DEF' : 'FACEUP_ATK'} />
                  </span>
                </span>
                <span className="flex items-center gap-1.5 text-[15px] font-semibold"><GameIcon name={POS_ICON[p]!} size={20} label={false} />{POS_LABEL[p]![lang]}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}

export function RpsRequest({ onAnswer }: { req: Of<'rps'>; onAnswer: (a: Answer) => void }) {
  const { t } = useNames()
  // core: 1 forbici, 2 sasso, 3 carta
  const items: { v: 1 | 2 | 3; label: 'sel.scissors' | 'sel.rock' | 'sel.paper'; icon: typeof Hand }[] = [
    { v: 2, label: 'sel.rock', icon: Mountain }, { v: 3, label: 'sel.paper', icon: Hand }, { v: 1, label: 'sel.scissors', icon: Scissors },
  ]
  const pick = (v: 1 | 2 | 3) => {
    playSound('targetConfirm')
    onAnswer(answerRps(v))
  }
  useRequestKeys({ digit: (n) => items[n - 1] && pick(items[n - 1]!.v) })
  return (
    <Sheet testId="req-rps" title={t('sel.rpsTitle')}>
      <ul className="grid grid-cols-3 gap-3 pb-3">
        {items.map(({ v, label, icon: Icon }, i) => (
          <li key={v}>
            <button type="button" className="eng-row flex-col !justify-center !gap-2 !py-4" data-autofocus={i === 0 || undefined} onClick={() => pick(v)} data-testid={`rps-${v}`}>
              <Icon aria-hidden size={28} />
              <span className="text-[15px] font-semibold">{t(label)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
