import { describe, it, expect } from 'vitest'
import {
  aggregatePreferredPortfolio,
  calculateCashHoldingsInPreferred,
  perpQuoteInPreferred,
  perpUnrealizedPercent,
  toPreferredHolding,
} from '../convertToPreferred'
import { ledgerPerpRows, reducePerps } from '../perps'
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
    priceAvailable: overrides.priceAvailable ?? true,
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

  it('converts cost on an unpriced holding and leaves market fields at 0', () => {
    const h = assetHolding({
      symbol: 'DEAD',
      quantity: 10,
      currency: 'USD',
      totalCost: 1000,
      avgCost: 100,
      realizedPnl: 50,
      currentPrice: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      position24hChange: 0,
      priceAvailable: false,
    })

    const result = toPreferredHolding(h, 'EUR', RATE)

    expect(result.priceAvailable).toBe(false)
    expect(result.currentPrice).toBe(0)
    expect(result.marketValue).toBe(0)
    expect(result.unrealizedPnl).toBe(0)
    expect(result.unrealizedPnlPercent).toBe(0)
    expect(result.position24hChange).toBe(0)
    expect(result.totalCost).toBeCloseTo(1000 * RATE, 8)
    expect(result.avgCost).toBeCloseTo(100 * RATE, 8)
    expect(result.realizedPnl).toBeCloseTo(50 * RATE, 8)
    expect(result.currency).toBe('EUR')
  })

  it('converts USD-entry realized P&L when preferred is EUR', () => {
    const h = assetHolding({
      symbol: 'AAPL',
      realizedPnl: 250,
    })

    const result = toPreferredHolding(h, 'EUR', RATE)
    expect(result.realizedPnl).toBeCloseTo(250 * RATE, 8)
  })

  it('converts EUR-entry realized P&L when preferred is USD', () => {
    const h = assetHolding({
      symbol: 'AAPL',
      currency: 'EUR',
      realizedPnl: 250,
    })
    const result = toPreferredHolding(h, 'USD', RATE)
    expect(result.realizedPnl).toBeCloseTo(250 / RATE, 8)
  })

  it('converts unpriced EUR-entry cost to USD and leaves market at 0', () => {
    const h = assetHolding({
      symbol: 'DEAD',
      currency: 'EUR',
      totalCost: 870,
      avgCost: 87,
      realizedPnl: 50,
      currentPrice: 0,
      marketValue: 0,
      unrealizedPnl: 0,
      priceAvailable: false,
    })
    const result = toPreferredHolding(h, 'USD', RATE)
    expect(result.priceAvailable).toBe(false)
    expect(result.marketValue).toBe(0)
    expect(result.unrealizedPnl).toBe(0)
    expect(result.totalCost).toBeCloseTo(870 / RATE, 8)
    expect(result.realizedPnl).toBeCloseTo(50 / RATE, 8)
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

  it('converts all-USD cash to EUR preferred (legacy missing currency; non-1 unit price is notional)', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 100,
        unit_price: 2,
        executed_at: '2025-01-01',
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

  it('does not emit a negative cash balance on over-outflow', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 50,
        unit_price: 1,
        executed_at: '2025-01-01',
        currency: 'EUR',
      },
      {
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'outflow',
        quantity: 80,
        unit_price: 1,
        executed_at: '2025-01-02',
        currency: 'EUR',
      },
    ]
    expect(calculateCashHoldingsInPreferred(txs, 'EUR', RATE)).toEqual([])
  })
})

function usdCash(quantity: number): Transaction {
  return {
    symbol: 'Available Cash',
    asset_type: 'cash',
    action: 'inflow',
    quantity,
    unit_price: 1,
    executed_at: '2026-01-01T00:00:00Z',
    currency: 'USD',
  }
}

function futureRow(
  partial: Partial<Transaction> & Pick<Transaction, 'action' | 'executed_at'>
): Transaction {
  return {
    symbol: 'BTC',
    asset_type: 'future',
    position_side: 'long',
    quantity: 0.2,
    unit_price: 100000,
    amount: 1000,
    currency: 'USD',
    ...partial,
  }
}

function headline(
  txs: Transaction[],
  mark: { mark?: number | null; previousMark?: number | null },
  currency: 'USD' | 'EUR' = 'USD',
  rate = 1
) {
  const cash = calculateCashHoldingsInPreferred(txs, currency, rate)
  const book = reducePerps({ rows: ledgerPerpRows(txs) })
  const terms = book.positions.map((position) =>
    perpQuoteInPreferred(position, mark, currency, rate)
  )
  return aggregatePreferredPortfolio([], cash, terms)
}

describe('perp headline', () => {
  const open = futureRow({
    action: 'buy',
    executed_at: '2026-01-02T00:00:00Z',
  })

  it('leaves the total unchanged on an open and moves it by 200 on a 1% long', () => {
    const txs = [usdCash(10000), open]
    const flat = headline(txs, { mark: 100000, previousMark: 100000 })
    expect(flat.totalMarketValue).toBe(10000)
    expect(flat.totalCost).toBe(9000)
    expect(flat.totalUnrealizedPnl).toBe(0)

    const up = headline(txs, { mark: 101000, previousMark: 100000 })
    expect(up.totalMarketValue).toBe(10200)
    expect(up.totalUnrealizedPnl).toBe(200)
    expect(up.total24hChange).toBe(200)
    expect(up.totalMarketValue).not.toBe(9000 + 20200)

    const card = perpQuoteInPreferred(
      reducePerps({ rows: ledgerPerpRows(txs) }).positions[0],
      { mark: 101000, previousMark: 100000 },
      'USD',
      1
    )
    expect(card.equity).toBe(1200)
    expect(card.unrealized).toBe(200)
    expect(perpUnrealizedPercent(card.unrealized, card.margin)).toBe(20)
    expect(card.margin).toBe(1000)
    expect(card.leverage).toBe(20)
    expect(card.availableMargin).toBe(190)
    expect(card.notional).toBe(20200)
    expect(card.dayChange).toBe(200)
    expect(card.mark).toBe(101000)

    const missing = perpQuoteInPreferred(
      reducePerps({ rows: ledgerPerpRows(txs) }).positions[0],
      { mark: null, previousMark: null },
      'USD',
      1
    )
    expect(missing.equity).toBe(1000)
    expect(missing.unrealized).toBeNull()
    expect(missing.mark).toBeNull()
    expect(missing.notional).toBeNull()
    expect(missing.dayChange).toBeNull()
    expect(perpUnrealizedPercent(missing.unrealized, missing.margin)).toBeUndefined()
    expect(perpUnrealizedPercent(200, 0)).toBeUndefined()
    expect(perpUnrealizedPercent(200, -100)).toBeUndefined()
  })

  it('books a short gain when the mark falls and a loss when it rises', () => {
    const txs = [
      usdCash(10000),
      futureRow({
        action: 'sell',
        position_side: 'short',
        quantity: 0.5,
        executed_at: '2026-01-02T00:00:00Z',
      }),
    ]
    expect(headline(txs, { mark: 98000, previousMark: 100000 }).totalMarketValue).toBe(
      11000
    )
    expect(headline(txs, { mark: 102000, previousMark: 100000 }).totalMarketValue).toBe(
      9000
    )
  })

  it('leaves the total unchanged on a partial close', () => {
    const txs = [
      usdCash(10000),
      open,
      futureRow({
        action: 'sell',
        quantity: 0.1,
        unit_price: 101000,
        amount: null,
        executed_at: '2026-01-03T00:00:00Z',
      }),
    ]
    const totals = headline(txs, { mark: 101000, previousMark: 101000 })
    expect(totals.totalMarketValue).toBe(10200)
    expect(calculateCashHoldingsInPreferred(txs, 'USD', 1)[0].marketValue).toBe(9600)
  })

  it('lowers equity for funding and a fee and leaves cash unchanged', () => {
    const txs = [
      usdCash(10000),
      open,
      futureRow({
        action: 'funding',
        quantity: null,
        unit_price: null,
        amount: -40,
        executed_at: '2026-01-02T12:00:00Z',
      }),
      futureRow({
        action: 'fee',
        quantity: null,
        unit_price: null,
        amount: -5,
        executed_at: '2026-01-02T12:01:00Z',
      }),
    ]
    const cash = calculateCashHoldingsInPreferred(txs, 'USD', 1)
    expect(cash).toHaveLength(1)
    expect(cash[0].symbol).toBe('Available Cash')
    expect(cash[0].marketValue).toBe(9000)
    expect(headline(txs, { mark: 101000, previousMark: 100000 }).totalMarketValue).toBe(
      10155
    )
  })

  it('leaves the total unchanged when 200 margin is added', () => {
    const txs = [
      usdCash(10000),
      open,
      futureRow({
        action: 'margin_add',
        quantity: null,
        unit_price: null,
        amount: 200,
        executed_at: '2026-01-02T12:00:00Z',
      }),
    ]
    const cash = calculateCashHoldingsInPreferred(txs, 'USD', 1)
    expect(cash[0].marketValue).toBe(8800)
    expect(headline(txs, { mark: 101000, previousMark: 100000 }).totalMarketValue).toBe(
      10200
    )
  })

  it('keeps margin when the mark is missing and adds nothing for a missing previous mark', () => {
    const txs = [usdCash(10000), open]
    const missing = headline(txs, { mark: null, previousMark: null })
    expect(missing.totalMarketValue).toBe(10000)
    expect(missing.totalUnrealizedPnl).toBe(0)
    expect(missing.total24hChange).toBe(0)
    expect(missing.unpricedSymbols).toEqual(['BTC long'])

    const noPrev = headline(txs, { mark: 101000, previousMark: null })
    expect(noPrev.totalMarketValue).toBe(10200)
    expect(noPrev.total24hChange).toBe(0)
  })

  it('converts margin, unrealized, and the mark, then recomputes the EUR total', () => {
    const totals = headline(
      [usdCash(10000), open],
      { mark: 101000, previousMark: 100000 },
      'EUR',
      RATE
    )
    expect(totals.totalMarketValue).toBeCloseTo(10200 * RATE, 2)
    expect(totals.totalUnrealizedPnl).toBeCloseTo(200 * RATE, 2)
    expect(totals.total24hChange).toBeCloseTo(200 * RATE, 2)
    expect(totals.totalCost).toBeCloseTo(9000 * RATE, 2)
  })

  it('does not move a savings balance when Available Cash pays the margin', () => {
    const txs: Transaction[] = [
      {
        symbol: 'Savings',
        asset_type: 'cash',
        action: 'inflow',
        quantity: 500,
        unit_price: 1,
        executed_at: '2026-01-01T00:00:00Z',
        currency: 'USD',
      },
      usdCash(10000),
      open,
    ]
    const cash = calculateCashHoldingsInPreferred(txs, 'USD', 1)
    expect(cash).toHaveLength(2)
    expect(cash.find((h) => h.symbol === 'Savings')?.marketValue).toBe(500)
    expect(cash.find((h) => h.symbol === 'Available Cash')?.marketValue).toBe(9000)
  })
})
