/**
 * Pure helpers to turn daily portfolio_snapshots into chart series.
 * Daily / monthly / yearly are display aggregations over one daily source series.
 */

export type SnapshotPoint = {
  date: string // YYYY-MM-DD
  marketValue: number
  costBasis: number
  isPartial: boolean
}

export type SnapshotRangeMode = 'daily' | 'monthly' | 'yearly'

export const DAILY_WINDOW_DAYS = 90
export const MONTHLY_WINDOW_MONTHS = 24

/** Parse YYYY-MM-DD as UTC midnight. */
export function parseSnapshotDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function formatUtcDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Keep the last point in each group (points must be sorted ascending by date).
 */
function lastPerKey(
  points: SnapshotPoint[],
  keyFn: (p: SnapshotPoint) => string
): SnapshotPoint[] {
  const map = new Map<string, SnapshotPoint>()
  for (const p of points) {
    map.set(keyFn(p), p)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, p]) => p)
}

/**
 * Aggregate (and window) a sorted ascending daily series for the chart.
 */
export function aggregateSnapshotSeries(
  points: SnapshotPoint[],
  mode: SnapshotRangeMode,
  /** Optional "today" for tests; defaults to now UTC. */
  now: Date = new Date()
): SnapshotPoint[] {
  if (!points.length) return []

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
  const today = startOfUtcDay(now)

  if (mode === 'daily') {
    const start = new Date(today)
    start.setUTCDate(start.getUTCDate() - (DAILY_WINDOW_DAYS - 1))
    const startStr = formatUtcDate(start)
    return sorted.filter((p) => p.date >= startStr)
  }

  if (mode === 'monthly') {
    const monthKey = (p: SnapshotPoint) => p.date.slice(0, 7) // YYYY-MM
    const byMonth = lastPerKey(sorted, monthKey)
    // Last N months inclusive of current month
    const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    cutoff.setUTCMonth(cutoff.getUTCMonth() - (MONTHLY_WINDOW_MONTHS - 1))
    const cutoffKey = `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, '0')}`
    return byMonth.filter((p) => monthKey(p) >= cutoffKey)
  }

  // yearly: last point per calendar year, all years
  return lastPerKey(sorted, (p) => p.date.slice(0, 4))
}

/**
 * Change from first to last point in a series (absolute + percent).
 */
export function seriesRangeChange(points: SnapshotPoint[]): {
  absolute: number
  percent: number
} | null {
  if (points.length < 2) return null
  const first = points[0].marketValue
  const last = points[points.length - 1].marketValue
  const absolute = last - first
  const percent = first !== 0 ? (absolute / first) * 100 : 0
  return { absolute, percent }
}
