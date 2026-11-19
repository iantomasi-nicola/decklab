import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { Shell } from './Shell'
import { PagePending } from './PagePending'

const root = createRootRoute({ component: Shell })

const page = <P extends string>(path: P, load: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({
    getParentRoute: () => root,
    path,
    // lazy: ogni pagina è un chunk a parte
    component: lazyRouteComponent(load as never, name as never),
  })

const routeTree = root.addChildren([
  page('/', () => import('./pages/HomePage'), 'HomePage'),
  page('/archetipi', () => import('./pages/ArchetypesPage'), 'ArchetypesPage'),
  page('/archetipi/$archetypeId', () => import('./pages/ArchetypePage'), 'ArchetypePage'),
  page('/mazzi', () => import('./pages/DecksPage'), 'DecksPage'),
  page('/mazzi/$variantId', () => import('./pages/DeckEditorPage'), 'DeckEditorPage'),
  page('/combo', () => import('./pages/CombosPage'), 'CombosPage'),
  page('/combo/$comboId', () => import('./pages/ComboEditorPage'), 'ComboEditorPage'),
  page('/combo/$comboId/guida', () => import('@/features/guide/GuidePage'), 'GuidePage'),
  page('/combo/$comboId/replay', () => import('@/features/replay/ReplayPage'), 'ReplayPage'),
  page('/impara', () => import('./pages/LearnPage'), 'LearnPage'),
  page('/statistiche', () => import('./pages/StatsPage'), 'StatsPage'),
  page('/importa', () => import('./pages/ImportPage'), 'ImportPage'),
  page('/impostazioni', () => import('./pages/SettingsPage'), 'SettingsPage'),
])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingMs: 150,
  defaultPendingMinMs: 200,
  defaultPendingComponent: PagePending,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
