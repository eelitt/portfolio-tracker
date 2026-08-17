import { describe, it, expect } from 'vitest'
import type { SnapshotPoint } from '../aggregateSnapshots'
import {
  alignSeries,
  clipToDateRange,
  contributionFromDeltas,
  excessReturn,
  seriesDelta,
  trackingError,
  windowReturnPercent,
} from '../benchmarks'

function pt(date: string, marketValue: number): SnapshotPoint {
  return { date, marketValue, costBasis: 0, isPartial: false }
}

describe('alignSeries', () => {
  it('keeps only intersection dates', () => {
    const a = [pt('2026-01-01', 100), pt('2026-01-02', 110), pt('2026-01-03', 120)]
    const b = [pt('2026-01-02', 50), pt('2026-01-03', 55), pt('2026-01-04', 60)]
    expect(alignSeries(a, b)).toEqual([
      { date: '2026-01-02', a: 110, b: 50 },
      { date: '2026-01-03', a: 120, b: 55 },
    ])
  })

  it('returns empty when there is no overlap', () => {
    expect(
      alignSeries([pt('2026-01-01', 1)], [pt('2026-01-02', 2)])
    ).toEqual([])
  })
})

describe('clipToDateRange', () => {
  it('is inclusive on both ends', () => {
    const pts = [
      pt('2026-01-01', 1),
      pt('2026-01-02', 2),
      pt('2026-01-03', 3),
    ]
    expect(clipToDateRange(pts, '2026-01-02', '2026-01-02').map((p) => p.date)).toEqual([
      '2026-01-02',
    ])
  })
})

describe('windowReturnPercent / excessReturn', () => {
  it('computes 10% vs 8% → 2 pp excess', () => {
    const port = [pt('2026-01-01', 100), pt('2026-03-01', 110)]
    const bench = [pt('2026-01-01', 50), pt('2026-03-01', 54)]
    const ex = excessReturn(port, bench)
    expect(ex).not.toBeNull()
    expect(ex!.portfolioPercent).toBeCloseTo(10)
    expect(ex!.benchmarkPercent).toBeCloseTo(8)
    expect(ex!.excessPp).toBeCloseTo(2)
  })

  it('returns null when overlap is empty or a single point', () => {
    expect(excessReturn([pt('2026-01-01', 100)], [pt('2026-01-01', 50)])).toBeNull()
    expect(
      excessReturn([pt('2026-01-01', 100)], [pt('2026-01-02', 50)])
    ).toBeNull()
  })

  it('windowReturnPercent matches first→last', () => {
    expect(
      windowReturnPercent([pt('2026-01-01', 200), pt('2026-01-10', 150)])
    ).toBeCloseTo(-25)
  })
})

describe('trackingError', () => {
  it('is 0 when daily excess is constant', () => {
    // port +2%/day, bench +1%/day → excess +1pp every day
    const port = [pt('2026-01-01', 100), pt('2026-01-02', 102), pt('2026-01-03', 104.04)]
    const bench = [pt('2026-01-01', 100), pt('2026-01-02', 101), pt('2026-01-03', 102.01)]
    const te = trackingError(port, bench)
    expect(te).not.toBeNull()
    expect(te!.dailyStDevPp).toBeCloseTo(0, 8)
    expect(te!.annualizedStDevPp).toBeNull()
    expect(te!.overlapDays).toBe(3)
  })

  it('hides TE with fewer than 3 aligned days', () => {
    expect(
      trackingError(
        [pt('2026-01-01', 100), pt('2026-01-02', 110)],
        [pt('2026-01-01', 100), pt('2026-01-02', 108)]
      )
    ).toBeNull()
  })

  it('does not annualize when overlap < 30 days', () => {
    const port: SnapshotPoint[] = []
    const bench: SnapshotPoint[] = []
    for (let i = 0; i < 10; i++) {
      const d = `2026-01-${String(i + 1).padStart(2, '0')}`
      port.push(pt(d, 100 + i))
      bench.push(pt(d, 100 + i * 0.5))
    }
    const te = trackingError(port, bench)
    expect(te?.annualizedStDevPp).toBeNull()
  })

  it('annualizes when overlap ≥ 30 days', () => {
    const port: SnapshotPoint[] = []
    const bench: SnapshotPoint[] = []
    for (let i = 0; i < 30; i++) {
      const day = i + 1
      const month = day <= 28 ? 1 : 2
      const dom = day <= 28 ? day : day - 28
      const d = `2026-0${month}-${String(dom).padStart(2, '0')}`
      port.push(pt(d, 100 + (i % 3)))
      bench.push(pt(d, 100))
    }
    const te = trackingError(port, bench)
    expect(te?.annualizedStDevPp).not.toBeNull()
    expect(te!.annualizedStDevPp).toBeCloseTo(te!.dailyStDevPp * Math.sqrt(365))
  })
})

describe('contributionFromDeltas', () => {
  it('shares sum to 100% when rows cover the book Δ', () => {
    const rows = contributionFromDeltas(100, [
      { id: 'a', label: 'A', delta: 60 },
      { id: 'b', label: 'B', delta: 40 },
    ])
    const sum = rows.reduce((s, r) => s + (r.sharePercent ?? 0), 0)
    expect(sum).toBeCloseTo(100)
    expect(rows[0].id).toBe('a')
  })

  it('omits % shares when book Δ is ~0', () => {
    const rows = contributionFromDeltas(0, [
      { id: 'a', label: 'A', delta: 10 },
      { id: 'b', label: 'B', delta: -10 },
    ])
    expect(rows.every((r) => r.sharePercent == null)).toBe(true)
  })

  it('cash inflow dominates the book Δ', () => {
    const rows = contributionFromDeltas(100, [
      { id: 'cash:USD', label: 'USD', delta: 100 },
      { id: 'stock:TSLA', label: 'TSLA', delta: 0 },
    ])
    expect(rows[0].id).toBe('cash:USD')
    expect(rows[0].sharePercent).toBeCloseTo(100)
  })

  it('seriesDelta is last − first', () => {
    expect(seriesDelta([pt('2026-01-01', 80), pt('2026-02-01', 125)])).toBe(45)
    expect(seriesDelta([pt('2026-01-01', 80)])).toBeNull()
  })
})
