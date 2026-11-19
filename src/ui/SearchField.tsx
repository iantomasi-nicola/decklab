import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Search from 'lucide-react/icons/search'
import X from 'lucide-react/icons/x'
import { cn } from './cn'
import { inputBase } from './Input'

export interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: string
  onValueChange: (v: string) => void
  /** Nome accessibile (obbligatorio, il segnaposto non basta). */
  label: string
  /** Elemento a destra (es. scorciatoia da tastiera) mostrato quando il campo è vuoto. */
  trailing?: ReactNode
}

export function SearchField({ value, onValueChange, label, trailing, className, ...rest }: SearchFieldProps) {
  const { t } = useTranslation()
  return (
    <div className={cn('relative', className)}>
      <Search aria-hidden size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
      <input
        type="search"
        role="searchbox"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(inputBase, 'pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden')}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          aria-label={t('common.clear')}
          onClick={() => onValueChange('')}
          className="absolute right-0 top-0 inline-flex size-11 cursor-pointer items-center justify-center rounded-md text-muted hover:text-fg"
        >
          <X aria-hidden size={16} />
        </button>
      ) : trailing ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>
      ) : null}
    </div>
  )
}
