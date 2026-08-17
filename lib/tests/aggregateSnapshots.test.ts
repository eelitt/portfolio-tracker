import { describe, it, expect } from 'vitest'
import {
  aggregateSnapshotSeries,
  colorForHoldingSymbol,
  indexSnapshotSeries,
  mergeSeriesToChartRows,
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

describe('indexSnapshotSeries', () => {
  it('returns null for empty or zero base', () => {
    expect(indexSnapshotSeries([])).toBeNull()
    expect(indexSnapshotSeries([pt('2026-01-01', 0), pt('2026-01-02', 10)])).toBeNull()
  })

  it('rebases first point to 0% and later to relative change', () => {
    const indexed = indexSnapshotSeries([
      pt('2026-01-01', 100),
      pt('2026-01-02', 110),
      pt('2026-01-03', 90),
    ])
    expect(indexed?.map((p) => p.marketValue)).toEqual([0, 10, -10])
  })
})

describe('mergeSeriesToChartRows', () => {
  it('merges dates across series', () => {
    const rows = mergeSeriesToChartRows(
      {
        portfolio: [pt('2026-01-01', 100), pt('2026-01-02', 110)],
        'crypto:BTC': [pt('2026-01-02', 50), pt('2026-01-03', 55)],
      },
      ['portfolio', 'crypto:BTC']
    )
    expect(rows.map((r) => r.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])
    expect(rows[0].portfolio).toBe(100)
    expect(rows[0]['crypto:BTC']).toBeUndefined()
    expect(rows[1].portfolio).toBe(110)
    expect(rows[1]['crypto:BTC']).toBe(50)
  })
})

describe('colorForHoldingSymbol', () => {
  it('is stable and not the portfolio gold slot', () => {
    expect(colorForHoldingSymbol('BTC')).toBe(colorForHoldingSymbol('btc'))
    expect(colorForHoldingSymbol('BTC')).not.toBe(colorForHoldingSymbol('ETH'))
  })
})
