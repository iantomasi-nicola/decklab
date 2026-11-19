import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Table2 from 'lucide-react/icons/table-2'
import ChartColumn from 'lucide-react/icons/chart-column'
import { cn } from '@/ui/cn'

export interface TableData {
  head: string[]
  rows: (string | number)[][]
}

/** Contenitore di un grafico: titolo, sottotitolo e alternativa in tabella (stesso contenuto, accessibile). */
export function ChartCard({
  title,
  subtitle,
  table,
  children,
  className,
  testId,
}: {
  title: string
  subtitle?: string
  table?: TableData
  children: ReactNode
  className?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const [asTable, setAsTable] = useState(false)
  return (
    <section data-testid={testId} className={cn('min-w-0 rounded-lg border border-line bg-surface-1 p-4 md:p-6', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {table ? (
          <button
            type="button"
            aria-pressed={asTable}
            aria-label={asTable ? t('statsLab.chart.showChart') : t('statsLab.chart.showTable')}
            title={asTable ? t('statsLab.chart.showChart') : t('statsLab.chart.showTable')}
            onClick={() => setAsTable((v) => !v)}
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
          >
            {asTable ? <ChartColumn aria-hidden size={20} /> : <Table2 aria-hidden size={20} />}
          </button>
        ) : null}
      </header>
      {asTable && table ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] border-collapse text-[15px]">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-line text-left text-sm text-muted">
                {table.head.map((h, i) => (
                  <th key={i} scope="col" className={cn('py-2 font-medium', i > 0 && 'pl-4 text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className={cn('py-2', ci > 0 ? 'pl-4 text-right tabular-nums' : 'text-fg')}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
