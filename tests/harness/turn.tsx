/** Pagina di prova (solo dev/e2e): stato del turno, icone di gioco, marcature OPT e selezione bersagli, senza toccare le pagine dell'app. */
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { initI18n, useLocalized } from '../../src/i18n'
import { GameIcon, EffectBadge, ICON_NAMES, type BadgeKind } from '../../src/ui/gameIcons'
import { TurnBar, TurnStatus, CardOptMarks, TargetPickerOverlay, useTurnT } from '../../src/features/turn'
import { optTotalInDoc, turnTimeline, type Phase } from '../../src/domain/combo/turn'
import type { ComboDoc, Step } from '../../src/domain/combo/types'
import base from '../fixtures/combo/v1.json'
import longDoc from '../fixtures/combo/long-60.json'

initI18n()
const params = new URLSearchParams(location.search)

const mz = (seq: number) => ({ loc: 'mzone' as const, seq, pos: 'FACEUP_ATK' as const })
const S = (id: string, s: Partial<Step>): Step => ({ id, action: 'custom', moves: [], phase: 'main1', ...s })
function demoDoc(): ComboDoc {
  const d = structuredClone(base) as unknown as ComboDoc
  d.cards = { u1: 999000001, u2: 999000002, u3: 999000003, u4: 999000004, u5: 999000005, o1: 14558127 }
  d.branches = []
  d.steps = [
    S('s1', { action: 'normalSummon', card: 'u1', moves: [{ uid: 'u1', to: mz(0), why: 'summon' }] }),
    S('s2', { action: 'activate', card: 'u1', effect: { kind: 'trigger', index: 1 } }),
    S('s3', { action: 'specialSummon', method: 'fusion', card: 'u2', moves: [{ uid: 'u2', to: mz(1), why: 'summon' }] }),
    S('s4', { action: 'activate', card: 'u2', effect: { kind: 'ignition', index: 1 } }),
    S('s5', { action: 'activate', card: 'u3', effect: { kind: 'quick', index: 2 } }),
    S('s6', { action: 'specialSummon', method: 'synchro', card: 'u3', moves: [{ uid: 'u3', to: mz(2), why: 'summon' }] }),
    S('s7', { action: 'specialSummon', method: 'pendulum', card: 'u4', moves: [{ uid: 'u4', to: mz(3), why: 'summon' }] }),
    S('s8', { action: 'placeCounter', card: 'u2', counters: [{ uid: 'u2', type: 'spell', delta: 2 }] }),
    S('s9', { action: 'activate', card: 'u5', effect: { kind: 'continuous', index: 1 } }),
    S('s10', { action: 'activate', card: 'u2', effect: { kind: 'ignition', index: 1 } }),
    S('s11', { action: 'enterPhase', phase: 'battle' }),
    S('s12', { action: 'attack', card: 'u2', phase: 'battle' }),
    S('s13', { action: 'attack', card: 'u3', phase: 'battle' }),
    S('s14', { action: 'enterPhase', phase: 'main2' }),
    S('s15', { action: 'enterPhase', phase: 'end' }),
  ]
  return d
}

const NAMES: Record<string, { it: string; en: string }> = {
  u1: { it: 'Drago Cenere', en: 'Ash Dragon' },
  u2: { it: 'Cavaliere Fusione', en: 'Fusion Knight' },
  u3: { it: 'Sincro Lampo', en: 'Flash Synchro' },
  u4: { it: 'Pendolo', en: 'Pendulum' },
  u5: { it: 'Campo Antico', en: 'Ancient Field' },
}

function Harness() {
  const long = params.get('long') === '1'
  const doc = useMemo(() => (long ? (longDoc as unknown as ComboDoc) : demoDoc()), [long])
  const tl = useMemo(() => turnTimeline(doc), [doc])
  const optTotal = useMemo(() => optTotalInDoc(doc), [doc])
  const { l } = useLocalized()
  const { t } = useTurnT()
  const last = doc.steps.length - 1
  const [step, setStep] = useState(Math.min(Number(params.get('step') ?? (long ? last : 12)), last))
  const [manual, setManual] = useState<Phase | null>(null)
  const [picking, setPicking] = useState<null | { min: number; max: number }>(
    params.get('pick') ? { min: Number(params.get('min') ?? params.get('pick')), max: Number(params.get('pick')) } : null,
  )
  const [picked, setPicked] = useState<string[]>([])
  const ts = tl[step + 1]!
  const name = (u: string) => (NAMES[u] ? l(NAMES[u]) : u === 'off1' ? l({ it: 'Carta nel Cimitero', en: 'Card in the GY' }) : u)
  const phase = manual ?? ts.phase
  const kinds: BadgeKind[] = ['ignition', 'quick', 'trigger', 'continuous', 'activation', 'chain']
  const gray = params.get('gray') === '1'

  return (
    <main className="mx-auto grid max-w-[1100px] gap-4 p-4" style={{ filter: gray ? 'grayscale(1)' : undefined }}>
      <style>{`
        .h-field{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
        .h-card{position:relative;aspect-ratio:59/86;border-radius:8px;border:1px solid var(--border-strong);background:var(--surface-3);display:grid;place-items:center;padding:26px 4px 4px;font-size:10px;line-height:1.15;font-weight:600;text-align:center;overflow-wrap:anywhere;align-content:start}
        .h-card .opt-marks{position:absolute;top:4px;right:6px}
        .h-step{display:flex;align-items:center;gap:8px}
        .h-btn{min-height:44px;min-width:44px;padding:0 16px;border:1px solid var(--border-strong);border-radius:12px;background:var(--surface-2);font-weight:600;cursor:pointer}
        .h-btn[data-primary]{background:var(--accent);color:var(--accent-fg);border-color:transparent}
        .h-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px}
        .h-icon{display:grid;justify-items:center;gap:8px;padding:12px 4px;border:1px solid var(--border);border-radius:12px;background:var(--surface-1);font-size:12px;color:var(--fg-muted);text-align:center}
        .h-icon svg{color:var(--fg)}
        .h-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
      `}</style>

      <section className="h-step" aria-label="step">
        <button className="h-btn" aria-label="prev" onClick={() => { setStep((s) => Math.max(-1, s - 1)); setManual(null) }}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} data-testid="step">{step + 1} / {doc.steps.length}</span>
        <button className="h-btn" aria-label="next" onClick={() => { setStep((s) => Math.min(last, s + 1)); setManual(null) }}>›</button>
      </section>

      <TurnBar phase={phase} transitions={manual ? undefined : ts.phaseTransitions} turn={ts.turn} onPhaseChange={(p) => setManual(p)} />
      <TurnStatus turn={ts} optTotal={optTotal} cardName={name} onJumpToStep={(i) => { setStep(i); setManual(null) }} />

      <section className="grid gap-2" aria-label="field">
        <div className="h-field" data-testid="field">
          {Object.keys(NAMES).map((u) => (
            <div key={u} className="h-card" data-card={u}>
              {name(u)}
              <CardOptMarks turn={ts} uid={u} {...(doc.cards[u] ? { code: doc.cards[u] } : {})} size="sm" />
            </div>
          ))}
        </div>
        <div className="h-row">
          <button className="h-btn" data-primary data-testid="pick-1" onClick={() => setPicking({ min: 1, max: 1 })}>1 / 5</button>
          <button className="h-btn" data-primary data-testid="pick-2" onClick={() => setPicking({ min: 2, max: 2 })}>2 / 5</button>
          <button className="h-btn" data-testid="pick-range" onClick={() => setPicking({ min: 1, max: 3 })}>1-3 / 5</button>
          <span data-testid="picked" style={{ color: 'var(--fg-muted)', fontSize: 14 }}>{picked.map(name).join(', ')}</span>
        </div>
      </section>

      <section className="grid gap-2" aria-label="badges">
        <div className="h-row" data-testid="badges">
          {kinds.map((k) => <EffectBadge key={k} kind={k} index={k === 'chain' ? 2 : 1} />)}
          {kinds.map((k) => <EffectBadge key={`s${k}`} kind={k} size="sm" index={k === 'chain' ? 3 : undefined} />)}
        </div>
      </section>

      <section className="h-icons" data-testid="icons" aria-label="icons">
        {ICON_NAMES.map((n) => (
          <div key={n} className="h-icon" data-icon={n}>
            <GameIcon name={n} size={24} />
            <span>{n}</span>
          </div>
        ))}
      </section>

      {picking ? (
        <TargetPickerOverlay
          candidates={['u1', 'u2', 'u3', 'u4', 'off1']}
          min={picking.min}
          max={picking.max}
          title={`${name('u1')} · ${t('log.effect', { i: 1 })}`}
          cardName={name}
          onConfirm={(sel) => { setPicked(sel); setPicking(null) }}
          onCancel={() => setPicking(null)}
        />
      ) : null}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
