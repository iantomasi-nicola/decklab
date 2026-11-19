import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Check from 'lucide-react/icons/check'
import Copy from 'lucide-react/icons/copy'
import Download from 'lucide-react/icons/download'
import Share2 from 'lucide-react/icons/share-2'
import type { ComboDoc } from '@/domain/combo/types'
import { exportCompact, exportText } from '@/domain/combo/text'
import { shareUrl } from '@/domain/share/link'
import { buildQr, type QrResult } from '@/domain/share/qr'
import type { Lang } from '@/domain/types'
import { cardName, useCards } from '@/features/decks/cardData'
import { copyText, downloadText, slug } from '@/features/decks/importHelpers'
import { Banner } from '@/ui/Banner'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { Input } from '@/ui/Input'
import { Segmented } from '@/ui/Segmented'
import { Skeleton } from '@/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/Tabs'
import { toast } from '@/ui/Toast'

export interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** La combo da condividere (documento `combolab.combo`). */
  doc: ComboDoc
  /** Testo del badge di legalità già localizzato, aggiunto all'intestazione del testo numerato (facoltativo). */
  legality?: string
}

/** Pagina di import a cui punta il link (`<origine>/importa#1.…`). */
export const importBaseUrl = (): string => `${window.location.origin}${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/importa`

function CopyBlock({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <h3 className="text-sm font-semibold text-fg">{label}</h3>
      <pre
        tabIndex={0}
        aria-label={t('shareDlg.preview', { what: label })}
        className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted [overflow-wrap:anywhere]"
      >
        {value}
      </pre>
      <Button icon={<Copy size={18} />} onClick={onCopy} className="self-start" data-testid={`share-copy-${label}`}>
        {t('shareDlg.copy')}
      </Button>
    </section>
  )
}

export function ShareDialog({ open, onOpenChange, doc, legality }: ShareDialogProps) {
  const { t, i18n } = useTranslation()
  const cards = useCards()
  const [lang, setLang] = useState<Lang>(i18n.language === 'it' ? 'it' : 'en')
  const [qr, setQr] = useState<QrResult | null>(null)
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => (open ? shareUrl(importBaseUrl(), doc) : ''), [open, doc])
  const title = doc.meta.title[lang] ?? doc.meta.title.it ?? doc.meta.title.en ?? doc.meta.id

  useEffect(() => {
    if (!url) return
    let alive = true
    setQr(null)
    void buildQr(url).then((r) => alive && setQr(r))
    return () => {
      alive = false
    }
  }, [url])

  const texts = useMemo(() => {
    if (cards.status !== 'ready' || !open) return null
    const nameOf = (code: number, l: Lang) => cardName(cards.index.byId(code), l, code)
    return {
      numbered: exportText(doc, { lang, nameOf, legality }),
      compact: exportCompact(doc, { lang, nameOf }),
    }
  }, [cards, doc, lang, legality, open])

  const copy = async (what: string, text: string) => {
    const ok = await copyText(text)
    toast(ok ? t('shareDlg.copied', { what }) : t('shareDlg.copyFailed'), { tone: ok ? 'ok' : 'danger', durationMs: 2500 })
    return ok
  }
  const copyLink = async () => {
    if (await copy(t('shareDlg.link.what'), url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('shareDlg.title')} description={title} className="max-w-xl">
      <Tabs defaultValue="link" data-testid="share-dialog">
        <TabsList aria-label={t('shareDlg.title')}>
          <TabsTrigger value="link">{t('shareDlg.tab.link')}</TabsTrigger>
          <TabsTrigger value="text">{t('shareDlg.tab.text')}</TabsTrigger>
          <TabsTrigger value="file">{t('shareDlg.tab.file')}</TabsTrigger>
        </TabsList>

        <TabsContent value="link" className="flex flex-col gap-4">
          <p className="text-[15px] text-muted">{t('shareDlg.link.lead')}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={url}
              aria-label={t('shareDlg.link.what')}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs sm:flex-1"
              data-testid="share-url"
            />
            <Button
              variant="primary"
              icon={copied ? <Check size={18} /> : <Copy size={18} />}
              onClick={() => void copyLink()}
              className="sm:w-40"
              data-testid="share-copy-link"
            >
              {copied ? t('shareDlg.copiedShort') : t('shareDlg.link.copy')}
            </Button>
          </div>
          {canShare ? (
            <Button icon={<Share2 size={18} />} className="self-start" onClick={() => void navigator.share({ title, url }).catch(() => {})}>
              {t('shareDlg.link.share')}
            </Button>
          ) : null}
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-2 p-4">
            {qr === null ? (
              <Skeleton className="size-56 rounded-md" />
            ) : qr.svg ? (
              <div
                role="img"
                aria-label={t('shareDlg.qr.alt')}
                data-testid="share-qr"
                className="size-56 overflow-hidden rounded-md bg-white p-1 [&>svg]:size-full"
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
            ) : null}
            {qr?.warning ? (
              <Banner
                tone="warn"
                title={t(qr.warning === 'combo.qr.tooLong' ? 'shareDlg.qr.tooLongTitle' : 'shareDlg.qr.longTitle')}
                className="w-full"
              >
                {t(qr.warning === 'combo.qr.tooLong' ? 'shareDlg.qr.tooLong' : 'shareDlg.qr.long', { count: qr.length })}
              </Banner>
            ) : (
              <p className="text-center text-sm text-muted">{t('shareDlg.qr.hint')}</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="text" className="flex flex-col gap-4">
          <Segmented<Lang>
            label={t('shareDlg.text.lang')}
            value={lang}
            onValueChange={setLang}
            options={[
              { value: 'it', label: t('settings.language.it') },
              { value: 'en', label: t('settings.language.en') },
            ]}
          />
          {texts ? (
            <>
              <CopyBlock
                label={t('shareDlg.text.numbered')}
                value={texts.numbered}
                onCopy={() => void copy(t('shareDlg.text.numbered'), texts.numbered)}
              />
              <CopyBlock
                label={t('shareDlg.text.compact')}
                value={texts.compact}
                onCopy={() => void copy(t('shareDlg.text.compact'), texts.compact)}
              />
            </>
          ) : cards.status === 'error' ? (
            <Banner tone="danger" title={t('shareDlg.text.cardsError')} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )}
        </TabsContent>

        <TabsContent value="file" className="flex flex-col gap-4">
          <p className="text-[15px] text-muted">{t('shareDlg.file.lead')}</p>
          <Button
            variant="primary"
            icon={<Download size={18} />}
            className="self-start"
            data-testid="share-download"
            onClick={() => {
              downloadText(`${slug(title)}.combo.json`, JSON.stringify(doc, null, 2), 'application/json')
              toast(t('shareDlg.file.done'), { tone: 'ok', durationMs: 2500 })
            }}
          >
            {t('shareDlg.file.download')}
          </Button>
        </TabsContent>
      </Tabs>
    </Dialog>
  )
}
