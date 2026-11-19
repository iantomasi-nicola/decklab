import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Upload from 'lucide-react/icons/upload'
import { parseDeckspace, type DeckspaceProject } from '@/domain/stats'
import type { Variant } from '@/domain/types'
import { repos } from '@/data/repo'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Banner } from '@/ui/Banner'
import { toast } from '@/ui/Toast'
import { defaultBanlistRef, type CardsState } from '@/features/decks/cardData'
import { Textarea } from '@/features/decks/fields'
import { applyImport, planImport, type ImportReport } from './deckspaceIO'
import { savedKey, type SavedStats } from './statsStore'
import type { DeckRow } from './useStatsModel'

export function ImportDialog({
  open,
  onOpenChange,
  variant,
  rows,
  canonical,
  saved,
  update,
  cards,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  variant: Variant | undefined
  rows: DeckRow[]
  canonical: (id: number) => number
  saved: SavedStats
  update: (fn: (s: SavedStats) => SavedStats) => void
  cards: CardsState
  onCreated: (variantId: string) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const parsed = text.trim() ? parseDeckspace(text) : null
  const project: DeckspaceProject | null = parsed?.ok ? parsed.project : null
  const report: ImportReport | null = project && variant ? planImport(project, rows, canonical) : null
  const close = (o: boolean) => {
    if (!o) setText('')
    onOpenChange(o)
  }

  const apply = () => {
    if (!project) return
    update((s) => applyImport(project, rows, canonical, s))
    toast(t('statsLab.import.applied'), { tone: 'ok' })
    close(false)
  }

  const create = async () => {
    if (!project) return
    setBusy(true)
    try {
      let archetypeId = variant?.archetypeId
      if (!archetypeId) {
        const a = await repos.archetypes.create({ name: { it: project.name, en: project.name }, keyCards: [], starters: [], extenders: [] })
        archetypeId = a.id
      }
      const ban = defaultBanlistRef(cards.status === 'ready' ? cards.banlists : [], 'TCG')
      const main = project.cards.flatMap((c) => Array<number>(c.count).fill(c.id))
      const side = project.cards.flatMap((c) => Array<number>(c.sideCount).fill(c.id))
      const v = await repos.variants.create({ archetypeId, name: { it: project.name, en: project.name }, rules: 'TCG', banlist: ban, deck: { main, extra: [], side } })
      const newRows = project.cards.map((c) => ({ id: canonical(c.id), count: c.count }))
      await repos.settings.set(savedKey(v.id), applyImport(project, newRows, canonical))
      toast(t('statsLab.import.created'), { tone: 'ok' })
      onCreated(v.id)
      close(false)
    } catch {
      toast(t('statsLab.import.failed'), { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const errorKey = parsed && !parsed.ok ? parsed.error : null
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('statsLab.import.title')}
      description={t('statsLab.import.description')}
      className="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" disabled={!project || busy} busy={busy} onClick={() => void create()}>
            {t('statsLab.import.createVariant')}
          </Button>
          <Button variant="primary" disabled={!project || !variant || busy} onClick={apply}>
            {t('statsLab.import.apply')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={<Upload size={18} />} onClick={() => file.current?.click()}>
            {t('statsLab.import.chooseFile')}
          </Button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('statsLab.import.chooseFile')}
            data-testid="deckspace-file"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
              e.target.value = ''
            }}
          />
          <span className="text-sm text-muted">{t('statsLab.import.orPaste')}</span>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} aria-label={t('statsLab.import.paste')} placeholder={t('statsLab.import.placeholder')} spellCheck={false} className="min-h-32 font-mono text-sm" data-testid="deckspace-text" />
        {errorKey ? <Banner tone="danger" title={t(`statsLab.import.errors.${errorKey}`)} /> : null}
        {project ? (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4" data-testid="import-preview">
            <p className="text-[15px] font-medium text-fg">{t('statsLab.import.found', { name: project.name, cards: project.cards.length, copies: project.cards.reduce((a, c) => a + c.count, 0), labels: Object.keys(project.labels).length })}</p>
            {report ? (
              <>
                <p className="text-[15px] text-muted">{t('statsLab.import.matched', { matched: report.matched, total: project.cards.length })}</p>
                {report.missing.length ? (
                  <p className="text-[15px] text-muted">{t('statsLab.import.missing', { names: report.missing.map((m) => m.name || m.id).join(', ') })}</p>
                ) : null}
                {report.countDiffs.length ? (
                  <p className="text-[15px] text-muted">{t('statsLab.import.diffs', { names: report.countDiffs.map((d) => `${d.name} (${d.file}→${d.deck})`).join(', ') })}</p>
                ) : null}
              </>
            ) : (
              <p className="text-[15px] text-muted">{t('statsLab.import.noVariant')}</p>
            )}
            {parsed?.ok && parsed.warnings.length ? <p className="text-sm text-muted">{t('statsLab.import.warnings', { count: parsed.warnings.length })}</p> : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  )
}
