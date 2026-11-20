/** Barra sottile di conferma, in flusso sotto il campo (il campo si ridimensiona, non viene mai coperto). */
import Undo2 from 'lucide-react/icons/undo-2'
import { useFpT } from './strings'
import './fieldpick.css'

export interface PickBarProps {
  title?: string | undefined
  /** testo del contatore (es. "Materiali 1/2", "Livello 6/8") */
  count: string
  ok: boolean
  warn?: boolean
  /** niente pulsante Conferma (scelta che si conferma da sola: es. zona unica) */
  noConfirm?: boolean
  onConfirm?: (() => void) | undefined
  onCancel?: (() => void) | undefined
  onUndo?: (() => void) | undefined
  canUndo?: boolean
  testId?: string
}

export function PickBar({ title, count, ok, warn, noConfirm, onConfirm, onCancel, onUndo, canUndo, testId = 'pick-bar' }: PickBarProps) {
  const { t } = useFpT()
  return (
    <div className="fp-bar" role="group" aria-label={title ?? count} data-testid={testId}>
      <div className="fp-info">
        {title ? <p className="fp-title">{title}</p> : null}
        <p className="fp-count" data-ok={ok || undefined} data-warn={warn || undefined} role="status" aria-live="polite" data-testid="pick-count">{count}</p>
      </div>
      {onUndo ? (
        <button type="button" className="fp-btn" data-icon="true" disabled={!canUndo} onClick={onUndo} aria-label={t('bar.undo')} title={t('bar.undo')} data-testid="pick-undo">
          <Undo2 aria-hidden size={20} />
        </button>
      ) : null}
      {onCancel ? (
        <button type="button" className="fp-btn" onClick={onCancel} data-testid="pick-cancel">{t('bar.cancel')}</button>
      ) : null}
      {!noConfirm ? (
        <button type="button" className="fp-btn" data-primary="true" disabled={!ok} onClick={onConfirm} data-testid="pick-confirm">{t('bar.confirm')}</button>
      ) : null}
    </div>
  )
}
