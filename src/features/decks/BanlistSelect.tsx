import { useTranslation } from 'react-i18next'
import type { Banlist } from '@/domain/types'
import { banlistGroups, banlistLabel, type BanlistRef } from './cardData'
import { NativeSelect } from './fields'

const enc = (r: BanlistRef) => `${r.format}|${r.id}`
const dec = (v: string): BanlistRef => {
  const [format, ...rest] = v.split('|')
  return { format: format as Banlist['format'], id: rest.join('|') }
}

export function BanlistSelect({
  banlists, value, onChange, label, id, className, disabled,
}: {
  banlists: readonly Banlist[]
  value: BanlistRef
  onChange: (r: BanlistRef) => void
  label: string
  id?: string
  className?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const groups = banlistGroups(banlists)
  const known = banlists.some((b) => b.format === value.format && b.id === value.id)
  return (
    <NativeSelect id={id} aria-label={id ? undefined : label} className={className} disabled={disabled} value={enc(value)} onChange={(e) => onChange(dec(e.target.value))}>
      {!known ? <option value={enc(value)}>{value.id ? t('legality.banlistUnknown', { banlist: banlistLabel(value) }) : t('common.loading')}</option> : null}
      {groups.map((g) => (
        <optgroup key={g.format} label={g.format}>
          {g.items.map((b, i) => (
            <option key={b.id} value={enc(b)}>
              {banlistLabel(b)}
              {i === 0 && g.items.length > 1 ? ` (${t('legality.latest')})` : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </NativeSelect>
  )
}
