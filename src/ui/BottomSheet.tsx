import * as RDialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import X from 'lucide-react/icons/x'
import { IconButton } from './IconButton'

export interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children?: ReactNode
}

/** Pannello ancorato in basso (telefono). Si chiude con Esc, tocco sullo sfondo o pulsante. */
export function BottomSheet({ open, onOpenChange, title, description, children }: BottomSheetProps) {
  const { t } = useTranslation()
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="anim-fade fixed inset-0 z-50 bg-scrim" />
        <RDialog.Content className="anim-sheet safe-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-lg border border-b-0 border-line bg-surface-1 shadow-3">
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
          <div className="flex items-center justify-between gap-4 px-4 pt-1">
            <div className="min-w-0 py-2">
              <RDialog.Title className="text-base font-semibold text-fg">{title}</RDialog.Title>
              {description ? <RDialog.Description className="text-sm text-muted">{description}</RDialog.Description> : null}
            </div>
            <RDialog.Close asChild>
              <IconButton label={t('common.close')} icon={<X size={20} />} className="-mr-2" />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}
