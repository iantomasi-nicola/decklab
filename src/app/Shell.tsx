import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Search from 'lucide-react/icons/search'
import Ellipsis from 'lucide-react/icons/ellipsis'
import ChevronRight from 'lucide-react/icons/chevron-right'
import PanelLeftClose from 'lucide-react/icons/panel-left-close'
import PanelLeftOpen from 'lucide-react/icons/panel-left-open'
import { cn } from '@/ui/cn'
import { IconButton } from '@/ui/IconButton'
import { BottomSheet } from '@/ui/BottomSheet'
import { Tooltip } from '@/ui/Tooltip'
import { ToastViewport } from '@/ui/Toast'
import { LogoMark } from './Logo'
import { NAV } from './nav'
import { SyncIndicator } from './SyncIndicator'
import { CommandPalette } from './CommandPalette'
import { usePalette } from './palette'
import { isEditorRoute, useSidebar } from './sidebar'

const linkBase =
  'relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors duration-150'

function SidebarNav({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav.label')} className="flex flex-col gap-1">
      {NAV.map(({ to, key, Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === '/' }}
          aria-label={collapsed ? t(`nav.${key}`) : undefined}
          title={collapsed ? t(`nav.${key}`) : undefined}
          className={cn(linkBase, collapsed && 'justify-center px-0', 'text-muted hover:bg-surface-2 hover:text-fg')}
          activeProps={{ className: 'bg-accent-soft !text-fg' }}
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden
                className={cn('absolute left-0 top-2 bottom-2 w-1 rounded-full', isActive ? 'bg-accent-text' : 'bg-transparent')}
              />
              <Icon aria-hidden size={20} className={isActive ? 'text-accent-text' : undefined} />
              {!collapsed && t(`nav.${key}`)}
            </>
          )}
        </Link>
      ))}
    </nav>
  )
}

function PaletteTrigger({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => usePalette.getState().setOpen(true)}
      aria-label={t('palette.open')}
      className={cn(
        'flex min-h-11 w-full max-w-md cursor-pointer items-center gap-3 rounded-md border border-line bg-surface-1 px-3 text-left text-[15px] text-subtle transition-colors duration-150 hover:border-line-strong',
        className,
      )}
    >
      <Search aria-hidden size={18} />
      <span className="flex-1 truncate">{t('palette.placeholder')}</span>
      <kbd className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-muted">{t('palette.shortcut')}</kbd>
    </button>
  )
}

function BottomNav({ onMore, moreActive }: { onMore: () => void; moreActive: boolean }) {
  const { t } = useTranslation()
  const primary = NAV.filter((n) => n.primary)
  const itemCls = 'relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150'
  return (
    <nav
      aria-label={t('nav.label')}
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1 md:hidden"
    >
      <div className="grid grid-cols-5">
        {primary.map(({ to, key, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className={cn(itemCls, 'text-muted')}
            activeProps={{ className: '!text-accent-text' }}
          >
            {({ isActive }) => (
              <>
                <span aria-hidden className={cn('absolute top-0 h-0.5 w-8 rounded-full', isActive ? 'bg-accent-text' : 'bg-transparent')} />
                <Icon aria-hidden size={22} />
                <span>{t(`nav.${key}`)}</span>
              </>
            )}
          </Link>
        ))}
        <button
          type="button"
          onClick={onMore}
          aria-haspopup="dialog"
          className={cn(itemCls, 'cursor-pointer', moreActive ? 'text-accent-text' : 'text-muted')}
        >
          <span aria-hidden className={cn('absolute top-0 h-0.5 w-8 rounded-full', moreActive ? 'bg-accent-text' : 'bg-transparent')} />
          <Ellipsis aria-hidden size={22} />
          <span>{t('nav.more')}</span>
        </button>
      </div>
    </nav>
  )
}

export function Shell() {
  const { t } = useTranslation()
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const secondary = NAV.filter((n) => !n.primary)
  const moreActive = secondary.some((n) => n.to === pathname)
  // l'editor di mazzo ha bisogno di più larghezza (pannelli affiancati)
  const wide = /^\/(mazzi|combo)\/[^/]+/.test(pathname)
  const pref = useSidebar((x) => x.pref)
  const setPref = useSidebar((x) => x.setPref)
  const collapsed = (pref ?? (isEditorRoute(pathname) ? 'collapsed' : 'expanded')) === 'collapsed'
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setPref(collapsed ? 'expanded' : 'collapsed')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [collapsed, setPref])

  return (
    <div
      className="min-h-dvh md:grid md:grid-cols-[var(--sw)_minmax(0,1fr)]"
      style={{ ['--sw' as string]: collapsed ? '72px' : 'var(--sidebar-w)' }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-md focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg"
      >
        {t('app.skipToContent')}
      </a>

      {/* Sidebar (>= 768) */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface-1 px-3 py-5 md:flex">
        <div className={cn('flex items-center gap-3 px-3', collapsed && 'justify-center px-0')}>
          <LogoMark size={32} />
          {!collapsed && <span className="text-[17px] font-semibold tracking-tight">{t('app.name')}</span>}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className={cn('mt-auto flex flex-col gap-2 px-3', collapsed && 'items-center px-0')}>
          <SyncIndicator showLabel={!collapsed} />
          <IconButton
            label={collapsed ? t('nav.expand') : t('nav.collapse')}
            icon={collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            onClick={() => setPref(collapsed ? 'expanded' : 'collapsed')}
          />
        </div>
      </aside>

      <div className="min-w-0">
        {/* Barra alta */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg">
         <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-2 px-4 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <LogoMark size={28} />
            <span className="font-semibold tracking-tight">{t('app.name')}</span>
          </div>
          <div className="hidden flex-1 py-2 md:flex">
            <PaletteTrigger />
          </div>
          <div className="ml-auto flex items-center md:hidden">
            <SyncIndicator className="w-11 justify-center" />
            <Tooltip label={t('palette.open')}>
              <IconButton
                label={t('palette.open')}
                icon={<Search size={20} />}
                onClick={() => usePalette.getState().setOpen(true)}
              />
            </Tooltip>
          </div>
         </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'mx-auto w-full px-4 pb-[calc(var(--bottomnav-h)+32px+env(safe-area-inset-bottom,0px))] pt-6 outline-none md:px-8 md:pb-12 md:pt-8',
            wide ? 'max-w-[1600px]' : 'max-w-5xl',
          )}
        >
          <Outlet />
        </main>
      </div>

      <BottomNav onMore={() => setMoreOpen(true)} moreActive={moreActive} />

      <BottomSheet open={moreOpen} onOpenChange={setMoreOpen} title={t('nav.moreTitle')}>
        <ul className="flex flex-col gap-1">
          {secondary.map(({ to, key, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-md px-3 text-[16px] text-fg hover:bg-surface-2"
                activeProps={{ className: 'bg-accent-soft' }}
              >
                <Icon aria-hidden size={20} className="text-accent-text" />
                <span className="flex-1">{t(`nav.${key}`)}</span>
                <ChevronRight aria-hidden size={18} className="text-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>

      <CommandPalette />
      <ToastViewport />
    </div>
  )
}
