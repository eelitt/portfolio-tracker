import { describe, it, expect } from 'vitest'
import { calculateHoldings, enrichHoldings, type Transaction} from './calculatePortfolio'
import { Holding, EnrichedHolding } from './types'

describe('calculateHoldings', () => {
  it('should return empty array when no transactions', () => {
    const holdings = calculateHoldings([])
    expect(holdings).toHaveLength(0)
  })

  it('should calculate correct holdings for simple buy', () => {
    const transactions: Transaction[] = [
      {
        symbol: 'AAPL',
        asset_type: 'stock',
        action: 'buy',
        quantity: 10,
        unit_price: 150,
        executed_at: '2025-01-01',
      },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].avgCost).toBe(150)
    expect(holdings[0].realizedPnl).toBe(0)
  })

  it('should calculate weighted average cost with multiple buys', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 200, executed_at: '2025-01-02' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(20)
    expect(holdings[0].avgCost).toBe(150)
  })

  it('should calculate realized P&L correctly on partial sell', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 5, unit_price: 150, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(5)
    expect(holdings[0].realizedPnl).toBe(250) // 5 × (150 - 100)
  })

  it('should remove holding when fully sold', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 10, unit_price: 120, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(0)
  })

  it('should handle selling more than owned without going negative', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 5, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 10, unit_price: 150, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(0)
  })

  it('should handle multiple buys and multiple sells correctly', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 120, executed_at: '2025-01-02' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 8, unit_price: 130, executed_at: '2025-01-03' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 5, unit_price: 140, executed_at: '2025-01-04' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(7)
    // Realized P&L: 8*(130-110) + 5*(140-110) = 160 + 150 = 310
    expect(holdings[0].realizedPnl).toBe(310)
  })

  it('should handle crypto with decimal quantities', () => {
    const transactions: Transaction[] = [
      { symbol: 'BTC', asset_type: 'crypto', action: 'buy', quantity: 0.5, unit_price: 60000, executed_at: '2025-01-01' },
      { symbol: 'BTC', asset_type: 'crypto', action: 'buy', quantity: 0.3, unit_price: 65000, executed_at: '2025-01-02' },
      { symbol: 'BTC', asset_type: 'crypto', action: 'sell', quantity: 0.4, unit_price: 70000, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBeCloseTo(0.4, 8)
    expect(holdings[0].realizedPnl).toBeCloseTo(3250, 2) // 0.4 * (70000 - 62500)
  })

  it('should handle transactions in non-chronological order', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 5, unit_price: 150, executed_at: '2025-01-03' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(5)
    expect(holdings[0].realizedPnl).toBe(250)
  })

  it('should handle multiple symbols separately', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'BTC', asset_type: 'crypto', action: 'buy', quantity: 1, unit_price: 50000, executed_at: '2025-01-01' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(2)
  })
})

describe('enrichHoldings', () => {
  const mockHoldings: Holding[] = [
    {
      symbol: 'AAPL',
      asset_type: 'stock',
      quantity: 10,
      avgCost: 150,
      totalCost: 1500,
      realizedPnl: 0,
    },
    {
      symbol: 'BTC',
      asset_type: 'crypto',
      quantity: 0.5,
      avgCost: 60000,
      totalCost: 30000,
      realizedPnl: 0,
    },
  ]

  it('should enrich holdings with price data correctly', () => {
    const priceData = {
      AAPL: { price: 180, change24h: 2.5 },
      BTC: { price: 65000, change24h: -1.2 },
    }

    const enriched = enrichHoldings(mockHoldings, priceData)

    expect(enriched).toHaveLength(2)

    // AAPL checks
    expect(enriched[0].currentPrice).toBe(180)
    expect(enriched[0].marketValue).toBe(1800)
    expect(enriched[0].unrealizedPnl).toBe(300)
    expect(enriched[0].unrealizedPnlPercent).toBe(20)
    expect(enriched[0].change24h).toBe(2.5)
    expect(enriched[0].position24hChange).toBe(45) // 1800 * 0.025

    // BTC checks
    expect(enriched[1].currentPrice).toBe(65000)
    expect(enriched[1].marketValue).toBe(32500)
    expect(enriched[1].unrealizedPnl).toBe(2500)
    expect(enriched[1].unrealizedPnlPercent).toBeCloseTo(8.333, 2)
  })

  it('should handle missing price data gracefully', () => {
    const priceData = {
      AAPL: { price: 180, change24h: 2.5 },
      // BTC is missing
    }

    const enriched = enrichHoldings(mockHoldings, priceData)

    expect(enriched[1].currentPrice).toBe(0)
    expect(enriched[1].marketValue).toBe(0)
    expect(enriched[1].unrealizedPnl).toBe(-30000)
    expect(enriched[1].unrealizedPnlPercent).toBe(-100)
    expect(enriched[1].change24h).toBe(0)
    expect(enriched[1].position24hChange).toBe(0)
  })

  it('should handle zero totalCost correctly', () => {
    const holdingsWithZeroCost: Holding[] = [
      {
        symbol: 'TSLA',
        asset_type: 'stock',
        quantity: 5,
        avgCost: 0,
        totalCost: 0,
        realizedPnl: 0,
      },
    ]

    const priceData = {
      TSLA: { price: 250, change24h: 5 },
    }

    const enriched = enrichHoldings(holdingsWithZeroCost, priceData)

    expect(enriched[0].unrealizedPnlPercent).toBe(0)
    expect(enriched[0].unrealizedPnl).toBe(1250)
  })

  it('should return empty array when given empty holdings', () => {
    const enriched = enrichHoldings([], {})
    expect(enriched).toEqual([])
  })

  it('should calculate negative 24h change correctly', () => {
    const priceData = {
      AAPL: { price: 140, change24h: -5 },
    }

    const enriched = enrichHoldings(mockHoldings, priceData)
    // Market value = 10 * 140 = 1400
  // position24hChange = 1400 * (-5/100) = -70
    expect(enriched[0].position24hChange).toBe(-70) 
  })
})

describe('enrichHoldings - Edge Cases', () => {
  const baseHolding: Holding = {
    symbol: 'SOL',
    asset_type: 'crypto',
    quantity: 2.5,
    avgCost: 100,
    totalCost: 250,
    realizedPnl: 0,
  }

  it('should handle null change24h correctly', () => {
    const priceData = {
      SOL: { price: 150, change24h: null },
    }

    const enriched = enrichHoldings([baseHolding], priceData)

    expect(enriched[0].change24h).toBe(0)
    expect(enriched[0].position24hChange).toBe(0)
    expect(enriched[0].currentPrice).toBe(150)
    expect(enriched[0].marketValue).toBe(375)
  })

  it('should handle very small quantities (crypto precision)', () => {
  const smallHolding: Holding = {
    symbol: 'SHIB',
    asset_type: 'crypto',
    quantity: 0.00001234,
    avgCost: 0.00001,
    totalCost: 0.0000000001234,
    realizedPnl: 0,
  }

  const priceData = {
    SHIB: { price: 0.000025, change24h: 12.5 },
  }

  const enriched = enrichHoldings([smallHolding], priceData)

  // Correct calculations:
  // marketValue     = 0.00001234 * 0.000025 = 3.085e-10
  // unrealizedPnl   = 3.085e-10 - 1.234e-10 = 1.851e-10

  expect(enriched[0].marketValue).toBeCloseTo(3.085e-10, 15)
  expect(enriched[0].unrealizedPnl).toBeCloseTo(1.851e-10, 15)
})

  it('should handle large price movements', () => {
    const holding: Holding = {
      symbol: 'NVDA',
      asset_type: 'stock',
      quantity: 5,
      avgCost: 400,
      totalCost: 2000,
      realizedPnl: 0,
    }

    const priceData = {
      NVDA: { price: 1200, change24h: 45 }, // +45% in a day
    }

    const enriched = enrichHoldings([holding], priceData)

    expect(enriched[0].marketValue).toBe(6000)
    expect(enriched[0].unrealizedPnl).toBe(4000)
    expect(enriched[0].unrealizedPnlPercent).toBe(200)
    expect(enriched[0].position24hChange).toBe(2700) // 6000 * 0.45
  })

  it('should handle mixed holdings with some missing prices', () => {
    const holdings: Holding[] = [
      { symbol: 'AAPL', asset_type: 'stock', quantity: 10, avgCost: 150, totalCost: 1500, realizedPnl: 0 },
      { symbol: 'MSFT', asset_type: 'stock', quantity: 5, avgCost: 300, totalCost: 1500, realizedPnl: 0 },
    ]

    const priceData = {
      AAPL: { price: 180, change24h: 3 },
      // MSFT is missing
    }

    const enriched = enrichHoldings(holdings, priceData)

    expect(enriched).toHaveLength(2)
    expect(enriched[0].currentPrice).toBe(180)
    expect(enriched[1].currentPrice).toBe(0)
    expect(enriched[1].marketValue).toBe(0)
  })
})