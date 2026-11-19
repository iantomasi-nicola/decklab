/** Pagina di prova (solo dev/e2e): monta ShareDialog con la combo di esempio, senza toccare le pagine dell'app. */
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { initI18n } from '../../src/i18n'
import { ToastViewport } from '../../src/ui/Toast'
import { ShareDialog } from '../../src/features/share/ShareDialog'
import fixture from '../fixtures/combo/v1.json'
import type { ComboDoc } from '../../src/domain/combo/types'

initI18n()
const doc = fixture as unknown as ComboDoc
const long = new URLSearchParams(location.search).get('long')
const d: ComboDoc = long
  ? { ...doc, steps: Array.from({ length: 140 }, (_, i) => ({ ...doc.steps[i % doc.steps.length]!, id: `s${i}`, note: { it: `Nota ${i} ${'x'.repeat(40)} ${Math.random()}` } })) }
  : doc

createRoot(document.getElementById('root')!).render(
  <>
    <ShareDialog open onOpenChange={() => {}} doc={d} legality="legale" />
    <ToastViewport />
  </>,
)
