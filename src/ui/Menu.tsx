import * as RDropdown from '@radix-ui/react-dropdown-menu'
import * as RContext from '@radix-ui/react-context-menu'
import type { ReactNode } from 'react'
import { cn } from './cn'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Testo della scorciatoia (es. "Ctrl K"). */
  shortcut?: string
}

const contentCls =
  'anim-pop z-[60] min-w-52 max-w-[calc(100vw-32px)] rounded-md border border-line bg-surface-1 p-1 shadow-2'
const itemCls =
  'flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-sm px-3 text-[15px] text-fg outline-none data-[highlighted]:bg-surface-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-50'

function Items({ items, Item }: { items: MenuItem[]; Item: typeof RDropdown.Item | typeof RContext.Item }) {
  return items.map((it) => (
    <Item
      key={it.id}
      disabled={it.disabled}
      onSelect={it.onSelect}
      className={cn(itemCls, it.danger && 'text-danger')}
    >
      {it.icon ? <span aria-hidden className="inline-flex text-muted">{it.icon}</span> : null}
      <span className="flex-1">{it.label}</span>
      {it.shortcut ? <span className="text-sm text-subtle">{it.shortcut}</span> : null}
    </Item>
  ))
}

/** Menu a tendina: `trigger` deve essere un solo elemento focalizzabile (es. IconButton). */
export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: MenuItem[]; align?: 'start' | 'center' | 'end' }) {
  return (
    <RDropdown.Root>
      <RDropdown.Trigger asChild>{trigger}</RDropdown.Trigger>
      <RDropdown.Portal>
        <RDropdown.Content align={align} sideOffset={6} className={contentCls}>
          <Items items={items} Item={RDropdown.Item} />
        </RDropdown.Content>
      </RDropdown.Portal>
    </RDropdown.Root>
  )
}

/** Menu contestuale: clic destro o pressione prolungata sull'area. Offri sempre anche un'alternativa visibile. */
export function ContextMenu({ children, items }: { children: ReactNode; items: MenuItem[] }) {
  return (
    <RContext.Root>
      <RContext.Trigger asChild>{children}</RContext.Trigger>
      <RContext.Portal>
        <RContext.Content className={contentCls}>
          <Items items={items} Item={RContext.Item} />
        </RContext.Content>
      </RContext.Portal>
    </RContext.Root>
  )
}
