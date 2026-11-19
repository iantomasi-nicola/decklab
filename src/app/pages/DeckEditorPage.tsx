import { useParams } from '@tanstack/react-router'
import { DeckEditor } from '@/features/decks/DeckEditor'

export function DeckEditorPage() {
  const { variantId } = useParams({ strict: false }) as { variantId: string }
  return <DeckEditor key={variantId} variantId={variantId} />
}
