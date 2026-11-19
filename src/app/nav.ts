import type { ComponentType, SVGProps } from 'react'
import House from 'lucide-react/icons/house'
import Layers from 'lucide-react/icons/layers'
import Library from 'lucide-react/icons/library'
import Workflow from 'lucide-react/icons/workflow'
import GraduationCap from 'lucide-react/icons/graduation-cap'
import ChartColumn from 'lucide-react/icons/chart-column'
import ArrowLeftRight from 'lucide-react/icons/arrow-left-right'
import Settings from 'lucide-react/icons/settings'

export type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>

export const NAV = [
  { to: '/', key: 'home', Icon: House, primary: true },
  { to: '/archetipi', key: 'archetypes', Icon: Layers, primary: true },
  { to: '/mazzi', key: 'decks', Icon: Library, primary: true },
  { to: '/combo', key: 'combos', Icon: Workflow, primary: true },
  { to: '/impara', key: 'learn', Icon: GraduationCap, primary: false },
  { to: '/statistiche', key: 'stats', Icon: ChartColumn, primary: false },
  { to: '/side', key: 'side', Icon: ArrowLeftRight, primary: false },
  { to: '/impostazioni', key: 'settings', Icon: Settings, primary: false },
] as const

export type NavItem = (typeof NAV)[number]
