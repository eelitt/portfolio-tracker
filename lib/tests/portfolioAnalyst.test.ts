import { describe, it, expect } from 'vitest'
import type { EnrichedHolding, Transaction } from '../types'
import {
  filterEnrichedHoldings,
  allocationBreakdown,
  realizedPnlFromTransactions,
  simulateSellFraction,
  simulatePriceShock,
  compactTransactions,
} from '../portfolioAnalyst'

function eh(partial: Partial<EnrichedHolding> & Pick<EnrichedHolding, 'symbol'>): EnrichedHolding {
  return {
    symbol: partial.symbol,
    asset_type: partial.asset_type ?? 'crypto',
    quantity: partial.quantity ?? 10,
    avgCost: partial.avgCost ?? 100,
    totalCost: partial.totalCost ?? (partial.quantity ?? 10) * (partial.avgCost ?? 100),
    realizedPnl: partial.realizedPnl ?? 0,
    currency: partial.currency ?? 'USD',
    currentPrice: partial.currentPrice ?? 100,
    marketValue:
      partial.marketValue ??
      (partial.quantity ?? 10) * (partial.currentPrice ?? 100),
    unrealizedPnl: partial.unrealizedPnl ?? 0,
    unrealizedPnlPercent: partial.unrealizedPnlPercent ?? 0,
    change24h: partial.change24h ?? 0,
    position24hChange: partial.position24hChange ?? 0,
    priceAvailable: partial.priceAvailable ?? true,
  }
}

describe('filterEnrichedHoldings', () => {
  const holdings = [
    eh({
      symbol: 'BTC',
      asset_type: 'crypto',
      quantity: 1,
      avgCost: 40000,
      currentPrice: 50000,
      marketValue: 50000,
      totalCost: 40000,
      unrealizedPnl: 10000,
      unrealizedPnlPercent: 25,
    }),
    eh({
      symbol: 'ETH',
      asset_type: 'crypto',
      quantity: 10,
      avgCost: 3000,
      currentPrice: 2000,
      marketValue: 20000,
      totalCost: 30000,
      unrealizedPnl: -10000,
      unrealizedPnlPercent: -33.33,
    }),
    eh({
      symbol: 'AAPL',
      asset_type: 'stock',
      quantity: 5,
      avgCost: 150,
      currentPrice: 180,
      marketValue: 900,
      totalCost: 750,
      unrealizedPnl: 150,
      unrealizedPnlPercent: 20,
    }),
  ]

  it('filters by max unrealized PnL percent (losers)', () => {
    const result = filterEnrichedHoldings(holdings, {
      maxUnrealizedPnlPercent: -25,
    })
    expect(result).toHaveLength(1)
    expect(result[0].symbol).toBe('ETH')
  })

  it('filters by asset type and sorts by market value desc', () => {
    const result = filterEnrichedHoldings(holdings, {
      assetType: 'crypto',
      sortBy: 'marketValue',
      sortDir: 'desc',
    })
    expect(result.map((h) => h.symbol)).toEqual(['BTC', 'ETH'])
  })

  it('filters by symbol case-insensitively', () => {
    const result = filterEnrichedHoldings(holdings, { symbol: 'btc' })
    expect(result).toHaveLength(1)
    expect(result[0].symbol).toBe('BTC')
  })
})

describe('allocationBreakdown', () => {
  it('weights only priced assets + cash', () => {
    const holdings = [
      eh({
        symbol: 'BTC',
        quantity: 1,
        currentPrice: 50,
        marketValue: 50,
        totalCost: 40,
        priceAvailable: true,
      }),
      eh({
        symbol: 'DEAD',
        quantity: 100,
        currentPrice: 0,
        marketValue: 0,
        totalCost: 999,
        priceAvailable: false,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      }),
      eh({
        symbol: 'Available Cash',
        asset_type: 'cash',
        quantity: 50,
        avgCost: 1,
        totalCost: 50,
        currentPrice: 1,
        marketValue: 50,
        priceAvailable: true,
      }),
    ]

    const alloc = allocationBreakdown(holdings)
    expect(alloc.totalMarketValue).toBe(100)
    expect(alloc.unpricedSymbols).toEqual(['DEAD'])
    expect(alloc.bySymbol.find((s) => s.key === 'BTC')?.weightPercent).toBe(50)
    expect(alloc.byAssetType.find((s) => s.key === 'cash')?.weightPercent).toBe(50)
  })
})

describe('realizedPnlFromTransactions', () => {
  const txs: Transaction[] = [
    {
      symbol: 'SOL',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 10,
      unit_price: 100,
      executed_at: '2025-06-01T00:00:00Z',
    },
    {
      symbol: 'SOL',
      asset_type: 'crypto',
      action: 'sell',
      quantity: 4,
      unit_price: 150,
      executed_at: '2025-08-01T00:00:00Z',
    },
    {
      symbol: 'SOL',
      asset_type: 'crypto',
      action: 'sell',
      quantity: 2,
      unit_price: 80,
      executed_at: '2026-02-01T00:00:00Z',
    },
    {
      symbol: 'AAPL',
      asset_type: 'stock',
      action: 'buy',
      quantity: 10,
      unit_price: 100,
      executed_at: '2025-01-01T00:00:00Z',
    },
    {
      symbol: 'AAPL',
      asset_type: 'stock',
      action: 'sell',
      quantity: 5,
      unit_price: 120,
      executed_at: '2025-03-01T00:00:00Z',
    },
  ]

  it('computes total realized across all sells', () => {
    // SOL: 4*(150-100)=200; 2*(80-100)=-40 → 160
    // AAPL: 5*(120-100)=100
    const result = realizedPnlFromTransactions(txs)
    expect(result.totalRealizedPnl).toBe(260)
    expect(result.sellCount).toBe(3)
  })

  it('filters by year and asset type', () => {
    const result = realizedPnlFromTransactions(txs, {
      year: 2025,
      assetType: 'crypto',
    })
    expect(result.totalRealizedPnl).toBe(200)
    expect(result.bySymbol).toHaveLength(1)
    expect(result.bySymbol[0].symbol).toBe('SOL')
  })

  it('filters by symbol', () => {
    const result = realizedPnlFromTransactions(txs, { symbol: 'AAPL' })
    expect(result.totalRealizedPnl).toBe(100)
  })
})

describe('simulateSellFraction', () => {
  const holdings = [
    eh({
      symbol: 'BTC',
      quantity: 2,
      avgCost: 40000,
      totalCost: 80000,
      currentPrice: 50000,
      marketValue: 100000,
      unrealizedPnl: 20000,
      unrealizedPnlPercent: 25,
      priceAvailable: true,
    }),
  ]

  it('sells 40% and reports implied realized', () => {
    const result = simulateSellFraction(holdings, { symbol: 'BTC', fraction: 0.4 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.soldQuantity).toBe(0.8)
    expect(result.impliedRealized).toBe(8000) // 0.8 * (50000 - 40000)
    expect(result.after.holdingsCount).toBe(1)
    expect(result.after.totalMarketValue).toBe(60000) // 1.2 * 50000
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('errors on unknown symbol', () => {
    const result = simulateSellFraction(holdings, { symbol: 'ETH', fraction: 0.5 })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/No open position/)
  })

  it('errors when unpriced', () => {
    const unpriced = [
      eh({
        symbol: 'XYZ',
        priceAvailable: false,
        currentPrice: 0,
        marketValue: 0,
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
      }),
    ]
    const result = simulateSellFraction(unpriced, { symbol: 'XYZ', fraction: 0.5 })
    expect(result.ok).toBe(false)
  })

  it('rejects invalid fraction', () => {
    const result = simulateSellFraction(holdings, { symbol: 'BTC', fraction: 1.5 })
    expect(result.ok).toBe(false)
  })
})

describe('simulatePriceShock', () => {
  const holdings = [
    eh({
      symbol: 'BTC',
      quantity: 1,
      avgCost: 40000,
      totalCost: 40000,
      currentPrice: 100000,
      marketValue: 100000,
      unrealizedPnl: 60000,
      unrealizedPnlPercent: 150,
    }),
    eh({
      symbol: 'ETH',
      quantity: 10,
      avgCost: 2000,
      totalCost: 20000,
      currentPrice: 3000,
      marketValue: 30000,
      unrealizedPnl: 10000,
      unrealizedPnlPercent: 50,
    }),
  ]

  it('applies 50% drawdown to selected symbols', () => {
    const result = simulatePriceShock(holdings, [
      { symbol: 'BTC', priceChangePercent: -50 },
      { symbol: 'ETH', priceChangePercent: -50 },
    ])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.after.totalMarketValue).toBe(65000) // 50k + 15k
    expect(result.before.totalMarketValue).toBe(130000)
  })

  it('errors when no shocks apply', () => {
    const result = simulatePriceShock(holdings, [
      { symbol: 'DOGE', priceChangePercent: -50 },
    ])
    expect(result.ok).toBe(false)
  })
})

describe('compactTransactions', () => {
  const txs: Transaction[] = [
    {
      symbol: 'BTC',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 1,
      unit_price: 100,
      executed_at: '2026-01-02T00:00:00Z',
    },
    {
      symbol: 'ETH',
      asset_type: 'crypto',
      action: 'sell',
      quantity: 2,
      unit_price: 200,
      executed_at: '2026-01-01T00:00:00Z',
    },
  ]

  it('filters and sorts newest first', () => {
    const result = compactTransactions(txs, { assetType: 'crypto', limit: 10 })
    expect(result).toHaveLength(2)
    expect(result[0].symbol).toBe('BTC')
    expect(result[0].unitPrice).toBe(100)
  })
})
