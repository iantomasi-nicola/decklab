import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import { initI18n, i18n } from './i18n'
import { initTheme } from './app/theme'
import { toast } from './ui/Toast'
import { App } from './app/App'
import { startSync } from './sync'
import { soundEngine } from './features/sound'

initI18n()
initTheme()

registerSW({
  immediate: true,
  onOfflineReady: () => toast(i18n.t('pwa.offlineReady'), { tone: 'ok' }),
})

startSync()
soundEngine.install()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
