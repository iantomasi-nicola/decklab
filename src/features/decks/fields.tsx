import type { ComponentProps } from 'react'
import ChevronDown from 'lucide-react/icons/chevron-down'
import { cn } from '@/ui/cn'
import { inputBase } from '@/ui/Input'

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputBase, 'min-h-28 resize-y py-2 leading-relaxed', className)} {...rest} />
}

/** Select nativo con lo stile degli Input (sul telefono usa il selettore del sistema). */
export function NativeSelect({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(inputBase, 'cursor-pointer appearance-none pr-10')} {...rest}>
        {children}
      </select>
      <ChevronDown aria-hidden size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle" />
    </div>
  )
}
