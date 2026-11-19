import { useTranslation } from 'react-i18next'
import type { ComboDoc } from '@/domain/combo/types'
import { Segmented } from '@/ui/Segmented'
import { useEditor } from './editorStore'
import { handSize } from './model'

export function SetupPanel({ doc, nameOf }: { doc: ComboDoc; nameOf: (uid: string) => string }) {
  const { t } = useTranslation()
  const store = useEditor.getState()
  const hand = doc.setup.hand
  const set = (patch: Partial<ComboDoc['setup']>) => store.edit((d) => ({ doc: { ...d, setup: { ...d.setup, ...patch } } }))
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[15px] text-muted">{t('combos.setup.intro')}</p>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('combos.setup.turn')}</h3>
        <Segmented<'first' | 'second'>
          label={t('combos.setup.turn')}
          value={doc.setup.first ? 'first' : 'second'}
          onValueChange={(v) => set({ first: v === 'first', hand: { ...hand, size: handSize(v === 'first') } })}
          options={[
            { value: 'first', label: t('combos.setup.first') },
            { value: 'second', label: t('combos.setup.second') },
          ]}
        />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('combos.setup.handFill')}</h3>
        <Segmented<'random' | 'none'>
          label={t('combos.setup.handFill')}
          value={hand.fill}
          onValueChange={(v) => set({ hand: { ...hand, fill: v } })}
          options={[
            { value: 'random', label: t('combos.setup.fillRandom') },
            { value: 'none', label: t('combos.setup.fillNone') },
          ]}
        />
        <p className="text-sm text-muted">{t('combos.setup.handInfo', { size: hand.size, n: hand.required.length })}</p>
        {hand.required.length > hand.size ? <p role="alert" className="text-sm text-danger">{t('combos.setup.tooMany')}</p> : null}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('combos.setup.required')}</h3>
        {hand.required.length === 0 ? (
          <p className="text-sm text-muted">{t('combos.setup.requiredEmpty')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {hand.required.map((u) => (
              <li key={u} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm">
                {nameOf(u)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-muted">{t('combos.setup.opponent')}</p>
    </div>
  )
}
