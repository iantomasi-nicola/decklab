import { useEffect, useMemo, useState } from 'react'
import type { Observable } from 'dexie'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Copy from 'lucide-react/icons/copy'
import GitFork from 'lucide-react/icons/git-fork'
import Plus from 'lucide-react/icons/plus'
import Trash2 from 'lucide-react/icons/trash-2'
import Workflow from 'lucide-react/icons/workflow'
import type { ComboDoc } from '@/domain/combo/types'
import type { Archetype, Variant } from '@/domain/types'
import { copyName, repos, type ComboRecord } from '@/data/repo'
import { useCardData } from '@/features/cards/api'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { EmptyState } from '@/ui/EmptyState'
import { Field, Input } from '@/ui/Input'
import { IconButton } from '@/ui/IconButton'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { createBlankDoc } from './model'

function useLive<T>(make: () => Observable<T>): T | undefined {
  const [v, setV] = useState<T>()
  useEffect(() => {
    const sub = make().subscribe({ next: setV })
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return v
}

const selectCls = 'min-h-11 w-full rounded-md border border-line-strong bg-surface-1 px-3 text-[15px] text-fg hover:border-accent-text'

export function ComboList() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const combos = useLive(() => repos.combos.watchList())
  const archetypes = useLive(() => repos.archetypes.watchList())
  const variants = useLive(() => repos.variants.watchList())
  const [creating, setCreating] = useState(false)

  const nm = (n: { it?: string; en?: string } | undefined) => n?.[lang] ?? n?.it ?? n?.en ?? t('combos.untitled')
  const groups = useMemo(() => {
    const rows = [...(combos ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const byMother = new Map<string, ComboRecord[]>()
    const roots: ComboRecord[] = []
    const ids = new Set(rows.map((r) => r.id))
    for (const r of rows) {
      const m = (r.payload as ComboDoc | undefined)?.meta?.derivedFrom?.comboId
      if (m && ids.has(m)) byMother.set(m, [...(byMother.get(m) ?? []), r])
      else roots.push(r)
    }
    const byArch = new Map<string, ComboRecord[]>()
    for (const r of roots) byArch.set(r.archetypeId, [...(byArch.get(r.archetypeId) ?? []), r])
    return { byMother, byArch }
  }, [combos])

  if (!combos || !archetypes || !variants) return <Skeleton className="h-48 w-full" />

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-tight md:text-[32px]">{t('combos.title')}</h1>
          <p className="mt-2 max-w-[60ch] text-[15px] text-muted md:text-base">{t('combos.lead')}</p>
        </div>
        <Button variant="primary" icon={<Plus size={18} />} onClick={() => setCreating(true)} data-testid="new-combo">
          {t('combos.emptyAction')}
        </Button>
      </header>

      {combos.length === 0 ? (
        <EmptyState
          icon={<Workflow size={28} />}
          title={t('combos.emptyTitle')}
          description={t('combos.emptyBody')}
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('combos.emptyAction')}
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups.byArch.entries()].map(([archId, list]) => {
            const arch = archetypes.find((a) => a.id === archId)
            return (
              <section key={archId} aria-label={nm(arch?.name)}>
                <h2 className="mb-3 text-lg font-semibold">{nm(arch?.name)}</h2>
                <ul className="flex flex-col gap-2">
                  {list.map((r) => (
                    <ComboRow key={r.id} r={r} variants={variants} nm={nm} linked={groups.byMother.get(r.id) ?? []} depth={0} byMother={groups.byMother} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
      {creating ? <NewComboDialog archetypes={archetypes} variants={variants} onClose={() => setCreating(false)} /> : null}
    </>
  )
}

function ComboRow({
  r,
  variants,
  nm,
  linked,
  depth,
  byMother,
}: {
  r: ComboRecord
  variants: Variant[]
  nm: (n: { it?: string; en?: string } | undefined) => string
  linked: ComboRecord[]
  depth: number
  byMother: Map<string, ComboRecord[]>
}) {
  const { t, i18n } = useTranslation()
  const doc = r.payload as ComboDoc | undefined
  const v = variants.find((x) => x.id === r.variantId)
  const steps = doc?.steps?.length ?? 0
  const date = new Date(r.updatedAt).toLocaleDateString(i18n.language)
  const dup = async () => {
    const copy = await repos.combos.duplicate(r.id)
    const d = structuredClone(copy.payload) as ComboDoc
    d.meta.id = copy.id
    d.meta.title = copyName(d.meta.title)
    await repos.combos.update(copy.id, { payload: d, name: d.meta.title })
    toast(t('combos.duplicated'), { tone: 'ok' })
  }
  const del = async () => {
    await repos.combos.softDelete(r.id)
    toast(t('combos.deleted'), { action: { label: t('combos.undo'), onClick: () => void repos.combos.restore(r.id) } })
  }
  return (
    <li>
      <div className="flex items-center gap-1 rounded-md border border-line bg-surface-1 pr-1" style={{ marginLeft: depth * 16 }} data-combo-id={r.id}>
        <Link to="/combo/$comboId" params={{ comboId: r.id }} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md px-4 py-2 hover:bg-surface-2">
          {doc?.meta?.derivedFrom ? <GitFork aria-hidden size={18} className="shrink-0 text-accent-text" /> : null}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[16px] font-medium leading-5 [overflow-wrap:anywhere]">{nm(r.name)}</span>
            <span className="flex flex-wrap gap-x-3 text-sm text-muted">
              <span>{v ? nm(v.name) : t('combos.general')}</span>
              <span>{t('combos.stepsCount', { count: steps })}</span>
              <span>{date}</span>
            </span>
          </span>
        </Link>
        <IconButton label={t('combos.duplicate')} icon={<Copy size={18} />} onClick={() => void dup()} />
        <IconButton label={t('combos.delete')} icon={<Trash2 size={18} />} onClick={() => void del()} />
      </div>
      {linked.length ? (
        <ul className="mt-2 flex flex-col gap-2" aria-label={t('combos.linked')}>
          {linked.map((c) => (
            <ComboRow key={c.id} r={c} variants={variants} nm={nm} linked={byMother.get(c.id) ?? []} depth={depth + 1} byMother={byMother} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function NewComboDialog({ archetypes, variants, onClose }: { archetypes: Archetype[]; variants: Variant[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'it' ? 'it' : 'en'
  const navigate = useNavigate()
  const cards = useCardData()
  const [archId, setArchId] = useState(archetypes[0]?.id ?? '')
  const [newName, setNewName] = useState('')
  const [variantId, setVariantId] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const nm = (n: { it?: string; en?: string } | undefined) => n?.[lang] ?? n?.it ?? n?.en ?? ''
  const own = variants.filter((v) => v.archetypeId === archId)
  const ok = title.trim() !== '' && (archId !== '' || newName.trim() !== '')

  const create = async () => {
    setBusy(true)
    try {
      let aid = archId
      let aName: { it?: string; en?: string }
      if (!aid) {
        const a = await repos.archetypes.create({ name: { [lang]: newName.trim() }, keyCards: [], starters: [], extenders: [] })
        aid = a.id
        aName = a.name
      } else aName = archetypes.find((a) => a.id === aid)!.name
      const variant = own.find((v) => v.id === variantId)
      const rules = variant?.rules ?? 'TCG'
      const banlist =
        variant?.banlist ??
        (() => {
          const list = cards.status === 'ready' ? cards.banlists.filter((b) => b.format === rules) : []
          const last = list.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })).at(-1)
          return { format: rules as string, id: last?.id ?? '' }
        })()
      const id = crypto.randomUUID()
      const titleL = { [lang]: title.trim() }
      const doc = createBlankDoc({
        id,
        title: titleL,
        archetype: { id: aid, name: aName },
        variant: variant ? { id: variant.id, name: variant.name } : null,
        rules,
        banlist,
        deck: variant?.deck ?? { main: [], extra: [], side: [] },
        now: new Date().toISOString(),
      })
      await repos.combos.create({ id, archetypeId: aid, variantId: variant?.id ?? null, name: titleL, tagIds: [], payload: doc })
      void navigate({ to: '/combo/$comboId', params: { comboId: id } })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('combos.new.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!ok} busy={busy} onClick={() => void create()} data-testid="create-combo">
            {t('combos.new.create')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ok && !busy) void create()
        }}
      >
        <Field label={t('combos.new.name')}>
          {({ id }) => <Input id={id} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} data-testid="combo-title" />}
        </Field>
        <Field label={t('combos.new.archetype')}>
          {({ id }) => (
            <select id={id} className={selectCls} value={archId} onChange={(e) => { setArchId(e.target.value); setVariantId('') }} data-testid="combo-archetype">
              {archetypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {nm(a.name)}
                </option>
              ))}
              <option value="">{t('combos.new.newArchetype')}</option>
            </select>
          )}
        </Field>
        {archId === '' ? (
          <Field label={t('combos.new.archetypeName')}>
            {({ id }) => <Input id={id} value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="combo-archetype-name" />}
          </Field>
        ) : (
          <Field label={t('combos.new.scope')} hint={t('combos.new.scopeHint')}>
            {({ id, describedBy }) => (
              <select id={id} aria-describedby={describedBy} className={selectCls} value={variantId} onChange={(e) => setVariantId(e.target.value)} data-testid="combo-variant">
                <option value="">{t('combos.new.general')}</option>
                {own.map((v) => (
                  <option key={v.id} value={v.id}>
                    {nm(v.name)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </form>
    </Dialog>
  )
}
