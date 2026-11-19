import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Wand from 'lucide-react/icons/wand-sparkles'
import RotateCcw from 'lucide-react/icons/rotate-ccw'
import { ROLE_PRESETS } from '@/domain/stats'
import type { Archetype } from '@/domain/types'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { SearchField } from '@/ui/SearchField'
import { cn } from '@/ui/cn'
import { toast } from '@/ui/Toast'
import type { DeckRow } from './useStatsModel'
import type { SavedStats } from './statsStore'
import { roleName } from './HandTab'
import { Section } from './parts'

const chip =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 text-[15px] font-semibold transition-colors duration-150'
const chipOff = 'border-line bg-surface-2 text-muted hover:border-line-strong hover:text-fg'
const chipOn = 'border-accent bg-accent text-accent-fg'

export function RolesTab({
  rows,
  saved,
  update,
  name,
  archetype,
}: {
  rows: DeckRow[]
  saved: SavedStats
  update: (fn: (s: SavedStats) => SavedStats) => void
  name: (id: number) => string
  archetype: Archetype | undefined
}) {
  const { t } = useTranslation()
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const [custom, setCustom] = useState('')
  const tagsOf = (id: number) => saved.tags[String(id)] ?? []
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => name(r.id).toLowerCase().includes(q)) : rows
  }, [rows, query, name])

  const setTags = (ids: number[], fn: (tags: string[]) => string[]) =>
    update((s) => {
      const next = { ...s.tags }
      for (const id of ids) {
        const tags = fn(next[String(id)] ?? [])
        if (tags.length) next[String(id)] = tags
        else delete next[String(id)]
      }
      return { ...s, tags: next }
    })

  /** Il ruolo si applica a tutte le selezionate (o solo alla riga se non c'è selezione); se le hanno già tutte, lo toglie. */
  const toggle = (role: string, ids: number[]) => {
    const all = ids.every((id) => tagsOf(id).includes(role))
    setTags(ids, (tags) => (all ? tags.filter((x) => x !== role) : tags.includes(role) ? tags : [...tags, role]))
  }

  const selected = [...sel].filter((id) => rows.some((r) => r.id === id))
  const allVisible = visible.length > 0 && visible.every((r) => sel.has(r.id))
  const customTags = [...new Set(rows.flatMap((r) => tagsOf(r.id)).filter((x) => !(ROLE_PRESETS as readonly string[]).includes(x)))]

  const suggest = () => {
    if (!archetype) return
    const starters = new Set(archetype.starters)
    const extenders = new Set(archetype.extenders)
    let n = 0
    update((s) => {
      const next = { ...s.tags }
      for (const r of rows) {
        if ((next[String(r.id)] ?? []).length) continue
        if (starters.has(r.id)) next[String(r.id)] = ['S1']
        else if (extenders.has(r.id)) next[String(r.id)] = ['C2']
        else continue
        n++
      }
      return { ...s, tags: next }
    })
    toast(n ? t('statsLab.roles.suggested', { count: n }) : t('statsLab.roles.suggestedNone'), { tone: n ? 'ok' : 'info' })
  }

  const reset = () => {
    const before = saved.tags
    update((s) => ({ ...s, tags: {} }))
    setSel(new Set())
    toast(t('statsLab.roles.resetDone'), { action: { label: t('common.undo'), onClick: () => update((s) => ({ ...s, tags: before })) } })
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('statsLab.roles.title')} hint={t('statsLab.roles.hint')}>
        <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-line bg-surface-1 p-4 text-[15px] sm:grid-cols-2 md:p-6">
          {ROLE_PRESETS.map((r) => (
            <div key={r} className="flex min-w-0 gap-3">
              <dt className="w-16 shrink-0 font-semibold text-fg">{r}</dt>
              <dd className="min-w-0 text-muted">{t(`statsLab.roles.${r}.hint`)}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-1 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SearchField value={query} onValueChange={setQuery} placeholder={t('statsLab.roles.search')} label={t('statsLab.roles.search')} className="min-w-0 flex-1 basis-56" />
          <Button variant="secondary" icon={<Wand size={18} />} onClick={suggest} disabled={!archetype || (!archetype.starters.length && !archetype.extenders.length)}>
            {t('statsLab.roles.suggest')}
          </Button>
          <Button variant="ghost" icon={<RotateCcw size={18} />} onClick={reset} disabled={!Object.keys(saved.tags).length}>
            {t('statsLab.roles.reset')}
          </Button>
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-3" role="group" aria-label={t('statsLab.roles.bulk')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-medium text-fg">
              <input
                type="checkbox"
                className="size-5 cursor-pointer accent-[var(--accent)]"
                checked={allVisible}
                onChange={() => setSel(allVisible ? new Set() : new Set(visible.map((r) => r.id)))}
              />
              {t('statsLab.roles.selectAll')}
            </label>
            <span className="text-sm text-muted" aria-live="polite">
              {t('statsLab.roles.selected', { count: selected.length })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={!selected.length}
                title={t(`statsLab.roles.${r}.hint`)}
                onClick={() => toggle(r, selected)}
                className={cn(chip, chipOff, 'disabled:cursor-not-allowed disabled:opacity-40')}
              >
                {r}
              </button>
            ))}
            <form
              className="flex min-w-0 flex-1 basis-56 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const v = custom.trim().toUpperCase().slice(0, 12)
                if (!v || !selected.length) return
                setTags(selected, (tags) => (tags.includes(v) ? tags : [...tags, v]))
                setCustom('')
              }}
            >
              <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t('statsLab.roles.customPlaceholder')} aria-label={t('statsLab.roles.custom')} maxLength={12} disabled={!selected.length} className="min-w-0 flex-1" />
              <Button type="submit" variant="secondary" disabled={!selected.length || !custom.trim()}>
                {t('statsLab.roles.add')}
              </Button>
            </form>
          </div>
        </div>

        <ul className="flex flex-col divide-y divide-line" data-testid="roles-list">
          {visible.map((r) => {
            const tags = tagsOf(r.id)
            const extra = tags.filter((x) => !(ROLE_PRESETS as readonly string[]).includes(x))
            return (
              <li key={r.id} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[44px_minmax(0,1fr)_auto]">
                <label className="inline-flex size-11 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    aria-label={name(r.id)}
                    className="size-5 cursor-pointer accent-[var(--accent)]"
                    checked={sel.has(r.id)}
                    onChange={() =>
                      setSel((cur) => {
                        const n = new Set(cur)
                        if (!n.delete(r.id)) n.add(r.id)
                        return n
                      })
                    }
                  />
                </label>
                <p className="min-w-0 text-[15px] font-medium text-fg">
                  <span className="break-words">{name(r.id)}</span>
                  <span className="ml-2 text-muted">×{r.count}</span>
                </p>
                <div className="col-start-2 mt-2 flex flex-wrap gap-2 lg:col-start-3 lg:mt-0">
                  {ROLE_PRESETS.map((role) => (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={tags.includes(role)}
                      title={t(`statsLab.roles.${role}.hint`)}
                      onClick={() => toggle(role, [r.id])}
                      className={cn(chip, tags.includes(role) ? chipOn : chipOff)}
                    >
                      {role}
                    </button>
                  ))}
                  {extra.map((role) => (
                    <button key={role} type="button" aria-pressed onClick={() => toggle(role, [r.id])} className={cn(chip, chipOn)}>
                      {roleName(t, role)}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        {customTags.length ? <p className="text-sm text-muted">{t('statsLab.roles.customNote', { tags: customTags.join(', ') })}</p> : null}
      </div>
    </div>
  )
}
