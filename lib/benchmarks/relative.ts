import type { SnapshotPoint } from '@/lib/aggregateSnapshots'
import { alignSeries } from './align'

const MIN_DAYS_ANNUALIZE = 30

export function windowReturnPercent(points: SnapshotPoint[]): number | null {
  if (points.length < 2) return null
  const first = points[0].marketValue
  const last = points[points.length - 1].marketValue
  if (!Number.isFinite(first) || first === 0 || !Number.isFinite(last)) {
    return null
  }
  return ((last - first) / first) * 100
}

export type ExcessReturn = {
  portfolioPercent: number
  benchmarkPercent: number
  excessPp: number
}

/** First→last % on the date intersection. Not time-weighted. */
export function excessReturn(
  portfolio: SnapshotPoint[],
  benchmark: SnapshotPoint[]
): ExcessReturn | null {
  const aligned = alignSeries(portfolio, benchmark)
  if (aligned.length < 2) return null
  const firstA = aligned[0].a
  const lastA = aligned[aligned.length - 1].a
  const firstB = aligned[0].b
  const lastB = aligned[aligned.length - 1].b
  if (firstA === 0 || firstB === 0) return null
  const portfolioPercent = ((lastA - firstA) / firstA) * 100
  const benchmarkPercent = ((lastB - firstB) / firstB) * 100
  return {
    portfolioPercent,
    benchmarkPercent,
    excessPp: portfolioPercent - benchmarkPercent,
  }
}

export type TrackingError = {
  dailyStDevPp: number
  annualizedStDevPp: number | null
  overlapDays: number
}

/**
 * Sample stdev of daily excess returns (percentage points).
 * Needs at least 2 daily excess observations (3 aligned dates).
 * Annualize with √365 only when overlap ≥ 30 calendar points.
 */
export function trackingError(
  portfolioDaily: SnapshotPoint[],
  benchmarkDaily: SnapshotPoint[]
): TrackingError | null {
  const aligned = alignSeries(portfolioDaily, benchmarkDaily)
  if (aligned.length < 3) return null

  const excess: number[] = []
  for (let i = 1; i < aligned.length; i++) {
    const prev = aligned[i - 1]
    const cur = aligned[i]
    if (prev.a === 0 || prev.b === 0) continue
    const rP = (cur.a - prev.a) / prev.a
    const rB = (cur.b - prev.b) / prev.b
    excess.push((rP - rB) * 100)
  }
  if (excess.length < 2) return null

  const n = excess.length
  const mean = excess.reduce((s, x) => s + x, 0) / n
  let sumSq = 0
  for (const x of excess) {
    const d = x - mean
    sumSq += d * d
  }
  const dailyStDevPp = Math.sqrt(sumSq / (n - 1))
  const overlapDays = aligned.length
  const annualizedStDevPp =
    overlapDays >= MIN_DAYS_ANNUALIZE ? dailyStDevPp * Math.sqrt(365) : null

  return { dailyStDevPp, annualizedStDevPp, overlapDays }
}
