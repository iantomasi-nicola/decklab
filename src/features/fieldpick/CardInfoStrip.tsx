/** Scheda carta compatta (pressione lunga): arte, nome, dati e testo dell'effetto, in flusso sotto il campo (non lo copre). */
import { useEffect, useState } from 'react'
import Ellipsis from 'lucide-react/icons/ellipsis'
import X from 'lucide-react/icons/x'
import { getCardText } from '@/features/cards/api'
import { CardFace } from '@/features/combos/CardFace'
import { useCards } from '@/features/combos/useCards'
import { useFpT } from './strings'
import './fieldpick.css'

export function CardInfoStrip({ code, onClose, onMenu }: { code: number; onClose: () => void; onMenu?: (() => void) | undefined }) {
  const { t, lang } = useFpT()
  const cards = useCards()
  const [text, setText] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setText(undefined)
    getCardText(code, lang).then((s) => live && setText(s ?? null), () => live && setText(null))
    return () => { live = false }
  }, [code, lang])
  const c = cards.byId(code)
  const meta: string[] = []
  if (c && (c.type & 0x1) !== 0) {
    const link = (c.type & 0x4000000) !== 0
    if (c.level) meta.push(t(link ? 'info.link' : c.type & 0x800000 ? 'info.rank' : 'info.level', { n: c.level }))
    meta.push(`ATK ${c.atk < 0 ? '?' : c.atk}${link ? '' : ` / DEF ${c.def < 0 ? '?' : c.def}`}`)
  }
  return (
    <section className="fp-info-strip" aria-label={cards.nameOf(code)} data-testid="card-info">
      <div className="fp-info-art"><CardFace code={code} name={cards.nameOf(code)} /></div>
      <div className="fp-info-body">
        <p className="fp-info-name">{cards.nameOf(code)}</p>
        {meta.length ? <p className="fp-info-meta">{meta.join(' · ')}</p> : null}
        <p className="fp-info-text" tabIndex={0}>{text === undefined ? t('info.loading') : (text ?? t('info.noText'))}</p>
      </div>
      <div className="fp-info-side">
        <button type="button" className="fp-icon" onClick={onClose} aria-label={t('info.close')} title={t('info.close')} data-testid="info-close"><X aria-hidden size={22} /></button>
        {onMenu ? <button type="button" className="fp-icon" onClick={onMenu} aria-label={t('info.menu')} title={t('info.menu')} data-testid="info-menu"><Ellipsis aria-hidden size={22} /></button> : null}
      </div>
    </section>
  )
}
