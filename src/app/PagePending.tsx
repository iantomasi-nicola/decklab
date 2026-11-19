import { Skeleton } from '@/ui/Skeleton'

/** Mostrato durante il caricamento lazy di una rotta: stesse altezze della pagina finale. */
export function PagePending() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-6 h-9 w-48" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  )
}
