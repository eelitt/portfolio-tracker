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

export type PerformanceScaleMode = 'absolute' | 'indexed'

/**
 * Rebase market values so the first point is 0% and later points are
 * percent change from that start (within the already windowed series).
 * Returns null if the series is empty or the first value is 0.
 */
export function indexSnapshotSeries(
  points: SnapshotPoint[]
): SnapshotPoint[] | null {
  if (!points.length) return null
  const first = points[0].marketValue
  if (!Number.isFinite(first) || first === 0) return null
  return points.map((p) => ({
    ...p,
    marketValue: ((p.marketValue - first) / first) * 100,
    // costBasis unused for indexed display; keep original for debugging
  }))
}

/** Stable chart series id for portfolio totals. */
export const PORTFOLIO_SERIES_ID = 'portfolio'

export function holdingSeriesId(
  assetType: string,
  symbol: string
): string {
  return `${assetType}:${symbol}`
}

/**
 * Build a Recharts-friendly row array: one row per date, columns = series ids.
 * Missing dates for a series leave that key undefined (gaps in the line).
 */
export function mergeSeriesToChartRows(
  seriesMap: Record<string, SnapshotPoint[]>,
  seriesIds: string[]
): Array<Record<string, string | number | boolean | undefined>> {
  const dateSet = new Set<string>()
  for (const id of seriesIds) {
    for (const p of seriesMap[id] ?? []) {
      dateSet.add(p.date)
    }
  }
  const dates = [...dateSet].sort((a, b) => a.localeCompare(b))
  const byIdDate = new Map<string, Map<string, SnapshotPoint>>()
  for (const id of seriesIds) {
    const m = new Map<string, SnapshotPoint>()
    for (const p of seriesMap[id] ?? []) {
      m.set(p.date, p)
    }
    byIdDate.set(id, m)
  }

  return dates.map((date) => {
    const row: Record<string, string | number | boolean | undefined> = { date }
    let anyPartial = false
    for (const id of seriesIds) {
      const p = byIdDate.get(id)?.get(date)
      if (p) {
        row[id] = p.marketValue
        if (p.isPartial) anyPartial = true
      }
    }
    row.isPartial = anyPartial
    return row
  })
}

/** Distinct strokes for multi-line chart (portfolio uses index 0). */
export const PERFORMANCE_SERIES_COLORS = [
  '#c9a227', // gold-ish — portfolio
  '#64748b',
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#f472b6',
  '#fb923c',
  '#2dd4bf',
  '#e879f9',
  '#94a3b8',
  '#fbbf24',
  '#60a5fa',
] as const

export function colorForSeriesIndex(i: number): string {
  return PERFORMANCE_SERIES_COLORS[i % PERFORMANCE_SERIES_COLORS.length]
}

/** Stable color for a holding symbol (skips portfolio gold at index 0). */
export function colorForHoldingSymbol(symbol: string): string {
  const palette = PERFORMANCE_SERIES_COLORS
  if (palette.length < 2) return palette[0] ?? '#64748b'
  let h = 0
  const s = symbol.toUpperCase()
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0
  }
  return palette[1 + (h % (palette.length - 1))]
}
