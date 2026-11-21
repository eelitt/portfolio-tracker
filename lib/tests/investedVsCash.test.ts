import { describe, expect, it } from 'vitest'
import {
  buildInvestedVsCashSeries,
  type InvestedSnapshotRow,
} from '@/lib/investedVsCash'

function row(
  partial: Partial<InvestedSnapshotRow> &
    Pick<InvestedSnapshotRow, 'snapshotDate' | 'symbol' | 'assetType'>
): InvestedSnapshotRow {
  return {
    marketValue: 100,
    costBasis: 80,
    isPartial: false,
    ...partial,
  }
}

describe('buildInvestedVsCashSeries', () => {
  it('sums priced spot rows and keeps a series per holding', () => {
    const series = buildInvestedVsCashSeries([
      row({
        snapshotDate: '2026-01-02',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 150,
        costBasis: 100,
      }),
      row({
        snapshotDate: '2026-01-02',
        symbol: 'BTC',
        assetType: 'crypto',
        marketValue: 40,
        costBasis: 50,
      }),
      row({
        snapshotDate: '2026-01-01',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 120,
        costBasis: 100,
      }),
    ])

    expect(series.portfolio).toEqual([
      {
        date: '2026-01-01',
        marketValue: 120,
        costBasis: 100,
        isPartial: false,
      },
      {
        date: '2026-01-02',
        marketValue: 190,
        costBasis: 150,
        isPartial: false,
      },
    ])
    expect(series.byHolding['stock:AAPL']).toEqual([
      {
        date: '2026-01-01',
        marketValue: 120,
        costBasis: 100,
        isPartial: false,
      },
      {
        date: '2026-01-02',
        marketValue: 150,
        costBasis: 100,
        isPartial: false,
      },
    ])
    expect(series.byHolding['crypto:BTC']).toEqual([
      {
        date: '2026-01-02',
        marketValue: 40,
        costBasis: 50,
        isPartial: false,
      },
    ])
  })

  it('ignores cash and futures', () => {
    const series = buildInvestedVsCashSeries([
      row({
        snapshotDate: '2026-01-01',
        symbol: 'Available Cash',
        assetType: 'cash',
        marketValue: 1000,
        costBasis: 1000,
      }),
      row({
        snapshotDate: '2026-01-01',
        symbol: 'BTC',
        assetType: 'future',
        marketValue: 25,
        costBasis: 0,
      }),
      row({
        snapshotDate: '2026-01-01',
        symbol: 'VWCE',
        assetType: 'etf',
        marketValue: 200,
        costBasis: 180,
      }),
    ])

    expect(series.portfolio).toEqual([
      {
        date: '2026-01-01',
        marketValue: 200,
        costBasis: 180,
        isPartial: false,
      },
    ])
    expect(Object.keys(series.byHolding)).toEqual(['etf:VWCE'])
  })

  it('drops an unpriced name from both lines and marks the day partial', () => {
    const series = buildInvestedVsCashSeries([
      row({
        snapshotDate: '2026-01-01',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 110,
        costBasis: 100,
      }),
      row({
        snapshotDate: '2026-01-01',
        symbol: 'NOKIA',
        assetType: 'stock',
        marketValue: 0,
        costBasis: 40,
        isPartial: true,
      }),
    ])

    expect(series.portfolio).toEqual([
      {
        date: '2026-01-01',
        marketValue: 110,
        costBasis: 100,
        isPartial: true,
      },
    ])
    expect(series.byHolding['stock:NOKIA']).toBeUndefined()
  })

  it('treats a non-positive market value as unpriced even when the row is not partial', () => {
    const series = buildInvestedVsCashSeries([
      row({
        snapshotDate: '2026-01-01',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 10,
        costBasis: 8,
      }),
      row({
        snapshotDate: '2026-01-01',
        symbol: 'DEAD',
        assetType: 'stock',
        marketValue: 0,
        costBasis: 30,
        isPartial: false,
      }),
    ])

    expect(series.portfolio[0]).toMatchObject({
      marketValue: 10,
      costBasis: 8,
      isPartial: true,
    })
  })

  it('omits a day when every spot row is unpriced', () => {
    const series = buildInvestedVsCashSeries([
      row({
        snapshotDate: '2026-01-01',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 0,
        costBasis: 100,
        isPartial: true,
      }),
      row({
        snapshotDate: '2026-01-02',
        symbol: 'AAPL',
        assetType: 'stock',
        marketValue: 130,
        costBasis: 100,
      }),
    ])

    expect(series.portfolio.map((p) => p.date)).toEqual(['2026-01-02'])
    expect(series.byHolding['stock:AAPL'].map((p) => p.date)).toEqual([
      '2026-01-02',
    ])
  })

  it('returns empty series for no rows', () => {
    expect(buildInvestedVsCashSeries([])).toEqual({
      portfolio: [],
      byHolding: {},
    })
  })
})
