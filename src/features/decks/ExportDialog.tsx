import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Copy from 'lucide-react/icons/copy'
import Download from 'lucide-react/icons/download'
import type { DeckLists, Lang } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import { exportDeckText } from '@/domain/deck/exportText'
import { serializeDeckJson } from '@/domain/deck/importDetect'
import { serializeYdk } from '@/domain/deck/ydk'
import { serializeYdke } from '@/domain/deck/ydke'
import { Button } from '@/ui/Button'
import { Dialog } from '@/ui/Dialog'
import { toast } from '@/ui/Toast'
import { copyText, downloadText, slug } from './importHelpers'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  deck: DeckLists
  index: CardIndex
  lang: Lang
  name: string
}

export function ExportDialog({ open, onOpenChange, deck, index, lang, name }: Props) {
  const { t } = useTranslation()
  const out = useMemo(
    () => ({ text: exportDeckText(deck, index, lang), ydke: serializeYdke(deck), ydk: serializeYdk(deck), json: serializeDeckJson(deck) }),
    [deck, index, lang],
  )
  const copy = async (what: string, text: string) => {
    toast((await copyText(text)) ? t('export.copied', { what }) : t('export.copyFailed'), { tone: 'ok', durationMs: 2500 })
  }
  const rows = [
    { key: 'text', title: t('export.text'), hint: t('export.textHint'), value: out.text, multiline: true },
    { key: 'ydke', title: t('export.ydke'), hint: t('export.ydkeHint'), value: out.ydke, multiline: false },
    { key: 'ydk', title: t('export.ydk'), hint: t('export.ydkHint'), value: out.ydk, multiline: true },
    { key: 'json', title: t('export.json'), hint: t('export.jsonHint'), value: out.json, multiline: false },
  ] as const

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('export.title')} description={t('export.lead')} className="max-w-xl">
      <div className="flex flex-col gap-4" data-testid="export-dialog">
        {rows.map((r) => (
          <section key={r.key} className="rounded-lg border border-line p-3">
            <h3 className="font-semibold text-fg">{r.title}</h3>
            <p className="text-sm text-muted">{r.hint}</p>
            <pre
              tabIndex={0}
              aria-label={t('export.preview', { what: r.title })}
              className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-xs text-muted [overflow-wrap:anywhere]"
            >
              {r.value}
            </pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant={r.key === 'text' ? 'primary' : 'secondary'} icon={<Copy size={18} />} onClick={() => void copy(r.title, r.value)} data-testid={`copy-${r.key}`}>
                {t('export.copy')}
              </Button>
              {r.key === 'ydk' ? (
                <Button icon={<Download size={18} />} onClick={() => downloadText(`${slug(name)}.ydk`, r.value)} data-testid="download-ydk">
                  {t('export.download')}
                </Button>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
