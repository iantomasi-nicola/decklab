import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { ComboDoc } from '@/domain/combo/types'
import type { ComboRecord } from '@/data/repo'
import { Field, Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'
import { Switch } from '@/ui/Switch'
import { useEditor } from './editorStore'
import { pickText, withText } from './model'
import { pilesPanelEnabled, useFieldPrefs } from './fieldPrefs'

export function InfoPanel({ doc, variants, mother }: { doc: ComboDoc; variants: ComboRecord[]; mother: ComboRecord | undefined }) {
  const { t, i18n } = useTranslation()
  const store = useEditor.getState()
  const fanPiles = useFieldPrefs((x) => x.fanPiles)
  const pilesPref = useFieldPrefs((x) => x.pilesPanel)
  const meta = (patch: Partial<ComboDoc['meta']>) => store.edit((d) => ({ doc: { ...d, meta: { ...d.meta, ...patch } } }))
  const lang = i18n.language === 'it' ? 'it' : 'en'
  // un solo campo: mostra la lingua corrente (o la prima disponibile) e salva sotto la lingua corrente
  const title = (v: string) => meta({ title: withText(doc.meta.title, lang, v) })
  const from = doc.meta.derivedFrom
  const stepNo = (id: string | null | undefined) => (id ? doc.steps.findIndex((s) => s.id === id) + 1 : 0)
  const nameOf = (r: ComboRecord) => r.name?.[lang] ?? r.name?.it ?? r.name?.en ?? t('combos.untitled')
  return (
    <div className="flex flex-col gap-5">
      <Field label={t('combos.info.title')}>
        {({ id }) => <Input id={id} value={pickText(doc.meta.title, lang, doc.meta.noteLang)} onChange={(e) => title(e.target.value)} data-testid="title" />}
      </Field>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('combos.info.rules')}</h3>
        <Segmented<'TCG' | 'OCG'> label={t('combos.info.rules')} value={doc.meta.rules} onValueChange={(v) => meta({ rules: v })} options={[{ value: 'TCG', label: 'TCG' }, { value: 'OCG', label: 'OCG' }]} />
      </section>
      <section className="flex flex-col gap-1" aria-label={t('combos.prefs.title')}>
        <h3 className="text-sm font-medium">{t('combos.prefs.title')}</h3>
        <Switch
          label={t('combos.prefs.fanPiles')}
          description={t('combos.prefs.fanPilesHint')}
          checked={fanPiles}
          onCheckedChange={(v) => useFieldPrefs.getState().setFanPiles(v)}
        />
        <Switch
          label={t('combos.prefs.pilesPanel')}
          description={t('combos.prefs.pilesPanelHint')}
          checked={pilesPanelEnabled(pilesPref)}
          onCheckedChange={(v) => useFieldPrefs.getState().setPilesPanel(v)}
        />
      </section>
      <Field label={t('combos.info.tags')} hint={t('combos.info.tagsHint')}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            defaultValue={doc.meta.tags.join(', ')}
            key={doc.meta.id}
            onBlur={(e) => meta({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
          />
        )}
      </Field>
      {from ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{t('combos.info.derivedFrom')}</h3>
          <p className="text-[15px] text-muted">
            {mother ? (
              <Link to="/combo/$comboId" params={{ comboId: mother.id }} className="text-accent-text underline">
                {nameOf(mother)}
              </Link>
            ) : (
              (from.title?.[lang] ?? from.title?.it ?? from.title?.en ?? t('combos.untitled'))
            )}{' '}
            {from.afterStep
              ? t('combos.info.afterStepN', { n: ((mother?.payload as ComboDoc | undefined)?.steps ?? []).findIndex((s) => s.id === from.afterStep) + 1 })
              : t('combos.info.fromStart')}
          </p>
        </section>
      ) : null}
      <section className="flex flex-col gap-2" aria-label={t('combos.info.variants')}>
        <h3 className="text-sm font-medium">{t('combos.info.variants')}</h3>
        {variants.length === 0 ? (
          <p className="text-sm text-muted">{t('combos.info.noVariants')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {variants.map((r) => {
              const p = r.payload as ComboDoc
              return (
                <li key={r.id}>
                  <Link to="/combo/$comboId" params={{ comboId: r.id }} className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-line px-3 text-[15px] hover:bg-surface-2">
                    <span className="truncate">{nameOf(r)}</span>
                    <span className="shrink-0 text-sm text-muted">
                      {p.meta?.derivedFrom?.afterStep ? t('combos.info.afterStepN', { n: stepNo(p.meta.derivedFrom.afterStep) }) : t('combos.info.fromStart')}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
