import { describe, it, expect } from 'vitest'
import { calculateHoldings, computePortfolioHash, enrichHoldings, type Transaction} from '../calculatePortfolio'
import { Holding } from '../types'

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
    expect(holdings[0].currency).toBe('USD')
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

  it('records a realized loss on a sell below average cost', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 4, unit_price: 80, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(6)
    expect(holdings[0].avgCost).toBe(100)
    expect(holdings[0].realizedPnl).toBe(-80)
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

  it('ignores a sell with no prior buy (no short position)', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 5, unit_price: 150, executed_at: '2025-01-01' },
    ]
    expect(calculateHoldings(transactions)).toEqual([])
  })

  it('caps oversell realized P&L and keeps it on a later reopen', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 5, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 10, unit_price: 150, executed_at: '2025-01-02' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 2, unit_price: 90, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].quantity).toBe(2)
    expect(holdings[0].avgCost).toBe(90)
    // 5 owned × (150 − 100), not 10 × 50
    expect(holdings[0].realizedPnl).toBe(250)
  })

  it('keeps remaining avgCost after a partial sell (does not subtract sale proceeds from basis)', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 4, unit_price: 150, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(6)
    expect(holdings[0].avgCost).toBe(100)
    expect(holdings[0].totalCost).toBe(600)
    expect(holdings[0].realizedPnl).toBe(200)
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
    const aapl = holdings.find((h) => h.symbol === 'AAPL')
    const btc = holdings.find((h) => h.symbol === 'BTC')
    expect(aapl).toMatchObject({ quantity: 10, avgCost: 100 })
    expect(btc).toMatchObject({ quantity: 1, avgCost: 50000 })
  })

  it('should produce a cash holding (e.g. from sell proceeds) valued at face amount', () => {
    // Simulates: buy AAPL, then sell it entirely → cash credited for proceeds
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 10, unit_price: 135, executed_at: '2025-01-05' },
      // Auto-generated cash credit (inflow from sell)
      { symbol: 'Available Cash', asset_type: 'cash', action: 'inflow', quantity: 1350, unit_price: 1, executed_at: '2025-01-05', currency: 'USD' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings).toHaveLength(1)
    const cash = holdings[0]
    expect(cash.symbol).toBe('Available Cash')
    expect(cash.asset_type).toBe('cash')
    expect(cash.quantity).toBe(1350)
    expect(cash.avgCost).toBe(1)
    expect(cash.totalCost).toBe(1350)
    // Realized P&L lives on the (now closed) stock position, not on cash
    expect(cash.realizedPnl).toBe(0)
  })

  it('normalizes numeric strings from the DB (does not concatenate quantity)', () => {
    const transactions = [
      {
        symbol: 'AAPL',
        asset_type: 'stock',
        action: 'buy',
        quantity: '10' as unknown as number,
        unit_price: '150' as unknown as number,
        executed_at: '2025-01-01',
      },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].avgCost).toBe(150)
    expect(holdings[0].totalCost).toBe(1500)
  })
})

describe('computePortfolioHash', () => {
  const buyAapl: Transaction = {
    id: '1',
    symbol: 'AAPL',
    asset_type: 'stock',
    action: 'buy',
    quantity: 10,
    unit_price: 150,
    executed_at: '2025-01-01',
    currency: 'USD',
  }
  const buyBtc: Transaction = {
    id: '2',
    symbol: 'BTC',
    asset_type: 'crypto',
    action: 'buy',
    quantity: 1,
    unit_price: 40000,
    executed_at: '2025-02-01',
    currency: 'USD',
  }

  it('returns empty for no transactions', () => {
    expect(computePortfolioHash([])).toBe('empty')
    expect(computePortfolioHash(undefined as unknown as Transaction[])).toBe('empty')
  })

  it('is stable under reorder and changes when qty or currency changes', () => {
    const a = computePortfolioHash([buyAapl, buyBtc])
    const b = computePortfolioHash([buyBtc, buyAapl])
    expect(a).toBe(b)
    expect(a).not.toBe('empty')

    const qtyChanged = computePortfolioHash([
      { ...buyAapl, quantity: 11 },
      buyBtc,
    ])
    expect(qtyChanged).not.toBe(a)

    const currencyChanged = computePortfolioHash([
      { ...buyAapl, currency: 'EUR' },
      buyBtc,
    ])
    expect(currencyChanged).not.toBe(a)
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
    expect(enriched[0].priceAvailable).toBe(true)

    // BTC checks
    expect(enriched[1].currentPrice).toBe(65000)
    expect(enriched[1].marketValue).toBe(32500)
    expect(enriched[1].unrealizedPnl).toBe(2500)
    expect(enriched[1].unrealizedPnlPercent).toBeCloseTo(8.333, 2)
    expect(enriched[1].priceAvailable).toBe(true)
  })

  it('should handle missing price data without inventing a total loss', () => {
    const priceData = {
      AAPL: { price: 180, change24h: 2.5 },
      // BTC is missing
    }

    const enriched = enrichHoldings(mockHoldings, priceData)

    expect(enriched[0].priceAvailable).toBe(true)
    expect(enriched[1].priceAvailable).toBe(false)
    expect(enriched[1].currentPrice).toBe(0)
    expect(enriched[1].marketValue).toBe(0)
    // Must not treat missing quote as price 0 → −100% P&L
    expect(enriched[1].unrealizedPnl).toBe(0)
    expect(enriched[1].unrealizedPnlPercent).toBe(0)
    expect(enriched[1].change24h).toBe(0)
    expect(enriched[1].position24hChange).toBe(0)
  })

  it('treats a zero quote as unpriced (does not invent a total loss)', () => {
    const enriched = enrichHoldings(mockHoldings, {
      AAPL: { price: 0, change24h: 1 },
    })
    expect(enriched[0].priceAvailable).toBe(false)
    expect(enriched[0].unrealizedPnl).toBe(0)
    expect(enriched[0].unrealizedPnlPercent).toBe(0)
    expect(enriched[0].marketValue).toBe(0)
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
})