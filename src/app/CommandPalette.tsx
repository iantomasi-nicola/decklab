import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/ui/Dialog'
import { SearchField } from '@/ui/SearchField'
import { NAV } from './nav'
import { usePalette } from './palette'

/** Segnaposto: per ora naviga tra le sezioni. La ricerca di carte e i comandi arrivano nelle fasi successive. */
export function CommandPalette() {
  const { t } = useTranslation()
  const { open, setOpen } = usePalette()
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        usePalette.setState((s) => ({ open: !s.open }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return NAV.filter((n) => !needle || t(`nav.${n.key}`).toLowerCase().includes(needle))
  }, [q, t])

  const go = (to: (typeof NAV)[number]['to']) => {
    setOpen(false)
    void navigate({ to })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} title={t('palette.title')} description={t('palette.description')} hideTitle top>
      <div className="flex flex-col gap-3">
        <SearchField
          label={t('palette.placeholder')}
          placeholder={t('palette.placeholder')}
          value={q}
          onValueChange={setQ}
          autoFocus
          onKeyDown={(e) => {
            const first = results[0]
            if (e.key === 'Enter' && first) go(first.to)
          }}
        />
        {results.length ? (
          <ul aria-label={t('palette.goTo')} className="flex flex-col gap-1">
            {results.map(({ to, key, Icon }) => (
              <li key={to}>
                <button
                  type="button"
                  onClick={() => go(to)}
                  className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left text-[15px] text-fg hover:bg-surface-2"
                >
                  <Icon aria-hidden size={18} className="text-muted" />
                  <span className="flex-1">{t(`nav.${key}`)}</span>
                  <span className="text-sm text-subtle">{t('palette.goTo')}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-[15px] text-muted">{t('palette.empty')}</p>
        )}
        <p className="text-sm text-subtle">{t('palette.hint')}</p>
      </div>
    </Dialog>
  )
}
