import { describe, it, expect } from 'vitest'
import {
  calculateCashHoldingsInPreferred,
  toPreferredHolding,
} from '../convertToPreferred'
import type { EnrichedHolding, Transaction } from '../types'

const RATE = 0.87 // USD → EUR test rate

function assetHolding(
  overrides: Partial<EnrichedHolding> & Pick<EnrichedHolding, 'symbol'>
): EnrichedHolding {
  return {
    symbol: overrides.symbol,
    asset_type: overrides.asset_type || 'stock',
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
  }
}

describe('toPreferredHolding', () => {
  it('converts USD-entry asset to EUR preferred (MV and 24h scale by rate)', () => {
    const h = assetHolding({
      symbol: 'AAPL',
      quantity: 10,
      currentPrice: 150, // USD
      marketValue: 1500,
      totalCost: 1000, // USD
      avgCost: 100,
      change24h: 2,
      unrealizedPnl: 500, // intentionally "correct" in USD; must be recomputed
    })

    const result = toPreferredHolding(h, 'EUR', RATE)

    expect(result.currentPrice).toBeCloseTo(150 * RATE, 8)
    expect(result.marketValue).toBeCloseTo(10 * 150 * RATE, 8)
    expect(result.totalCost).toBeCloseTo(1000 * RATE, 8)
    expect(result.avgCost).toBeCloseTo(100 * RATE, 8)
    expect(result.unrealizedPnl).toBeCloseTo(result.marketValue - result.totalCost, 8)
    expect(result.position24hChange).toBeCloseTo(result.marketValue * 0.02, 8)
    expect(result.currency).toBe('EUR')
  })

  it('recomputes P&L for EUR-entry costs (does not scale mixed-currency P&L)', () => {
    // 10 shares, cost €1000 total, live price $150
    // enrich would have done unrealizedPnl = 1500 - 1000 = 500 (mixed units) — wrong
    const h = assetHolding({
      symbol: 'AAPL',
      quantity: 10,
      currency: 'EUR',
      totalCost: 1000,
      avgCost: 100,
      currentPrice: 150,
      marketValue: 1500,
      unrealizedPnl: 500, // wrong mixed value from enrich
      unrealizedPnlPercent: 50,
      change24h: 0,
    })

    const result = toPreferredHolding(h, 'EUR', RATE)

    const expectedMv = 10 * 150 * RATE
    expect(result.marketValue).toBeCloseTo(expectedMv, 8)
    expect(result.totalCost).toBeCloseTo(1000, 8) // already EUR
    expect(result.unrealizedPnl).toBeCloseTo(expectedMv - 1000, 8)
    // Must NOT equal 500 * RATE (scaled mixed P&L)
    expect(result.unrealizedPnl).not.toBeCloseTo(500 * RATE, 2)
    expect(result.unrealizedPnlPercent).toBeCloseTo(
      ((expectedMv - 1000) / 1000) * 100,
      6
    )
  })

  it('converts EUR-entry costs to USD preferred; market stays in USD', () => {
    const h = assetHolding({
      symbol: 'AAPL',
      quantity: 10,
      currency: 'EUR',
      totalCost: 870, // EUR
      avgCost: 87,
      currentPrice: 150, // USD
      marketValue: 1500,
      unrealizedPnl: 630, // garbage mixed
      change24h: 1,
    })

    const result = toPreferredHolding(h, 'USD', RATE)

    expect(result.currentPrice).toBeCloseTo(150, 8)
    expect(result.marketValue).toBeCloseTo(1500, 8)
    expect(result.totalCost).toBeCloseTo(870 / RATE, 8)
    expect(result.unrealizedPnl).toBeCloseTo(1500 - 870 / RATE, 8)
    expect(result.position24hChange).toBeCloseTo(1500 * 0.01, 8)
    expect(result.currency).toBe('USD')
  })

  it('is identity for USD entry and USD preferred (aside from P&L recompute)', () => {
    const h = assetHolding({
      symbol: 'MSFT',
      quantity: 5,
      currentPrice: 400,
      marketValue: 2000,
      totalCost: 1800,
      unrealizedPnl: 200,
      change24h: -1,
    })

    const result = toPreferredHolding(h, 'USD', RATE)

    expect(result.marketValue).toBe(2000)
    expect(result.totalCost).toBe(1800)
    expect(result.unrealizedPnl).toBe(200)
    expect(result.position24hChange).toBeCloseTo(-20, 8)
  })
})

describe('calculateCashHoldingsInPreferred', () => {
  it('nets mixed EUR + USD cash into preferred EUR (does not sum raw faces)', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 100,
        unit_price: 1,
        executed_at: '2025-01-01',
        currency: 'EUR',
      },
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 100,
        unit_price: 1,
        executed_at: '2025-01-02',
        currency: 'USD',
      },
    ]

    const cash = calculateCashHoldingsInPreferred(txs, 'EUR', RATE)
    expect(cash).toHaveLength(1)
    // 100 EUR + 100 USD * 0.87 = 187 EUR (not 200)
    expect(cash[0].marketValue).toBeCloseTo(100 + 100 * RATE, 2)
    expect(cash[0].quantity).toBeCloseTo(100 + 100 * RATE, 2)
    expect(cash[0].currentPrice).toBe(1)
    expect(cash[0].unrealizedPnl).toBe(0)
    expect(cash[0].position24hChange).toBe(0)
  })

  it('converts all-USD cash to EUR preferred', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 200,
        unit_price: 1,
        executed_at: '2025-01-01',
        currency: 'USD',
      },
    ]

    const cash = calculateCashHoldingsInPreferred(txs, 'EUR', RATE)
    expect(cash[0].marketValue).toBeCloseTo(200 * RATE, 2)
  })

  it('applies outflows in their own currency', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 500,
        unit_price: 1,
        executed_at: '2025-01-01',
        currency: 'EUR',
      },
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'outflow',
        quantity: 100,
        unit_price: 1,
        executed_at: '2025-01-02',
        currency: 'USD',
      },
    ]

    const cash = calculateCashHoldingsInPreferred(txs, 'EUR', RATE)
    expect(cash[0].marketValue).toBeCloseTo(500 - 100 * RATE, 2)
  })

  it('returns empty when no cash transactions', () => {
    const txs: Transaction[] = [
      {
        symbol: 'AAPL',
        asset_type: 'stock',
        action: 'buy',
        quantity: 1,
        unit_price: 100,
        executed_at: '2025-01-01',
        currency: 'USD',
      },
    ]
    expect(calculateCashHoldingsInPreferred(txs, 'EUR', RATE)).toEqual([])
  })
})
