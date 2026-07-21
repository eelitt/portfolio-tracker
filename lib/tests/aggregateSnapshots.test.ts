import { describe, it, expect } from 'vitest'
import {
  aggregateSnapshotSeries,
  seriesRangeChange,
  type SnapshotPoint,
} from '../aggregateSnapshots'

function pt(
  date: string,
  marketValue: number,
  opts?: Partial<SnapshotPoint>
): SnapshotPoint {
  return {
    date,
    marketValue,
    costBasis: opts?.costBasis ?? marketValue * 0.8,
    isPartial: opts?.isPartial ?? false,
  }
}

describe('aggregateSnapshotSeries', () => {
  const now = new Date(Date.UTC(2026, 6, 18)) // 2026-07-18

  it('returns empty for empty input', () => {
    expect(aggregateSnapshotSeries([], 'daily', now)).toEqual([])
  })

  it('daily keeps last 90 days including today', () => {
    const points = [
      pt('2026-01-01', 100),
      pt('2026-04-20', 200), // outside 90d window from Jul 18
      pt('2026-04-21', 210), // still outside? Jul 18 - 89 days = Apr 20
      pt('2026-04-20', 200),
      pt('2026-07-18', 300),
    ]
    // window start = 2026-07-18 - 89 days = 2026-04-20
    const series = aggregateSnapshotSeries(
      [pt('2026-04-19', 190), pt('2026-04-20', 200), pt('2026-07-18', 300)],
      'daily',
      now
    )
    expect(series.map((p) => p.date)).toEqual(['2026-04-20', '2026-07-18'])
  })

  it('monthly keeps last snapshot per month and last 24 months', () => {
    const points = [
      pt('2024-01-05', 50),
      pt('2024-01-20', 55), // last in Jan 2024
      pt('2025-06-01', 100),
      pt('2025-06-15', 110),
      pt('2026-07-01', 200),
      pt('2026-07-18', 220),
    ]
    const series = aggregateSnapshotSeries(points, 'monthly', now)
    // From Aug 2024 through Jul 2026 = 24 months; Jan 2024 drops
    expect(series.find((p) => p.date.startsWith('2024-01'))).toBeUndefined()
    const jun = series.find((p) => p.date.startsWith('2025-06'))
    expect(jun?.marketValue).toBe(110)
    const jul = series.find((p) => p.date.startsWith('2026-07'))
    expect(jul?.marketValue).toBe(220)
  })

  it('yearly keeps last snapshot per year', () => {
    const points = [
      pt('2024-03-01', 10),
      pt('2024-12-31', 20),
      pt('2025-06-01', 30),
      pt('2025-11-01', 40),
      pt('2026-01-01', 50),
    ]
    const series = aggregateSnapshotSeries(points, 'yearly', now)
    expect(series).toHaveLength(3)
    expect(series[0]).toMatchObject({ date: '2024-12-31', marketValue: 20 })
    expect(series[1]).toMatchObject({ date: '2025-11-01', marketValue: 40 })
    expect(series[2]).toMatchObject({ date: '2026-01-01', marketValue: 50 })
  })
})

describe('seriesRangeChange', () => {
  it('returns null for fewer than 2 points', () => {
    expect(seriesRangeChange([])).toBeNull()
    expect(seriesRangeChange([pt('2026-01-01', 100)])).toBeNull()
  })

  it('computes absolute and percent change', () => {
    const change = seriesRangeChange([
      pt('2026-01-01', 100),
      pt('2026-02-01', 150),
    ])
    expect(change?.absolute).toBe(50)
    expect(change?.percent).toBe(50)
  })
})
