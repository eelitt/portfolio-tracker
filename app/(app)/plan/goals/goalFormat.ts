/** Calendar `yyyy-mm-dd` as Finnish numeric date (15.1.2026). UTC day, no TZ shift. */
export function formatFiDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fi-FI', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  })
}

/** UTC calendar day `yyyy-mm-dd` after adding whole months (from today unless `now` given). */
export function isoAfterMonths(months: number, now = new Date()): string {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const dt = new Date(Date.UTC(y, m + months, d))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function formatHitDate(months: number | null, now = new Date()): string | null {
  if (months == null) return null
  if (months <= 0) return formatFiDate(isoAfterMonths(0, now))
  return formatFiDate(isoAfterMonths(months, now))
}
