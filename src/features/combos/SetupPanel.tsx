import { useTranslation } from 'react-i18next'
import type { ComboDoc } from '@/domain/combo/types'
import { Segmented } from '@/ui/Segmented'
import { useEditor } from './editorStore'
import { HandIssueList, HandPicker } from './HandPicker'
import { handSize } from './model'
import { useDocHand } from './useDocHand'

export function SetupPanel({ doc }: { doc: ComboDoc; nameOf?: (uid: string) => string }) {
  const { t } = useTranslation()
  const store = useEditor.getState()
  const h = doc.setup.hand
  const hand = useDocHand(doc)
  const set = (patch: Partial<ComboDoc['setup']>) => store.edit((d) => ({ doc: { ...d, setup: { ...d.setup, ...patch } } }))
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] text-muted">{t('combos.setup.intro')}</p>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('combos.setup.turn')}</h3>
        <Segmented<'first' | 'second'>
          label={t('combos.setup.turn')}
          value={doc.setup.first ? 'first' : 'second'}
          onValueChange={(v) => set({ first: v === 'first', hand: { ...h, size: Math.max(handSize(v === 'first'), h.required.length) } })}
          options={[
            { value: 'first', label: t('combos.setup.first') },
            { value: 'second', label: t('combos.setup.second') },
          ]}
        />
      </section>
      <section className="flex flex-col gap-2" aria-label={t('combos.hand.title')}>
        <h3 className="text-sm font-medium">{t('combos.hand.title')}</h3>
        <HandPicker deck={doc.deck.main} value={hand.value} onChange={hand.onChange} issues={<HandIssueList items={hand.issues} />} />
      </section>
      <p className="text-sm text-muted">{t('combos.setup.opponent')}</p>
    </div>
  )
}
