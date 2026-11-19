/** Un componente per ogni `kind` di richiesta del core. idle/battle/place vivono sul campo (AutoBoard). */
import { useEffect } from 'react'
import { answerCards, answerPlace } from '@/engine/answers'
import type { Answer } from '@/engine/protocol'
import type { PendingRequest } from '@/engine/requests'
import { toast } from '@/ui/Toast'
import { playSound } from '@/features/sound'
import { useDuel } from './duelStore'
import { CardAnnounceRequest, MaskRequest, NumberRequest } from './requests/announce'
import { ChainRequest } from './requests/chain'
import { CardsRequest, CounterRequest, SumRequest, UnselectRequest } from './requests/choice'
import { OptionRequest, PositionRequest, RpsRequest, YesNoRequest } from './requests/simple'
import { SortRequest } from './requests/sort'
import { useEngT } from './strings'

export function RequestView({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  switch (req.kind) {
    case 'chain': return <ChainRequest req={req} onAnswer={onAnswer} />
    case 'effectYn': case 'yesNo': return <YesNoRequest req={req} onAnswer={onAnswer} />
    case 'option': return <OptionRequest req={req} onAnswer={onAnswer} />
    case 'cards': return <CardsRequest req={req} onAnswer={onAnswer} />
    case 'unselect': return <UnselectRequest req={req} onAnswer={onAnswer} />
    case 'sum': return <SumRequest req={req} onAnswer={onAnswer} />
    case 'counter': return <CounterRequest req={req} onAnswer={onAnswer} />
    case 'position': return <PositionRequest req={req} onAnswer={onAnswer} />
    case 'sort': return <SortRequest req={req} onAnswer={onAnswer} />
    case 'announceRace': case 'announceAttribute': return <MaskRequest req={req} onAnswer={onAnswer} />
    case 'announceNumber': return <NumberRequest req={req} onAnswer={onAnswer} />
    case 'announceCard': return <CardAnnounceRequest req={req} onAnswer={onAnswer} />
    case 'rps': return <RpsRequest req={req} onAnswer={onAnswer} />
    default: return null // idle, battle, place: si risponde sul campo
  }
}

export function RequestHost() {
  const { t } = useEngT()
  const pending = useDuel((s) => s.state?.pending ?? null)
  const tick = useDuel((s) => s.tick)
  const respond = useDuel((s) => s.respond)
  const hint = useDuel((s) => s.hint)
  const setHint = useDuel((s) => s.setHint)

  // rilascio su una carta (bersaglio d'attacco, ecc.): se la scelta è unica e coincide, si risponde da sola
  useEffect(() => {
    if (!pending || !hint?.uid) return
    if (pending.kind === 'cards' && pending.max === 1) {
      const o = pending.options.find((x) => x.uid === hint.uid)
      if (o) {
        setHint(null)
        void respond(answerCards(pending, [o.index]))
      }
    }
  }, [pending, hint, respond, setHint])
  // rilascio su una zona: risponde alla richiesta di zona se è libera
  useEffect(() => {
    if (!pending || !hint?.zone || pending.kind !== 'place' || pending.count !== 1) return
    const o = pending.available.find((a) => `z:${a.loc === 'emz' ? 0 : a.p}:${a.loc}:${a.seq ?? 0}` === hint.zone)
    if (o) {
      setHint(null)
      void respond(answerPlace(pending, [o]))
    }
  }, [pending, hint, respond, setHint])

  if (!pending) return null
  const send = async (a: Answer) => {
    const ok = await respond(a)
    if (!ok) {
      playSound('error')
      toast(t('toast.invalid'))
    }
  }
  return <RequestView key={tick} req={pending} onAnswer={(a) => void send(a)} />
}
