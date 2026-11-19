import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import ClipboardPaste from 'lucide-react/icons/clipboard-paste'
import FileUp from 'lucide-react/icons/file-up'
import Upload from 'lucide-react/icons/upload'
import type { ComboDoc } from '@/domain/combo/types'
import type { Issue } from '@/domain/combo/validate'
import type { Lang } from '@/domain/types'
import { repos } from '@/data/repo'
import { baseName, countCards } from '@/features/decks/importHelpers'
import { cardName, defaultBanlistRef, useCards } from '@/features/decks/cardData'
import { NativeSelect, Textarea } from '@/features/decks/fields'
import { useObservable } from '@/features/decks/useObservable'
import { Badge } from '@/ui/Badge'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Field, Input } from '@/ui/Input'
import { Surface } from '@/ui/Surface'
import { toast } from '@/ui/Toast'
import { detectImport, issueKey, saveImportedCombo, saveImportedDeck, type Detected } from './importLogic'

const MAX_FILE = 5 * 1024 * 1024
const NEW = '__new__'

type Saved = { kind: 'combo'; id: string; copied: boolean } | { kind: 'deck'; variantId: string }

function IssueList({ issues, tone }: { issues: Issue[]; tone: 'danger' | 'warn' }) {
  const { t } = useTranslation()
  return (
    <ul className={cn('flex flex-col gap-1 text-[15px]', tone === 'danger' ? 'text-danger' : 'text-warn')}>
      {issues.map((i, n) => {
        const { key, params } = issueKey(i)
        return (
          <li key={n} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
            <span className="min-w-0 text-fg [overflow-wrap:anywhere]">
              {t(key, {
                ...params,
                defaultValue: t('importPage.issue.generic', { code: i.code }),
              })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-line bg-surface-2 px-3 py-2">
      <span className="text-xl font-semibold tabular-nums text-fg">{value}</span>
      <span className="text-sm text-muted">{label}</span>
    </div>
  )
}

export function ImportView({ initialText }: { initialText?: string }) {
  const { t, i18n } = useTranslation()
  const lang: Lang = i18n.language === 'it' ? 'it' : 'en'
  const navigate = useNavigate()
  const cards = useCards()
  const index = cards.status === 'ready' ? cards.index : undefined
  const archetypes = useObservable(() => repos.archetypes.watchList(), []).value ?? []
  const variants = useObservable(() => repos.variants.watchList(), []).value ?? []

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | undefined>()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detected, setDetected] = useState<Detected | null>(null)
  const [archId, setArchId] = useState('')
  const [newArch, setNewArch] = useState('')
  const [variantId, setVariantId] = useState('')
  const [deckName, setDeckName] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<Saved | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastRaw = useRef<{ raw: string; name?: string } | null>(null)

  const nm = (n: { it?: string; en?: string } | undefined) => n?.[lang] ?? n?.it ?? n?.en ?? ''

  const run = useCallback(
    (raw: string, name?: string) => {
      lastRaw.current = { raw, name }
      setSaved(null)
      setError(null)
      const d = detectImport(raw, index)
      setDetected(d)
      setFileName(name)
      if (d.kind === 'error') setError(t(`importPage.error.${d.code}`))
    },
    [index, t],
  )

  // testo da URL (#...)
  const seeded = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (initialText && initialText !== seeded.current) {
      seeded.current = initialText
      setText(initialText.length > 600 ? `${initialText.slice(0, 120)}…` : initialText)
      run(initialText)
    }
  }, [initialText, run])

  // i dati carte arrivano dopo: rianalizza i testi che li richiedevano
  useEffect(() => {
    if (index && lastRaw.current && detected?.kind === 'error' && detected.code === 'needsIndex')
      run(lastRaw.current.raw, lastRaw.current.name)
  }, [index, detected, run])

  // valori predefiniti del bersaglio quando cambia il documento riconosciuto
  const doc: ComboDoc | null = detected?.kind === 'combo' && detected.result.ok ? detected.result.doc : null
  useEffect(() => {
    if (doc) {
      const known = archetypes.find((a) => a.id === doc.meta.archetype.id)
      setArchId(known ? known.id : NEW)
      setNewArch(nm(doc.meta.archetype.name))
      const v = variants.find((x) => x.id === doc.meta.variant?.id && x.archetypeId === known?.id)
      setVariantId(v?.id ?? '')
    } else if (detected?.kind === 'deck') {
      setArchId(archetypes[0]?.id ?? NEW)
      setNewArch('')
      setVariantId('')
      setDeckName(baseName(fileName) ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected, archetypes.length === 0])

  const readFile = async (file: File) => {
    if (file.size > MAX_FILE) {
      setError(t('importPage.error.tooBig'))
      setDetected(null)
      return
    }
    try {
      const raw = await file.text()
      setText(raw.length > 600 ? `${raw.slice(0, 120)}…` : raw)
      run(raw, file.name)
    } catch {
      setError(t('importPage.error.read'))
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void readFile(file)
    else {
      const txt = e.dataTransfer.getData('text')
      if (txt.trim()) {
        setText(txt)
        run(txt)
      }
    }
  }

  const paste = async () => {
    try {
      const raw = await navigator.clipboard.readText()
      if (!raw.trim()) return setError(t('importPage.error.clipboardEmpty'))
      setText(raw.length > 600 ? `${raw.slice(0, 120)}…` : raw)
      run(raw)
    } catch {
      setError(t('importPage.error.clipboardDenied'))
    }
  }

  const ownVariants = useMemo(() => variants.filter((v) => v.archetypeId === archId), [variants, archId])
  const newArchName = { [lang]: newArch.trim() }
  const archOk = archId !== NEW || newArch.trim() !== ''

  const saveCombo = async () => {
    if (!doc) return
    setBusy(true)
    try {
      const variant = ownVariants.find((v) => v.id === variantId)
      const r = await saveImportedCombo(repos, doc, {
        archetypeId: archId === NEW ? null : archId,
        newArchetypeName: newArchName,
        variantId: variant?.id ?? null,
        variantName: variant?.name,
      })
      setSaved({ kind: 'combo', ...r })
      toast(t('importPage.saved.combo'), { tone: 'ok' })
    } catch {
      toast(t('importPage.error.save'), { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const saveDeck = async () => {
    if (detected?.kind !== 'deck') return
    setBusy(true)
    try {
      const rules = 'TCG' as const
      const banlist = cards.status === 'ready' ? defaultBanlistRef(cards.banlists, rules) : { format: rules, id: '' }
      const r = await saveImportedDeck(repos, detected.deck, {
        archetypeId: archId === NEW ? null : archId,
        newArchetypeName: newArchName,
        name: { [lang]: deckName.trim() || t('importPage.deck.defaultName') },
        rules,
        banlist,
      })
      setSaved({ kind: 'deck', variantId: r.variantId })
      toast(t('importPage.saved.deck'), { tone: 'ok' })
    } catch {
      toast(t('importPage.error.save'), { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setText('')
    setDetected(null)
    setError(null)
    setSaved(null)
    lastRaw.current = null
    if (fileRef.current) fileRef.current.value = ''
    if (window.location.hash) void navigate({ to: '/importa', hash: '', replace: true })
  }

  const targetFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="imp-arch" className="text-sm font-medium text-fg">
          {t('importPage.target.archetype')}
        </label>
        <NativeSelect
          id="imp-arch"
          data-testid="import-archetype"
          value={archId}
          onChange={(e) => {
            setArchId(e.target.value)
            setVariantId('')
          }}
        >
          {archetypes.map((a) => (
            <option key={a.id} value={a.id}>
              {nm(a.name) || t('importPage.target.unnamed')}
            </option>
          ))}
          <option value={NEW}>{t('importPage.target.newArchetype')}</option>
        </NativeSelect>
      </div>
      {archId === NEW ? (
        <Field label={t('importPage.target.newName')}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={newArch}
              onChange={(e) => setNewArch(e.target.value)}
              data-testid="import-new-archetype"
            />
          )}
        </Field>
      ) : detected?.kind === 'combo' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="imp-variant" className="text-sm font-medium text-fg">
            {t('importPage.target.variant')}
          </label>
          <NativeSelect id="imp-variant" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">{t('importPage.target.general')}</option>
            {ownVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {nm(v.name)}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : (
        <Field label={t('importPage.target.deckName')}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              data-testid="import-deck-name"
            />
          )}
        </Field>
      )}
    </div>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section
        aria-label={t('importPage.drop.title')}
        data-testid="import-drop"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed p-4 transition-colors duration-150 md:p-6',
          dragging ? 'border-accent-text bg-accent-soft' : 'border-line-strong bg-surface-1',
        )}
      >
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
            <Upload size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">{t('importPage.drop.title')}</h2>
            <p className="text-[15px] text-muted">{t('importPage.drop.lead')}</p>
          </div>
        </div>
        <Textarea
          aria-label={t('importPage.field')}
          data-testid="import-text"
          rows={4}
          spellCheck={false}
          className="mt-4 font-mono text-sm"
          placeholder={t('importPage.placeholder')}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            lastRaw.current = null
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => run(text, undefined)} disabled={!text.trim()} data-testid="import-run">
            {t('importPage.run')}
          </Button>
          <Button icon={<FileUp size={18} />} onClick={() => fileRef.current?.click()}>
            {t('importPage.chooseFile')}
          </Button>
          <Button icon={<ClipboardPaste size={18} />} onClick={() => void paste()} data-testid="import-paste">
            {t('importPage.paste')}
          </Button>
          {detected || text ? (
            <Button variant="ghost" onClick={reset}>
              {t('importPage.clear')}
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".json,.ydk,.txt,text/plain,application/json"
            hidden
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void readFile(f)
            }}
          />
        </div>
      </section>

      {error ? (
        <Banner tone="danger" title={error}>
          {detected?.kind === 'error' && detected.code === 'unknown' ? t('importPage.error.unknownHint') : null}
        </Banner>
      ) : null}

      {detected?.kind === 'backup' ? (
        <Banner
          tone="info"
          title={t('importPage.backup.title')}
          action={
            <Link
              to="/impostazioni"
              className="inline-flex min-h-11 items-center rounded-md border border-line bg-surface-2 px-4 text-[15px] font-medium text-fg hover:bg-surface-3"
            >
              {t('importPage.backup.go')}
            </Link>
          }
        >
          {t('importPage.backup.body')}
        </Banner>
      ) : null}

      {detected?.kind === 'combo' && !detected.result.ok ? (
        <Surface className="flex flex-col gap-3 p-4 md:p-5" data-testid="import-invalid">
          <h2 className="text-base font-semibold text-fg">{t('importPage.combo.invalid')}</h2>
          <p className="text-[15px] text-muted">{t('importPage.combo.invalidBody')}</p>
          <IssueList issues={detected.result.errors} tone="danger" />
        </Surface>
      ) : null}

      {detected?.kind === 'combo' && detected.result.ok ? (
        <Surface className="flex flex-col gap-4 p-4 md:p-5" data-testid="import-preview">
          {(() => {
            const d = detected.result.doc
            const r = detected.result
            const title = nm(d.meta.title) || t('combos.untitled')
            const hand = d.setup.hand.required.map((u) => cardName(index?.byId(d.cards[u]!), lang, d.cards[u]))
            return (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-muted">{t('importPage.combo.found')}</p>
                  <h2 className="text-xl font-semibold leading-snug text-fg [overflow-wrap:anywhere]">{title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{d.meta.rules}</Badge>
                    <Badge>
                      {d.meta.banlist.format} {d.meta.banlist.id}
                    </Badge>
                    {r.readOnly ? <Badge tone="warn">{t('combos.readOnly')}</Badge> : null}
                    {r.migratedFrom ? <Badge tone="accent">{t('importPage.combo.migrated', { v: r.migratedFrom })}</Badge> : null}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label={t('importPage.combo.steps')} value={d.steps.length} />
                  <Stat label={t('importPage.combo.branches')} value={d.branches.length} />
                  <Stat label={t('importPage.combo.cards')} value={Object.keys(d.cards).length} />
                </div>
                {hand.length ? (
                  <p className="text-[15px] text-muted">
                    <span className="font-medium text-fg">{t('importPage.combo.hand')}: </span>
                    {hand.join(', ')}
                  </p>
                ) : null}
                {r.readOnly ? (
                  <Banner tone="warn" title={t('combos.readOnly')}>
                    {t('combos.readOnlyBody')}
                  </Banner>
                ) : null}
                {r.warnings.length && !r.readOnly ? (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-fg">{t('importPage.warnings', { count: r.warnings.length })}</h3>
                    <IssueList issues={r.warnings} tone="warn" />
                  </div>
                ) : null}
                {saved?.kind === 'combo' ? null : (
                  <>
                    {targetFields}
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="primary" busy={busy} disabled={!archOk} onClick={() => void saveCombo()} data-testid="import-save">
                        {t('importPage.save.combo')}
                      </Button>
                      <p className="text-sm text-muted">{t('importPage.save.hint')}</p>
                    </div>
                  </>
                )}
              </>
            )
          })()}
        </Surface>
      ) : null}

      {detected?.kind === 'deck' ? (
        <Surface className="flex flex-col gap-4 p-4 md:p-5" data-testid="import-preview">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t('importPage.deck.found')}</p>
            <h2 className="text-xl font-semibold leading-snug text-fg">
              {t('importPage.deck.title', {
                format: t(`import.format.${detected.format}`),
              })}
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Main" value={detected.deck.main.length} />
            <Stat label="Extra" value={detected.deck.extra.length} />
            <Stat label="Side" value={detected.deck.side.length} />
            <Stat label={t('importPage.deck.total')} value={countCards(detected.deck)} />
          </div>
          {detected.unmatched.length || detected.skippedAmbiguous ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-fg">
                {t('importPage.deck.skipped', {
                  count: detected.unmatched.length + detected.skippedAmbiguous,
                })}
              </h3>
              <ul className="flex flex-col gap-1 text-[15px] text-muted">
                {detected.unmatched.slice(0, 8).map((l, i) => (
                  <li key={i} className="[overflow-wrap:anywhere]">
                    «{l}»
                  </li>
                ))}
                {detected.unmatched.length > 8 ? (
                  <li>
                    {t('importPage.deck.more', {
                      count: detected.unmatched.length - 8,
                    })}
                  </li>
                ) : null}
                {detected.skippedAmbiguous ? (
                  <li>
                    {t('importPage.deck.ambiguous', {
                      count: detected.skippedAmbiguous,
                    })}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {saved?.kind === 'deck' ? null : (
            <>
              {targetFields}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" busy={busy} disabled={!archOk} onClick={() => void saveDeck()} data-testid="import-save">
                  {t('importPage.save.deck')}
                </Button>
                <p className="text-sm text-muted">{t('importPage.save.hint')}</p>
              </div>
            </>
          )}
        </Surface>
      ) : null}

      {saved ? (
        <Banner
          tone="ok"
          title={t(saved.kind === 'combo' ? 'importPage.saved.combo' : 'importPage.saved.deck')}
          action={
            <div className="flex flex-wrap gap-2">
              {saved.kind === 'combo' ? (
                <Link
                  to="/combo/$comboId"
                  params={{ comboId: saved.id }}
                  data-testid="import-open"
                  className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-[15px] font-medium text-accent-fg hover:bg-accent-hover"
                >
                  {t('importPage.saved.openCombo')}
                </Link>
              ) : (
                <Link
                  to="/mazzi/$variantId"
                  params={{ variantId: saved.variantId }}
                  data-testid="import-open"
                  className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-[15px] font-medium text-accent-fg hover:bg-accent-hover"
                >
                  {t('importPage.saved.openDeck')}
                </Link>
              )}
              <Button onClick={reset}>{t('importPage.saved.another')}</Button>
            </div>
          }
        >
          {saved.kind === 'combo' && saved.copied ? t('importPage.saved.copied') : null}
        </Banner>
      ) : null}
    </div>
  )
}
