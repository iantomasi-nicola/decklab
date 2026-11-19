import { useParams } from '@tanstack/react-router'
import { ComboEditor } from '@/features/combos/ComboEditor'

export function ComboEditorPage() {
  const { comboId } = useParams({ strict: false }) as { comboId: string }
  return <ComboEditor key={comboId} comboId={comboId} />
}
