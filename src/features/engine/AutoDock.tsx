/** Barra sotto l'intestazione in modalità automatica: fasi sincronizzate col core, avanzamento dei caricamenti, errori, impostazioni. */
import { useMemo, useState } from 'react'
import Settings2 from 'lucide-react/icons/settings-2'
import { answerBattle, answerIdle } from '@/engine/answers'
import type { PendingRequest } from '@/engine/requests'
import { PHASES, type Phase, type PhaseTransition, type TurnState } from '@/domain/combo/turn'
import { playSound } from '@/features/sound'
import { TurnBar } from '@/features/turn'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { IconButton } from '@/ui/IconButton'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import { useDuel } from './duelStore'
import { useEngT } from './strings'
import './engine.css'

/** Barra di avanzamento: indeterminata se non si conosce il totale. Trasparente: non blocca nulla. */
export function LoadBar() {
  const { t } = useEngT()
  const load = useDuel((s) => s.load)
  const replaying = useDuel((s) => s.replaying)
  const label = load ? t('load.scripts', { done: load.done, total: load.total }) : replaying ? t('load.replay', { n: replaying }) : t('load.engine')
  const pct = load && load.total > 0 ? Math.min(1, load.done / load.total) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={load?.total ?? 100} aria-valuenow={load?.done ?? undefined} data-testid="load-bar" className="flex flex-col gap-1">
      <div className="eng-bar" data-indeterminate={!load || undefined}>
        <span style={load ? { transform: `scaleX(${pct})` } : undefined} />
      </div>
      <p className="text-xs text-muted tabular-nums">{label}</p>
    </div>
  )
}

/** Fasi raggiungibili dalla richiesta corrente (dal core, non dalle regole locali). */
export function transitionsOf(req: PendingRequest | null, phase: Phase): PhaseTransition[] {
  const t = (to: Phase): PhaseTransition => ({ from: phase, to, kind: PHASES.indexOf(to) === PHASES.indexOf(phase) + 1 ? 'next' : 'skip' })
  if (req?.kind === 'idle') return [...(req.canBattle ? [t('battle')] : []), ...(req.canEndTurn ? [t('end')] : [])]
  if (req?.kind === 'battle') return [...(req.canMain2 ? [t('main2')] : []), ...(req.canEnd ? [t('end')] : [])]
  return []
}

/** Risposta del core a un cambio di fase dalla barra delle fasi (dock o pannello Passi). */
export function usePhaseGo() {
  const respond = useDuel((s) => s.respond)
  return (to: Phase) => {
    const pending = useDuel.getState().state?.pending
    if (!pending) return
    playSound('phaseChange')
    if (pending.kind === 'idle') void respond(to === 'battle' ? answerIdle('toBattle') : answerIdle('toEnd'))
    else if (pending.kind === 'battle') void respond(to === 'main2' ? answerBattle('toMain2') : answerBattle('toEnd'))
  }
}

export function AutoDock({ turn }: { turn?: TurnState | undefined }) {
  const { t } = useEngT()
  const pending = useDuel((s) => s.state?.pending ?? null)
  const state = useDuel((s) => s.state)
  const status = useDuel((s) => s.status)
  const busy = useDuel((s) => s.busy)
  const load = useDuel((s) => s.load)
  const replaying = useDuel((s) => s.replaying)
  const go = usePhaseGo()
  const [open, setOpen] = useState(false)
  const phase: Phase = pending?.kind === 'battle' ? 'battle' : (turn?.phase ?? 'main1')
  const transitions = useMemo(() => transitionsOf(pending, phase), [pending, phase])
  return (
    <div className="flex shrink-0 flex-col gap-2" data-testid="auto-dock">
      <div className="flex items-stretch gap-1">
        <div className="min-w-0 flex-1">
          <TurnBar phase={phase} transitions={transitions} turn={turn?.turn ?? 1} onPhaseChange={go} disabled={status !== 'running' || (pending?.kind !== 'idle' && pending?.kind !== 'battle')} />
        </div>
        <IconButton label={t('settings.open')} icon={<Settings2 size={20} />} onClick={() => setOpen(true)} data-testid="duel-settings" className="self-center" />
      </div>
      {(busy && (load || replaying)) ? <LoadBar /> : null}
      {state?.ended ? <p role="status" className="text-sm font-medium text-ok">{t('ended')}</p> : null}
      {open ? <DuelSettings onClose={() => setOpen(false)} /> : null}
    </div>
  )
}

export function DuelSettings({ onClose }: { onClose: () => void }) {
  const { t } = useEngT()
  const prefs = useDuel((s) => s.prefs)
  const setPrefs = useDuel((s) => s.setPrefs)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={t('settings.title')} footer={<Button variant="primary" onClick={onClose}>{t('sel.confirm')}</Button>}>
      <div className="flex flex-col gap-4" data-testid="duel-settings-dialog">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('settings.pause')}</h3>
          <p className="text-sm text-muted">{t('settings.pauseHint')}</p>
          <Segmented<'always' | 'ifCanRespond' | 'never'>
            label={t('settings.pause')}
            value={prefs.pause}
            onValueChange={(pause) => setPrefs({ pause })}
            options={[{ value: 'always', label: t('settings.pause.always') }, { value: 'ifCanRespond', label: t('settings.pause.can') }, { value: 'never', label: t('settings.pause.never') }]}
          />
        </div>
        <Switch checked={prefs.single} onCheckedChange={(single) => setPrefs({ single })} label={t('settings.autoSingle')} description={t('settings.autoSingleHint')} />
        <Switch checked={prefs.sort} onCheckedChange={(sort) => setPrefs({ sort })} label={t('settings.autoSort')} description={t('settings.autoSortHint')} />
        <p className="text-sm text-muted">{t('settings.sounds')}</p>
      </div>
    </Dialog>
  )
}

/** Avvisi del duello: errore del motore, carta non simulabile (con "passa a manuale"). */
export function AutoNotices({ onManual, nameOf }: { onManual: () => void; nameOf: (code: number) => string }) {
  const { t } = useEngT()
  const error = useDuel((s) => s.error)
  const unsupported = useDuel((s) => s.unsupported)
  const clearError = useDuel((s) => s.clearError)
  if (!error && unsupported.length === 0) return null
  return (
    <div className="flex shrink-0 flex-col gap-2" data-testid="auto-notices">
      {error ? (
        <Banner
          tone="danger"
          title={t('err.title')}
          onDismiss={clearError}
          action={<Button onClick={onManual} data-testid="to-manual">{t('err.toManual')}</Button>}
        >
          {error.kind === 'script' ? t('err.script') : error.kind === 'invalid' ? t('err.invalid') : error.message}
        </Banner>
      ) : null}
      {unsupported.length ? (
        <Banner tone="warn" title={t('err.unsupported')} action={<Button onClick={onManual} data-testid="to-manual">{t('err.toManual')}</Button>}>
          {t('err.unsupportedBody', { name: unsupported.slice(0, 3).map(nameOf).join(', ') })}
        </Banner>
      ) : null}
    </div>
  )
}
