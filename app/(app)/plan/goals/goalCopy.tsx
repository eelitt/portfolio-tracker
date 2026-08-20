'use client'

import SensitiveValue from '@/components/SensitiveValue'
import { formatFiDate, formatHitDate } from './goalFormat'

export function reachedLabel(months: number | null): string {
  if (months == null) return 'never (at this return)'
  if (months <= 0) return 'already there'
  return formatHitDate(months) ?? '—'
}

export function OnTargetDateValue({
  value,
  dateIso,
}: {
  value: string
  dateIso: string
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      <span className="shrink-0">On target date {formatFiDate(dateIso)}:</span>
      <SensitiveValue value={value} className="whitespace-nowrap tabular-nums" />
    </span>
  )
}
