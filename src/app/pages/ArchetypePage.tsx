import { useParams } from '@tanstack/react-router'
import { ArchetypeDetail } from '@/features/archetypes/ArchetypeDetail'

export function ArchetypePage() {
  const { archetypeId } = useParams({ strict: false }) as { archetypeId: string }
  return <ArchetypeDetail archetypeId={archetypeId} />
}
