import type { ReactNode } from 'react'

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight md:text-[32px]">{title}</h1>
        {lead ? <p className="mt-2 max-w-[60ch] text-[15px] text-muted md:text-base">{lead}</p> : null}
      </div>
      {actions}
    </header>
  )
}
