import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Plus from 'lucide-react/icons/plus'
import { repos } from '@/data/repo'
import type { TagRecord } from '@/data/db'
import { Button } from '@/ui/Button'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/Input'
import { toggleIn } from './archetypeMeta'

export function TagChip({ pressed, onClick, children, testId }: { pressed: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors duration-150',
        pressed ? 'border-accent-text bg-accent-soft text-fg' : 'border-line bg-surface-1 text-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

/** Scelta dei tag di un archetipo + creazione di un nuovo tag. */
export function TagPicker({ tags, value, onChange }: { tags: readonly TagRecord[]; value: readonly string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const add = async () => {
    const n = name.trim()
    if (!n) return
    const existing = tags.find((x) => x.name.toLowerCase() === n.toLowerCase())
    const tag = existing ?? (await repos.tags.create({ name: n }))
    if (!value.includes(tag.id)) onChange([...value, tag.id])
    setName('')
  }
  return (
    <div className="flex flex-col gap-3" data-testid="tag-picker">
      {tags.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('archetypes.tags')}>
          {tags.map((tag) => (
            <TagChip key={tag.id} pressed={value.includes(tag.id)} onClick={() => onChange(toggleIn(value, tag.id))}>
              {tag.name}
            </TagChip>
          ))}
        </div>
      ) : (
        <p className="text-[15px] text-muted">{t('archetypes.noTags')}</p>
      )}
      {/* niente <form>: il selettore vive dentro il form del dialog e i form annidati inviavano quello esterno */}
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
          aria-label={t('archetypes.newTag')}
          placeholder={t('archetypes.newTag')}
          maxLength={32}
          autoComplete="off"
        />
        <Button icon={<Plus size={18} />} disabled={!name.trim()} onClick={() => void add()}>
          {t('common.add')}
        </Button>
      </div>
    </div>
  )
}
