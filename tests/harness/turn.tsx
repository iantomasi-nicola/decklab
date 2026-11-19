import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { initI18n } from '../../src/i18n'
import { GameIcon, EffectBadge, ICON_NAMES } from '../../src/ui/gameIcons'

initI18n()
createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 16 }}>
    <div data-testid="icons" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 72px)', gap: 8 }}>
      {ICON_NAMES.map((n) => (
        <div key={n} style={{ display: 'grid', placeItems: 'center', gap: 4, fontSize: 10 }}>
          <GameIcon name={n} size={32} />
          <GameIcon name={n} size={24} />
          <GameIcon name={n} size={16} />
          <span>{n}</span>
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
      {(['ignition', 'quick', 'trigger', 'continuous', 'activation', 'chain'] as const).map((k) => (
        <EffectBadge key={k} kind={k} index={k === 'chain' ? 2 : 1} />
      ))}
      {(['ignition', 'quick', 'trigger', 'continuous', 'activation', 'chain'] as const).map((k) => (
        <EffectBadge key={k} kind={k} size="sm" index={k === 'chain' ? 3 : undefined} />
      ))}
    </div>
  </main>,
)
