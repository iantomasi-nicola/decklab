import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Shuffle from 'lucide-react/icons/shuffle'
import type { ComboDoc } from '@/domain/combo/types'
import { drawHand, playableCombos } from '@/domain/smart'
import type { ComboRecord } from '@/data/repo'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { CardFace } from './CardFace'
import { pickText } from './model'
import { useCards } from './useCards'

/** "Mano di prova": pesca una mano casuale dal mazzo della combo e mostra quali combo salvate sono giocabili. */
export function PracticeHandDialog({ doc, records, onClose }: { doc: ComboDoc; records: ComboRecord[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const cards = useCards()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const size = doc.setup.first ? 5 : 6
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))
  const { hand } = useMemo(() => drawHand(doc.deck.main, size, seed), [doc.deck.main, size, seed])
  const docs = useMemo(() => records.map((r) => ({ r, d: r.payload as ComboDoc })).filter((x) => x.d?.setup?.hand), [records])
  const results = useMemo(() => {
    const index = cards.state.status === 'ready' ? cards.state.index : undefined
    const ranked = playableCombos(hand, docs.map((x) => x.d), index)
    return ranked.map((m) => ({ m, rec: docs.find((x) => x.d === m.doc)!.r }))
  }, [hand, docs, cards.state])
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('combos.practice.title')}
      description={t('combos.practice.hint', { size })}
      className="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" icon={<Shuffle size={18} />} onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))} data-testid="practice-new">
            {t('combos.practice.new')}
          </Button>
        </>
      }
    >
      {hand.length === 0 ? (
        <p className="text-muted">{t('combos.practice.noDeck')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2" data-practice-hand>
            {hand.map((code, i) => (
              <li key={i} className="flex flex-col gap-1">
                <CardFace code={code} name={cards.nameOf(code)} />
                <span className="line-clamp-2 text-xs leading-tight text-muted">{cards.nameOf(code)}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1.5" aria-label={t('combos.practice.results')}>
            {results.map(({ m, rec }) => (
              <li key={rec.id}>
                <Link to="/combo/$comboId" params={{ comboId: rec.id }} className="flex min-h-11 items-center gap-2 rounded-md border border-line px-3 py-2 text-[15px] hover:bg-surface-2" data-practice-result={m.playable ? 'playable' : 'no'}>
                  <span className="min-w-0 flex-1 truncate">{pickText(rec.name, lang) || t('combos.untitled')}</span>
                  {m.playable ? (
                    <Badge tone="ok">{t('combos.practice.playable')}</Badge>
                  ) : (
                    <span className="shrink-0 text-sm text-muted">{t('combos.practice.missing', { count: m.missing.length })}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  )
}
