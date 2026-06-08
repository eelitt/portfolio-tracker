import { describe, it, expect } from 'vitest'
import { calculateHoldings, type Transaction } from './calculatePortfolio'

describe('calculateHoldings', () => {
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
  })

  it('should calculate weighted average cost with multiple buys', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 200, executed_at: '2025-01-02' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(20)
    expect(holdings[0].avgCost).toBe(150) // (100*10 + 200*10) / 20
  })

  it('should calculate realized P&L on sell', () => {
    const transactions: Transaction[] = [
      { symbol: 'AAPL', asset_type: 'stock', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' },
      { symbol: 'AAPL', asset_type: 'stock', action: 'sell', quantity: 5, unit_price: 150, executed_at: '2025-01-03' },
    ]

    const holdings = calculateHoldings(transactions)
    expect(holdings[0].quantity).toBe(5)
    expect(holdings[0].realizedPnl).toBe(250) // 5 * (150 - 100)
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