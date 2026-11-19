import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Copy from 'lucide-react/icons/copy'
import Download from 'lucide-react/icons/download'
import Share2 from 'lucide-react/icons/share-2'
import type { PreviewRow, SideCount } from '@/domain/side'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { Lang } from '@/domain/types'
import { cardImageUrl } from '@/features/cards/api'
import { cardName } from '@/features/decks/cardData'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Segmented } from '@/ui/Segmented'
import { Skeleton } from '@/ui/Skeleton'
import { toast } from '@/ui/Toast'
import { renderSidePlanPng, SIZES, type ExportInput, type Orientation } from './exportImage'
import { useSortedRows } from './Preview'

export interface SideExportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle: string
  rows: PreviewRow[]
  outs: readonly SideCount[]
  ins: readonly SideCount[]
  index: CardIndex
  lang: Lang
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'matchup'

export function SideExportDialog({ open, onOpenChange, title, subtitle, rows, outs, ins, index, lang }: SideExportProps) {
  const { t } = useTranslation()
  const [orientation, setOrientation] = useState<Orientation>('portrait')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sorted = useSortedRows(rows, index, lang)
  const run = useRef(0)
  const outN = outs.reduce((n, c) => n + c.count, 0)
  const inN = ins.reduce((n, c) => n + c.count, 0)
  const unbalanced = outN !== inN
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  useEffect(() => {
    if (!open) {
      setPending(null)
      setConfirmed(false)
    }
  }, [open])
  // chiede conferma una sola volta per apertura se OUT ≠ IN
  const guard = (fn: () => void) => () => {
    if (unbalanced && !confirmed) setPending(() => fn)
    else fn()
  }

  const input = useMemo<ExportInput>(() => {
    const nameOf = (id: number) => cardName(index.byId(id), lang, id)
    const lines = (list: readonly SideCount[]) =>
      list.map((c) => ({ name: nameOf(rows.find((r) => r.cardId === c.cardId)?.shownId ?? c.cardId), count: c.count }))
    return {
      title,
      subtitle,
      cards: sorted.map((r) => ({ cardId: r.cardId, shownId: r.shownId, name: nameOf(r.shownId), keep: r.keep, out: r.out, in: r.in })),
      outs: lines(outs),
      ins: lines(ins),
      labels: { out: t('side.export.outTitle'), in: t('side.export.inTitle'), main: t('side.export.mainTitle'), noSwaps: t('side.export.noSwaps'), footer: t('side.export.footer') },
      orientation,
      ...(unbalanced ? { warning: t('side.export.unbalancedImage', { out: outN, in: inN }) } : {}),
      imageUrl: (id) => cardImageUrl(id, 'small'),
    }
  }, [title, subtitle, sorted, rows, outs, ins, index, lang, orientation, t, unbalanced, outN, inN])

  useEffect(() => {
    if (!open) return
    const my = ++run.current
    setBusy(true)
    setFailed(false)
    void renderSidePlanPng(input)
      .then((b) => {
        if (run.current !== my) return
        setBlob(b)
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old)
          return URL.createObjectURL(b)
        })
      })
      .catch(() => run.current === my && setFailed(true))
      .finally(() => run.current === my && setBusy(false))
  }, [open, input])

  useEffect(
    () => () => {
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old)
        return null
      })
    },
    [],
  )

  const fileName = `${t('side.export.fileLabel')}-${slug(title)}-${orientation}.png`
  const canCopy = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write
  const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast(t('side.export.downloaded'), { tone: 'ok' })
  }
  const copy = async () => {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast(t('side.export.copiedToClipboard'), { tone: 'ok' })
    } catch {
      toast(t('side.export.copyFailed'), { tone: 'danger' })
    }
  }
  const share = async () => {
    if (!file) return
    try {
      await navigator.share({ files: [file], title })
    } catch {
      /* annullato dall'utente */
    }
  }

  const { w, h } = SIZES[orientation]
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('side.export.title')}
      description={t('side.export.lead')}
      className="max-w-2xl"
      footer={
        pending ? (
          <>
            <Button
              variant="primary"
              onClick={() => {
                const fn = pending
                setConfirmed(true)
                setPending(null)
                fn()
              }}
              data-testid="export-confirm"
            >
              {t('side.export.confirm')}
            </Button>
            <Button onClick={() => onOpenChange(false)} data-testid="export-back">
              {t('side.export.back')}
            </Button>
          </>
        ) : (
          <>
            <Button icon={<Download size={18} />} variant="primary" disabled={!url || busy} onClick={guard(download)} data-testid="export-download">
              {t('side.export.download')}
            </Button>
            {canCopy ? (
              <Button icon={<Copy size={18} />} disabled={!blob || busy} onClick={guard(() => void copy())} data-testid="export-copy">
                {t('side.export.copy')}
              </Button>
            ) : null}
            {canShare ? (
              <Button icon={<Share2 size={18} />} disabled={busy} onClick={guard(() => void share())} data-testid="export-share">
                {t('side.export.share')}
              </Button>
            ) : null}
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {unbalanced ? (
          <Banner tone="warn" title={pending ? t('side.export.confirmTitle') : t('side.export.unbalancedTitle')} className="border-warn">
            {t('side.export.unbalancedBody', { out: outN, in: inN })}
          </Banner>
        ) : null}
        <Segmented
          label={t('side.export.orientation')}
          fill
          value={orientation}
          onValueChange={setOrientation}
          options={[
            { value: 'portrait', label: t('side.export.portrait') },
            { value: 'landscape', label: t('side.export.landscape') },
          ]}
        />
        <div
          className="relative mx-auto w-full overflow-hidden rounded-md border border-line bg-surface-2"
          style={{ aspectRatio: `${w} / ${h}`, maxHeight: '55dvh', maxWidth: `min(100%, calc(55dvh * ${w} / ${h}))` }}
        >
          {url && !failed ? (
            <img src={url} alt={t('side.export.preview')} data-testid="export-preview" className="absolute inset-0 size-full object-contain" />
          ) : null}
          {busy || (!url && !failed) ? <Skeleton aria-label={t('side.export.creating')} className="absolute inset-0 rounded-none" /> : null}
          {failed ? <p role="alert" className="absolute inset-0 grid place-items-center p-4 text-center text-[15px] text-danger">{t('side.export.failed')}</p> : null}
        </div>
      </div>
    </Dialog>
  )
}
