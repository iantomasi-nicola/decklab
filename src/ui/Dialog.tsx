import * as RDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import X from 'lucide-react/icons/x'
import { cn } from './cn'
import { IconButton } from './IconButton'

export interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  /** Nasconde il titolo visivamente (resta per i lettori di schermo). */
  hideTitle?: boolean
  className?: string
  /** Allinea il pannello in alto (utile per il command palette). */
  top?: boolean
}

export function Dialog({ open, onOpenChange, title, description, children, footer, hideTitle, className, top }: DialogProps) {
  const { t } = useTranslation()
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-scrim" />
        <RDialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'anim-pop fixed left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 flex-col rounded-lg border border-line bg-surface-1 shadow-3',
            top ? 'top-[12dvh]' : 'top-1/2 -translate-y-1/2',
            className,
          )}
        >
          <div className={cn('flex items-start justify-between gap-4 px-6 pt-5', hideTitle && 'sr-only')}>
            <div className="min-w-0">
              <RDialog.Title className="text-lg font-semibold text-fg">{title}</RDialog.Title>
            </div>
            <RDialog.Close asChild>
              <IconButton label={t('common.close')} icon={<X size={20} />} className="-mr-3 -mt-2" />
            </RDialog.Close>
          </div>
          {description ? (
            <RDialog.Description className={cn('px-6 pt-1 text-[15px] text-muted', hideTitle && 'sr-only')}>{description}</RDialog.Description>
          ) : null}
          {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div> : null}
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
