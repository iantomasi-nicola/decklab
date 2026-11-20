/** Collega la mano di partenza del documento aperto a `HandPicker` (stessa logica in scheda Configurazione e pannello Avvia). */
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ComboDoc } from '@/domain/combo/types'
import { toast } from '@/ui/Toast'
import { useEditor } from './editorStore'
import type { HandValue } from './HandPicker'
import { handCodes, handIssues, handModeOf, type HandMode } from './model'
import { useCards } from './useCards'

export function useDocHand(doc: ComboDoc): { value: HandValue; onChange: (v: HandValue) => void; issues: string[] } {
  const { t } = useTranslation()
  const { nameOf } = useCards()
  const [intent, setIntent] = useState<HandMode | null>(null)
  const derived = handModeOf(doc.setup.hand)
  // "Mista" senza carte scelte coincide con "A caso" nei dati: si ricorda l'intenzione, così il pulsante non rimbalza
  const mode: HandMode = derived === 'random' && intent === 'mixed' ? 'mixed' : derived
  const value = useMemo<HandValue>(() => ({ codes: handCodes(doc), mode, size: doc.setup.hand.size }), [doc, mode])
  const onChange = useCallback(
    (v: HandValue) => {
      setIntent(v.mode)
      const blocked = useEditor.getState().setHand(v)
      if (blocked.length) toast(t('combos.hand.blocked', { name: nameOf(doc.cards[blocked[0]!] ?? 0) }))
    },
    [doc.cards, nameOf, t],
  )
  const issues = useMemo(
    () =>
      handIssues(doc).map((i) =>
        t(`combos.hand.issue.${i.code}`, { name: i.card !== undefined ? nameOf(i.card) : '' }),
      ),
    [doc, nameOf, t],
  )
  return { value, onChange, issues }
}
