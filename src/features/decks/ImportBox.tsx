import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Upload from 'lucide-react/icons/upload'
import FileUp from 'lucide-react/icons/file-up'
import type { DeckLists, Lang } from '@/domain/types'
import type { CardIndex } from '@/domain/deck/cardIndex'
import type { ImportFormat } from '@/domain/deck/importDetect'
import type { TextListResult } from '@/domain/deck/textList'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { toast } from '@/ui/Toast'
import { Textarea } from './fields'
import { countCards, interpretImport, type SharedImport } from './importHelpers'
import { ReviewDialog } from './ReviewDialog'

export interface ImportInfo {
  format: ImportFormat
  name?: string
}

interface Props {
  /** undefined finché i dati carte non sono pronti (ydk/ydke/JSON funzionano comunque) */
  index?: CardIndex
  lang: Lang
  onDeck: (deck: DeckLists, info: ImportInfo) => void
  /** contenuto già disponibile (condivisione dal sistema) */
  initial?: SharedImport | null
  className?: string
  rows?: number
}

const MAX_FILE = 2 * 1024 * 1024

export function ImportBox({ index, lang, onDeck, initial, className, rows = 4 }: Props) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<{ result: TextListResult; name?: string } | null>(null)
  const pending = useRef<{ text: string; name?: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = useCallback(
    (text: string, name?: string) => {
      setError(null)
      const o = interpretImport(text, index)
      if (o.kind === 'error') {
        if (o.code === 'needsIndex') {
          pending.current = { text, name } // riprova appena i dati carte sono pronti
          setError(t('import.error.needsIndex'))
        } else setError(t(`import.error.${o.code}`))
        return
      }
      pending.current = null
      if (o.kind === 'review') {
        setReview({ result: o.result, name })
        return
      }
      setValue('')
      if (o.fuzzy) toast(t('import.fuzzyDone', { count: o.fuzzy }))
      toast(t('import.done', { count: countCards(o.deck), format: t(`import.format.${o.format}`) }), { tone: 'ok' })
      onDeck(o.deck, { format: o.format, name })
    },
    [index, onDeck, t],
  )

  // dati carte arrivati: riprova un testo in attesa
  useEffect(() => {
    if (index && pending.current) {
      const p = pending.current
      pending.current = null
      run(p.text, p.name)
    }
  }, [index, run])

  // contenuto condiviso dal sistema
  const lastInitial = useRef<SharedImport | null>(null)
  useEffect(() => {
    if (initial && initial !== lastInitial.current) {
      lastInitial.current = initial
      setValue(initial.text.length > 4000 ? '' : initial.text)
      run(initial.text, initial.name)
    }
  }, [initial, run])

  const readFile = async (file: File) => {
    if (file.size > MAX_FILE) {
      setError(t('import.error.tooBig'))
      return
    }
    try {
      run(await file.text(), file.name)
    } catch {
      setError(t('import.error.read'))
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
        setValue(txt)
        run(txt)
      }
    }
  }

  return (
    <section
      aria-label={t('import.title')}
      data-testid="import-box"
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
        'rounded-lg border-2 border-dashed p-4 transition-colors duration-150 md:p-5',
        dragging ? 'border-accent-text bg-accent-soft' : 'border-line-strong bg-surface-1',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-text">
          <Upload size={22} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{t('import.title')}</h2>
          <p className="text-[15px] text-muted">{t('import.lead')}</p>
        </div>
      </div>
      <Textarea
        aria-label={t('import.fieldLabel')}
        aria-describedby={error ? 'import-error' : undefined}
        aria-invalid={error ? true : undefined}
        data-testid="import-input"
        rows={rows}
        className="mt-3 min-h-24 font-mono text-sm"
        placeholder={t('import.placeholder')}
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          const txt = e.clipboardData.getData('text')
          if (txt.trim()) {
            e.preventDefault()
            setValue(txt)
            run(txt)
          }
        }}
      />
      {error ? (
        <p id="import-error" role="alert" className="mt-2 text-[15px] text-danger" data-testid="import-error">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => run(value)} disabled={!value.trim()} data-testid="import-run">
          {t('import.run')}
        </Button>
        <Button icon={<FileUp size={18} />} onClick={() => fileRef.current?.click()}>
          {t('import.chooseFile')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".ydk,.txt,.json,text/plain,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-label={t('import.chooseFile')}
          data-testid="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void readFile(f)
          }}
        />
      </div>
      <p className="mt-3 text-sm text-subtle">{t('import.formats')}</p>

      <ReviewDialog
        open={review !== null}
        result={review?.result ?? null}
        lang={lang}
        onCancel={() => setReview(null)}
        onConfirm={(deck) => {
          const name = review?.name
          setReview(null)
          setValue('')
          toast(t('import.done', { count: countCards(deck), format: t('import.format.text') }), { tone: 'ok' })
          onDeck(deck, { format: 'text', name })
        }}
      />
    </section>
  )
}
