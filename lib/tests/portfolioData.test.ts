import { describe, expect, it } from 'vitest'
import { aggregatePreferredPortfolio } from '../convertToPreferred'
import type { EnrichedHolding } from '../types'

function eh(
  overrides: Partial<EnrichedHolding> & Pick<EnrichedHolding, 'symbol'>
): EnrichedHolding {
  return {
    symbol: overrides.symbol,
    asset_type: overrides.asset_type ?? 'stock',
    quantity: overrides.quantity ?? 10,
    avgCost: overrides.avgCost ?? 100,
    totalCost: overrides.totalCost ?? 1000,
    realizedPnl: overrides.realizedPnl ?? 0,
    currency: overrides.currency ?? 'USD',
    currentPrice: overrides.currentPrice ?? 150,
    marketValue: overrides.marketValue ?? 1500,
    unrealizedPnl: overrides.unrealizedPnl ?? 500,
    unrealizedPnlPercent: overrides.unrealizedPnlPercent ?? 50,
    change24h: overrides.change24h ?? 2,
    position24hChange: overrides.position24hChange ?? 30,
    priceAvailable: overrides.priceAvailable ?? true,
  }
}

describe('aggregatePreferredPortfolio', () => {
  it('adds priced assets and cash into MV; 24h from priced assets only', () => {
    const stock = eh({
      symbol: 'AAPL',
      marketValue: 1500,
      totalCost: 1000,
      unrealizedPnl: 500,
      position24hChange: 30,
    })
    const cash = eh({
      symbol: 'Available Cash',
      asset_type: 'cash',
      quantity: 200,
      avgCost: 1,
      totalCost: 200,
      currentPrice: 1,
      marketValue: 200,
      unrealizedPnl: 0,
      position24hChange: 0,
    })

    const r = aggregatePreferredPortfolio([stock], [cash])
    expect(r.totalMarketValue).toBe(1700)
    expect(r.totalCost).toBe(1200)
    expect(r.totalUnrealizedPnl).toBe(500)
    expect(r.total24hChange).toBe(30)
    expect(r.total24hChangePercent).toBeCloseTo((30 / 1670) * 100, 8)
    expect(r.assetCount).toBe(1)
    expect(r.pricedAssetCount).toBe(1)
    expect(r.holdingsCount).toBe(2)
    expect(r.unpricedSymbols).toEqual([])
  })

  it('excludes unpriced assets from MV and uPnL but includes them in cost', () => {
    const priced = eh({
      symbol: 'AAPL',
      marketValue: 1500,
      totalCost: 1000,
      unrealizedPnl: 500,
      position24hChange: 20,
    })
    const unpriced = eh({
      symbol: 'DEAD',
      priceAvailable: false,
      currentPrice: 0,
      marketValue: 0,
      totalCost: 800,
      unrealizedPnl: 0,
      position24hChange: 0,
    })

    const r = aggregatePreferredPortfolio([priced, unpriced], [])
    expect(r.totalMarketValue).toBe(1500)
    expect(r.totalCost).toBe(1800)
    expect(r.totalUnrealizedPnl).toBe(500)
    expect(r.unpricedSymbols).toEqual(['DEAD'])
    expect(r.pricedAssetCount).toBe(1)
    expect(r.assetCount).toBe(2)
  })

  it('returns zero MV and 24h percent when everything is unpriced', () => {
    const unpriced = eh({
      symbol: 'DEAD',
      priceAvailable: false,
      currentPrice: 0,
      marketValue: 0,
      totalCost: 500,
      unrealizedPnl: 0,
      position24hChange: 0,
    })

    const r = aggregatePreferredPortfolio([unpriced], [])
    expect(r.totalMarketValue).toBe(0)
    expect(r.total24hChange).toBe(0)
    expect(r.total24hChangePercent).toBe(0)
    expect(r.totalCost).toBe(500)
    expect(r.pricedAssetCount).toBe(0)
  })
})
