import { describe, it, expect } from 'vitest'
import { calculateHoldings, type Transaction } from './calculatePortfolio'

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