import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Download from 'lucide-react/icons/download'
import Upload from 'lucide-react/icons/upload'
import Undo2 from 'lucide-react/icons/undo-2'
import {
  BackupError,
  exportBackupJson,
  importBackup,
  parseBackup,
  type BackupFile,
  type ImportMode,
  type ImportResult,
} from '@/data/backup'
import { downloadText } from '@/features/decks/importHelpers'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Segmented } from '@/ui/Segmented'
import { toast } from '@/ui/Toast'
import { BACKUP_KINDS, BACKUP_MAX_BYTES, backupFileName, summarizeBackup } from './backupLogic'

type Outcome = { kind: 'restored'; result: ImportResult; undo: string } | { kind: 'undone' } | { kind: 'error'; message: string }

export function DataSection() {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ backup: BackupFile; name: string } | null>(null)
  const [mode, setMode] = useState<ImportMode>('merge')
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const doExport = async () => {
    setBusy(true)
    try {
      downloadText(backupFileName(), await exportBackupJson(), 'application/json')
      toast(t('backup.exported'), { tone: 'ok' })
    } catch {
      toast(t('backup.exportFailed'), { tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const pick = async (file: File) => {
    setOutcome(null)
    if (file.size > BACKUP_MAX_BYTES) return setOutcome({ kind: 'error', message: t('backup.error.tooBig') })
    try {
      setPending({ backup: parseBackup(await file.text()), name: file.name })
      setMode('merge')
    } catch (e) {
      setOutcome({
        kind: 'error',
        message: e instanceof BackupError ? t('backup.error.invalid', { reason: e.message }) : t('backup.error.read'),
      })
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const undo = await exportBackupJson() // istantanea di prima: serve ad annullare
      const result = await importBackup(pending.backup, mode)
      setPending(null)
      setOutcome({ kind: 'restored', result, undo })
    } catch (e) {
      setPending(null)
      setOutcome({
        kind: 'error',
        message: e instanceof BackupError ? t('backup.error.invalid', { reason: e.message }) : t('backup.error.restore'),
      })
    } finally {
      setBusy(false)
    }
  }

  const undo = async (snapshot: string) => {
    setBusy(true)
    try {
      await importBackup(snapshot, 'replace')
      setOutcome({ kind: 'undone' })
    } catch {
      setOutcome({ kind: 'error', message: t('backup.error.undo') })
    } finally {
      setBusy(false)
    }
  }

  const counts = pending ? summarizeBackup(pending.backup) : null
  const exportedAt = pending?.backup.exportedAt ? new Date(pending.backup.exportedAt) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-2 p-4">
          <div>
            <h3 className="font-semibold text-fg">{t('backup.export.title')}</h3>
            <p className="mt-1 text-[15px] text-muted">{t('backup.export.body')}</p>
          </div>
          <Button
            variant="primary"
            icon={<Download size={18} />}
            busy={busy}
            onClick={() => void doExport()}
            className="mt-auto"
            data-testid="backup-export"
          >
            {t('backup.export.action')}
          </Button>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-2 p-4">
          <div>
            <h3 className="font-semibold text-fg">{t('backup.restore.title')}</h3>
            <p className="mt-1 text-[15px] text-muted">{t('backup.restore.body')}</p>
          </div>
          <Button icon={<Upload size={18} />} onClick={() => fileRef.current?.click()} className="mt-auto" data-testid="backup-restore">
            {t('backup.restore.action')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="backup-file"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void pick(f)
            }}
          />
        </div>
      </div>

      {outcome?.kind === 'restored' ? (
        <Banner
          tone="ok"
          title={t('backup.done.title')}
          action={
            <Button icon={<Undo2 size={18} />} busy={busy} onClick={() => void undo(outcome.undo)} data-testid="backup-undo">
              {t('backup.done.undo')}
            </Button>
          }
        >
          <span data-testid="backup-result">
            {outcome.result.mode === 'merge'
              ? t('backup.done.merge', { written: outcome.result.written, skipped: outcome.result.skipped })
              : t('backup.done.replace', { written: outcome.result.written, removed: outcome.result.removed })}
          </span>
        </Banner>
      ) : null}
      {outcome?.kind === 'undone' ? (
        <Banner tone="info" title={t('backup.undone.title')}>
          {t('backup.undone.body')}
        </Banner>
      ) : null}
      {outcome?.kind === 'error' ? (
        <Banner tone="danger" title={t('backup.error.title')}>
          {outcome.message}
        </Banner>
      ) : null}

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={t('backup.preview.title')}
        description={pending ? pending.name : undefined}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
            <Button
              variant={mode === 'replace' ? 'danger' : 'primary'}
              busy={busy}
              onClick={() => void restore()}
              data-testid="backup-confirm"
            >
              {mode === 'replace' ? t('backup.preview.confirmReplace') : t('backup.preview.confirmMerge')}
            </Button>
          </>
        }
      >
        {counts ? (
          <div className="flex flex-col gap-4" data-testid="backup-preview">
            <p className="text-[15px] text-muted">
              {exportedAt && !Number.isNaN(exportedAt.getTime())
                ? t('backup.preview.date', { date: exportedAt.toLocaleString() })
                : t('backup.preview.noDate')}
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BACKUP_KINDS.map((k) => (
                <div key={k} className="rounded-md border border-line bg-surface-2 px-3 py-2">
                  <dd className="text-xl font-semibold tabular-nums text-fg">{counts[k].alive}</dd>
                  <dt className="text-sm text-muted">{t(`backup.kind.${k}`)}</dt>
                </div>
              ))}
            </dl>
            <Segmented<ImportMode>
              label={t('backup.preview.mode')}
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'merge', label: t('backup.preview.merge') },
                { value: 'replace', label: t('backup.preview.replace') },
              ]}
            />
            {mode === 'merge' ? (
              <p className="text-[15px] text-muted">{t('backup.preview.mergeHint')}</p>
            ) : (
              <Banner tone="warn" title={t('backup.preview.replaceTitle')}>
                {t('backup.preview.replaceHint')}
              </Banner>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
