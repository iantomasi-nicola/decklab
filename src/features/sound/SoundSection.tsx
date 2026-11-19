import { useTranslation } from 'react-i18next'
import Play from 'lucide-react/icons/play'
import { Button } from '@/ui/Button'
import { Switch } from '@/ui/Switch'
import { SOUND_NAMES, categoryOf, type SoundCategory, type SoundName } from './names'
import { useSoundSettings } from './settings'
import { useSound } from './useSound'

const CATS: SoundCategory[] = ['game', 'ui', 'feedback']

/** Sezione "Suoni" delle Impostazioni: volume, silenzio, categorie, vibrazione e prova di ogni suono. */
export function SoundSection() {
  const { t } = useTranslation()
  const s = useSoundSettings()
  const { preview } = useSound()
  const pct = Math.round(s.volume * 100)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <label htmlFor="snd-volume" className="text-[15px] font-medium text-fg">
            {t('settings.sound.volume')}
          </label>
          <output htmlFor="snd-volume" className="w-12 text-right text-[15px] tabular-nums text-muted">
            {pct}%
          </output>
        </div>
        <input
          id="snd-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          disabled={s.muted}
          onChange={(e) => s.set({ volume: Number(e.target.value) / 100 })}
          onPointerUp={() => preview('uiTap')}
          className="block h-11 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <Switch
        checked={s.muted}
        onCheckedChange={(muted) => s.set({ muted })}
        label={t('settings.sound.mute')}
        description={t('settings.sound.muteHint')}
      />

      <div className="border-t border-line pt-4">
        <h3 className="text-[15px] font-semibold">{t('settings.sound.categories')}</h3>
        <div className="mt-1 flex flex-col">
          {CATS.map((c) => (
            <Switch
              key={c}
              checked={s.categories[c]}
              disabled={s.muted}
              onCheckedChange={(v) => s.set({ categories: { [c]: v } })}
              label={t(`settings.sound.${c}`)}
              description={t(`settings.sound.${c}Hint`)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <Switch
          checked={s.vibrate}
          onCheckedChange={(vibrate) => s.set({ vibrate })}
          label={t('settings.sound.vibrate')}
          description={t('settings.sound.vibrateHint')}
        />
      </div>

      <div className="border-t border-line pt-4">
        <h3 className="text-[15px] font-semibold">{t('settings.sound.test')}</h3>
        <p className="text-sm text-muted">{t('settings.sound.testHint')}</p>
        <div className="mt-3 flex flex-col gap-4">
          {CATS.map((c) => (
            <div key={c}>
              <h4 className="mb-2 text-sm font-medium text-muted">{t(`settings.sound.${c}`)}</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SOUND_NAMES.filter((n: SoundName) => categoryOf(n) === c).map((n) => (
                  <Button
                    key={n}
                    disabled={s.muted}
                    icon={<Play size={14} />}
                    className="min-w-0 justify-start py-1.5 px-3 text-left text-sm leading-tight"
                    aria-label={t('settings.sound.play', { name: t(`settings.sound.names.${n}`) })}
                    onClick={() => preview(n)}
                  >
                    <span className="min-w-0 whitespace-normal">{t(`settings.sound.names.${n}`)}</span>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
