import { describe, expect, it } from 'vitest'
import {
  aggregatePreferredPortfolio,
  type PerpHeadlineTerm,
} from '../convertToPreferred'
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

  it('adds perp equity and the mark move, and does not add margin to cost', () => {
    const cash = eh({
      symbol: 'Available Cash',
      asset_type: 'cash',
      quantity: 9000,
      avgCost: 1,
      totalCost: 9000,
      currentPrice: 1,
      marketValue: 9000,
      unrealizedPnl: 0,
      position24hChange: 0,
    })
    const spot = eh({
      symbol: 'AAPL',
      marketValue: 100,
      totalCost: 80,
      unrealizedPnl: 20,
      position24hChange: 1,
    })
    const long: PerpHeadlineTerm = {
      symbol: 'BTC',
      positionSide: 'long',
      valueAdd: 1200,
      unrealizedAdd: 200,
      dayAdd: 200,
      priced: true,
      margin: 1000,
      fundingNet: 0,
      feeNet: 0,
      unrealized: 200,
      equity: 1200,
      leverage: 20,
      availableMargin: 190,
      quantity: 0.2,
      entry: 100000,
      mark: 101000,
      notional: 20200,
      dayChange: 200,
    }

    const r = aggregatePreferredPortfolio([spot], [cash], [long])
    expect(r.totalMarketValue).toBe(10300)
    expect(r.totalCost).toBe(9080)
    expect(r.totalUnrealizedPnl).toBe(220)
    expect(r.total24hChange).toBe(201)
    expect(r.assetCount).toBe(2)
    expect(r.pricedAssetCount).toBe(2)
    expect(r.holdingsCount).toBe(2)
    expect(r.enrichedHoldings.map((h) => h.symbol)).toEqual([
      'AAPL',
      'Available Cash',
    ])
    expect(r.totalMarketValue).not.toBe(10300 + 20200)
  })

  it('keeps an unpriced perp in value and in the partial-price count', () => {
    const cash = eh({
      symbol: 'Available Cash',
      asset_type: 'cash',
      quantity: 9000,
      avgCost: 1,
      totalCost: 9000,
      currentPrice: 1,
      marketValue: 9000,
      unrealizedPnl: 0,
      position24hChange: 0,
    })
    const missing: PerpHeadlineTerm = {
      symbol: 'BTC',
      positionSide: 'long',
      valueAdd: 1000,
      unrealizedAdd: 0,
      dayAdd: 0,
      priced: false,
      margin: 1000,
      fundingNet: 0,
      feeNet: 0,
      unrealized: null,
      equity: 1000,
      leverage: 20,
      availableMargin: null,
      quantity: 0.2,
      entry: 100000,
      mark: null,
      notional: null,
      dayChange: null,
    }

    const r = aggregatePreferredPortfolio([], [cash], [missing])
    expect(r.totalMarketValue).toBe(10000)
    expect(r.totalUnrealizedPnl).toBe(0)
    expect(r.total24hChange).toBe(0)
    expect(r.totalCost).toBe(9000)
    expect(r.unpricedSymbols).toEqual(['BTC long'])
    expect(r.assetCount).toBe(1)
    expect(r.pricedAssetCount).toBe(0)
  })
})
