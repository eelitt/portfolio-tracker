import type { ChartAssetType, ChartRange } from './types'

/** History caps (daily bars). Crypto via Binance public klines (3Y). */
export const HISTORY_MAX_DAYS: Record<ChartAssetType, number> = {
  crypto: 1095, // ~3 years
  stock: 730,
  etf: 730,
}

export const CHART_RANGE_DAYS: Record<Exclude<ChartRange, 'Max'>, number> = {
  '1M': 30,
  '3M': 90,
  '1Y': 365,
}

export function maxHistoryDays(assetType: ChartAssetType): number {
  return HISTORY_MAX_DAYS[assetType]
}

export function rangeToDays(
  range: ChartRange,
  assetType: ChartAssetType
): number | null {
  if (range === 'Max') return null
  return Math.min(CHART_RANGE_DAYS[range], maxHistoryDays(assetType))
}

/** UTC calendar day start as ISO string for a Date. */
export function toUtcDayIso(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function utcDayStart(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addUtcDays(isoDate: string, days: number): string {
  const dt = utcDayStart(isoDate)
  dt.setUTCDate(dt.getUTCDate() + days)
  return toUtcDayIso(dt)
}

/** Inclusive history window ending today UTC, length maxDays. */
export function fullBackfillFrom(maxDays: number, now = new Date()): string {
  const end = toUtcDayIso(now)
  return addUtcDays(end, -(maxDays - 1))
}

/**
 * Gap fill starts the day after latest stored bar, if that day is before today.
 * Returns null when already up to date (latest is today or in the future).
 */
export function gapFillFrom(
  latestAtIso: string,
  now = new Date()
): string | null {
  const today = toUtcDayIso(now)
  const latestDay = latestAtIso.slice(0, 10)
  if (latestDay >= today) return null
  const next = addUtcDays(latestDay, 1)
  if (next > today) return null
  return next
}
