/** Pagina di prova (solo dev): sezione Suoni + catena di anelli crescenti + combo di prova a ritmo. */
import { createRoot } from 'react-dom/client'
import '../../src/styles.css'
import { initI18n } from '../../src/i18n'
import { SoundSection } from '../../src/features/sound/SoundSection'
import { playSound, soundEngine } from '../../src/features/sound'

initI18n()
soundEngine.install()
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function App() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Harness suoni</h1>
      <div className="flex gap-2">
        <button
          className="min-h-11 rounded-md border border-line bg-surface-2 px-4"
          onClick={async () => {
            for (let k = 1; k <= 6; k++) {
              playSound('chainLink', k)
              await wait(160)
            }
            for (let k = 6; k >= 1; k--) {
              playSound('chainResolve')
              await wait(180)
            }
          }}
        >
          Catena 6 anelli
        </button>
        <button
          className="min-h-11 rounded-md border border-line bg-surface-2 px-4"
          onClick={async () => {
            for (const n of ['summonNormal', 'activate', 'summonFusion', 'search', 'destroy', 'comboComplete'] as const) {
              playSound(n)
              await wait(450)
            }
          }}
        >
          Mini combo
        </button>
      </div>
      <div className="rounded-lg border border-line bg-surface p-5">
        <SoundSection />
      </div>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
