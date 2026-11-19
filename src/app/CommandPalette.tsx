import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import ArrowLeft from 'lucide-react/icons/arrow-left'
import { Dialog } from '@/ui/Dialog'
import { SearchField } from '@/ui/SearchField'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { useLocalized } from '@/i18n'
import type { Card } from '@/domain/types'
import { CardImage } from '@/features/cards/CardImage'
import { getCardText, searchCards } from '@/features/cards/api'
import { NAV } from './nav'
import { usePalette } from './palette'

type Item =
  | { kind: 'nav'; id: string; nav: (typeof NAV)[number] }
  | { kind: 'card'; id: string; card: Card }

const CARD_LIMIT = 8
const DEBOUNCE_MS = 80

/** Command palette: sezioni dell'app + ricerca carte (IT/EN, tollerante ai refusi, nel worker). Pattern combobox/listbox. */
export function CommandPalette() {
  const { t } = useTranslation()
  const { lang } = useLocalized()
  const { open, setOpen } = usePalette()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [cardsState, setCardsState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState<Card | null>(null)
  const listId = useId()
  const reqRef = useRef(0)

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
    if (!open) {
      setQ('')
      setPicked(null)
    }
  }, [open])

  // ricerca carte (debounce breve; le risposte superate vengono scartate)
  useEffect(() => {
    const needle = q.trim()
    const req = ++reqRef.current
    if (!open || needle.length < 2) {
      setCards([])
      setCardsState('idle')
      return
    }
    setCardsState('loading')
    const timer = setTimeout(() => {
      searchCards(needle, { limit: CARD_LIMIT, lang })
        .then((r) => {
          if (reqRef.current !== req) return
          setCards(r)
          setCardsState('idle')
        })
        .catch(() => {
          if (reqRef.current !== req) return
          setCards([])
          setCardsState('error')
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q, open, lang])

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase()
    const navs = NAV.filter((n) => !needle || t(`nav.${n.key}`).toLowerCase().includes(needle)).map<Item>((nav) => ({ kind: 'nav', id: `nav-${nav.key}`, nav }))
    const cs = cards.map<Item>((card) => ({ kind: 'card', id: `card-${card.id}`, card }))
    return [...navs, ...cs]
  }, [q, t, cards])

  useEffect(() => setActive(0), [q, cards])

  const go = (to: (typeof NAV)[number]['to']) => {
    setOpen(false)
    void navigate({ to })
  }
  const choose = (item: Item | undefined) => {
    if (!item) return
    if (item.kind === 'nav') go(item.nav.to)
    else setPicked(item.card)
  }

  const navItems = items.filter((i): i is Extract<Item, { kind: 'nav' }> => i.kind === 'nav')
  const cardItems = items.filter((i): i is Extract<Item, { kind: 'card' }> => i.kind === 'card')
  const activeId = items[active]?.id
  const nameOf = (c: Card) => (lang === 'it' && c.name.it) || c.name.en
  const otherName = (c: Card) => {
    const other = lang === 'it' ? c.name.en : c.name.it
    return other && other !== nameOf(c) ? other : undefined
  }

  const row = (item: Item, i: number) => {
    const isActive = i === active
    const common = {
      id: `${listId}-${item.id}`,
      role: 'option' as const,
      'aria-selected': isActive,
      onMouseMove: () => setActive(i),
      onClick: () => choose(item),
      className: cn(
        'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left text-[15px] text-fg',
        isActive ? 'bg-surface-2 outline outline-2 -outline-offset-2 outline-focus' : 'hover:bg-surface-2',
      ),
    }
    if (item.kind === 'nav') {
      const { Icon, key } = item.nav
      return (
        <li key={item.id} {...common}>
          <Icon aria-hidden size={18} className="text-muted" />
          <span className="flex-1">{t(`nav.${key}`)}</span>
          <span className="text-sm text-subtle">{t('palette.goTo')}</span>
        </li>
      )
    }
    const c = item.card
    const other = otherName(c)
    return (
      <li key={item.id} {...common} className={cn(common.className, 'py-1.5')}>
        <CardImage id={c.id} alt="" className="w-8 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{nameOf(c)}</span>
          {other ? <span className="block truncate text-sm text-subtle">{other}</span> : null}
        </span>
        <span className="text-sm tabular-nums text-subtle">{c.id}</span>
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} title={t('palette.title')} description={t('palette.description')} hideTitle top>
      {picked ? (
        <CardDetail card={picked} lang={lang} name={nameOf(picked)} other={otherName(picked)} onBack={() => setPicked(null)} />
      ) : (
        <div className="flex flex-col gap-3">
          <SearchField
            label={t('palette.placeholder')}
            placeholder={t('palette.placeholder')}
            value={q}
            onValueChange={setQ}
            autoFocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId ? `${listId}-${activeId}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && items.length) {
                e.preventDefault()
                setActive((a) => (a + 1) % items.length)
              } else if (e.key === 'ArrowUp' && items.length) {
                e.preventDefault()
                setActive((a) => (a - 1 + items.length) % items.length)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(items[active])
              }
            }}
          />
          <div id={listId} role="listbox" aria-label={t('palette.results')} className="flex flex-col gap-1">
            {navItems.length ? (
              <ul role="group" aria-label={t('palette.goTo')} className="flex flex-col gap-1">
                {navItems.map((it) => row(it, items.indexOf(it)))}
              </ul>
            ) : null}
            {cardItems.length ? (
              <ul role="group" aria-label={t('palette.cards')} className="flex flex-col gap-1">
                <li role="presentation" className="px-3 pt-2 text-sm font-medium text-muted">
                  {t('palette.cards')}
                </li>
                {cardItems.map((it) => row(it, items.indexOf(it)))}
              </ul>
            ) : null}
          </div>
          <div aria-live="polite" className="text-center text-[15px] text-muted">
            {cardsState === 'loading' ? t('palette.searching') : null}
            {cardsState === 'error' ? t('palette.cardsError') : null}
            {cardsState === 'idle' && !items.length ? <p className="py-6">{t('palette.empty')}</p> : null}
          </div>
          <p className="text-sm text-subtle">{t('palette.hint')}</p>
        </div>
      )}
    </Dialog>
  )
}

function CardDetail({ card, lang, name, other, onBack }: { card: Card; lang: 'it' | 'en'; name: string; other: string | undefined; onBack: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    setText(undefined)
    getCardText(card.id, lang).then(
      (v) => live && setText(v ?? null),
      () => live && setText(null),
    )
    return () => {
      live = false
    }
  }, [card.id, lang])
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft aria-hidden size={16} /> {t('palette.back')}
        </Button>
      </div>
      <div className="flex gap-4">
        <CardImage id={card.id} size="full" alt={name} className="w-28 shrink-0" eager />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-fg">{name}</h3>
          {other ? <p className="text-sm text-subtle">{other}</p> : null}
          <p className="mt-0.5 text-sm tabular-nums text-subtle">{card.id}</p>
          <p className="mt-3 whitespace-pre-line text-[15px] text-muted" aria-live="polite">
            {text === undefined ? t('common.loading') : (text ?? t('palette.noText'))}
          </p>
        </div>
      </div>
    </div>
  )
}
