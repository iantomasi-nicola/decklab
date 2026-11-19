import { useTranslation } from 'react-i18next'
import Monitor from 'lucide-react/icons/monitor'
import Moon from 'lucide-react/icons/moon'
import Sun from 'lucide-react/icons/sun'
import { useLangPref, type LangPref } from '@/i18n'
import { AccountSection } from '@/features/backup/AccountSection'
import { SoundSection } from '@/features/sound/SoundSection'
import { DataSection } from '@/features/backup/DataSection'
import { Segmented } from '@/ui/Segmented'
import { Surface } from '@/ui/Surface'
import { toast } from '@/ui/Toast'
import { PageHeader } from '../PageHeader'
import { useTheme, type ThemePref } from '../theme'

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Surface className="p-5 md:p-6" role="group" aria-labelledby={id}>
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {description ? <p className="mt-1 max-w-[60ch] text-[15px] text-muted">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </Surface>
  )
}

export function SettingsPage() {
  const { t } = useTranslation()
  const langPref = useLangPref((s) => s.pref)
  const setLang = useLangPref((s) => s.setPref)
  const themePref = useTheme((s) => s.pref)
  const setTheme = useTheme((s) => s.setPref)

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="flex max-w-3xl flex-col gap-4">
        <Section id="set-lang" title={t('settings.language.title')} description={t('settings.language.description')}>
          <Segmented<LangPref>
            label={t('settings.language.title')}
            value={langPref}
            onValueChange={(v) => {
              setLang(v)
              toast(t('toast.languageChanged'), { tone: 'ok' })
            }}
            options={[
              { value: 'system', label: t('settings.language.system') },
              { value: 'it', label: t('settings.language.it') },
              { value: 'en', label: t('settings.language.en') },
            ]}
          />
        </Section>

        <Section id="set-theme" title={t('settings.theme.title')} description={t('settings.theme.description')}>
          <Segmented<ThemePref>
            label={t('settings.theme.title')}
            value={themePref}
            onValueChange={(v) => {
              setTheme(v)
              toast(t('toast.themeChanged'), { tone: 'ok' })
            }}
            options={[
              { value: 'system', label: t('settings.theme.system'), icon: <Monitor size={16} /> },
              { value: 'dark', label: t('settings.theme.dark'), icon: <Moon size={16} /> },
              { value: 'light', label: t('settings.theme.light'), icon: <Sun size={16} /> },
            ]}
          />
        </Section>

        <Section id="set-sound" title={t('settings.sound.title')} description={t('settings.sound.description')}>
          <SoundSection />
        </Section>

        <Section id="set-data" title={t('backup.title')} description={t('backup.description')}>
          <DataSection />
        </Section>

        <Section id="set-account" title={t('account.title')} description={t('account.description')}>
          <AccountSection />
        </Section>

        <Section id="set-about" title={t('settings.about.title')}>
          <p className="max-w-[60ch] text-[15px] text-muted">{t('settings.about.body')}</p>
        </Section>
      </div>
    </>
  )
}
