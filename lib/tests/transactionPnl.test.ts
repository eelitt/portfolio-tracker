import { describe, expect, it } from 'vitest'
import { calculateHoldings, enrichHoldings } from '../calculatePortfolio'
import { toPreferredHolding } from '../convertToPreferred'
import { transactionPnl, type TransactionPnlRow } from '../transactionPnl'
import type { Transaction } from '../types'
import type { Currency } from '../currency'

const RATE = 0.87

function tx(
  partial: Omit<Transaction, 'asset_type' | 'currency'> & { id: string } & Partial<
    Pick<Transaction, 'asset_type' | 'currency'>
  >
): Transaction {
  return {
    asset_type: 'stock',
    currency: 'USD',
    ...partial,
  }
}

function rows(
  transactions: Transaction[],
  price: number | null,
  preferred: Currency = 'USD',
  rate = RATE
) {
  const symbol = transactions.find((t) => t.asset_type !== 'cash')?.symbol ?? 'AAPL'
  return transactionPnl({
    transactions,
    priceData: price === null ? {} : { [symbol]: { price } },
    preferredCurrency: preferred,
    usdToEurRate: rate,
  })
}

function cardUnrealized(transactions: Transaction[], price: number, preferred: Currency, rate = RATE) {
  const symbol = transactions[0].symbol
  const holding = calculateHoldings(transactions).find((h) => h.symbol === symbol)
  if (!holding) return null
  const enriched = enrichHoldings([holding], {
    [symbol]: { price, change24h: null },
  })[0]
  return toPreferredHolding(enriched, preferred, rate)
}

function sum(map: Map<string, TransactionPnlRow>, kind: TransactionPnlRow['kind']) {
  let total = 0
  for (const row of map.values()) {
    if (row.kind === kind && row.amount !== undefined) total += row.amount
  }
  return total
}

describe('transactionPnl', () => {
  it('marks one buy up and reports the percent', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
    ]
    const map = rows(transactions, 160)
    expect(map.get('b1')).toEqual({ kind: 'unrealized', amount: 600, percent: 60 })
  })

  it('sums two open buys to the holding within 0.01', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
      tx({ id: 'b2', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 200, executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 160)
    const card = cardUnrealized(transactions, 160, 'USD')
    expect(map.get('b1')?.amount).toBe(600)
    expect(map.get('b2')?.amount).toBe(-400)
    expect(sum(map, 'unrealized')).toBeCloseTo(card!.unrealizedPnl, 2)
  })

  it('keeps a partial sell summing to the holding', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
      tx({ id: 'b2', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 200, executed_at: '2025-01-02' }),
      tx({ id: 's1', symbol: 'AAPL', action: 'sell', quantity: 10, unit_price: 180, executed_at: '2025-01-03' }),
    ]
    const map = rows(transactions, 160)
    const card = cardUnrealized(transactions, 160, 'USD')
    expect(map.get('b1')).toMatchObject({ kind: 'unrealized', amount: 300 })
    expect(map.get('b2')).toMatchObject({ kind: 'unrealized', amount: -200 })
    expect(map.get('s1')).toMatchObject({ kind: 'realized', amount: 300, percent: 20 })
    expect(sum(map, 'unrealized')).toBeCloseTo(card!.unrealizedPnl, 2)
    expect(sum(map, 'realized')).toBeCloseTo(card!.realizedPnl, 2)
  })

  it('shows zero when a sale is at cost', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
      tx({ id: 's1', symbol: 'AAPL', action: 'sell', quantity: 4, unit_price: 100, executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 100)
    expect(map.get('s1')).toEqual({ kind: 'realized', amount: 0, percent: 0 })
  })

  it('leaves cash out of an asset pool that shares its symbol', () => {
    const transactions = [
      tx({ id: 'c1', symbol: 'AAPL', asset_type: 'cash', action: 'inflow', quantity: 500, unit_price: 1, executed_at: '2025-01-01' }),
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 110)
    expect(map.get('c1')).toEqual({ kind: 'none' })
    expect(map.get('b1')).toEqual({ kind: 'unrealized', amount: 100, percent: 10 })
  })

  it('is none for a sell of nothing owned', () => {
    const transactions = [
      tx({ id: 's1', symbol: 'AAPL', action: 'sell', quantity: 5, unit_price: 150, executed_at: '2025-01-01' }),
    ]
    expect(rows(transactions, 150).get('s1')).toEqual({ kind: 'none' })
  })

  it('closes a buy when the position is sold and reopens only the later buy', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
      tx({ id: 's1', symbol: 'AAPL', action: 'sell', quantity: 10, unit_price: 120, executed_at: '2025-01-02' }),
      tx({ id: 'b2', symbol: 'AAPL', action: 'buy', quantity: 2, unit_price: 90, executed_at: '2025-01-03' }),
    ]
    const map = rows(transactions, 100)
    const card = cardUnrealized(transactions, 100, 'USD')
    expect(map.get('b1')).toEqual({ kind: 'closed' })
    expect(map.get('s1')).toMatchObject({ kind: 'realized', amount: 200 })
    expect(map.get('b2')).toMatchObject({ kind: 'unrealized', amount: 20 })
    expect(sum(map, 'unrealized')).toBeCloseTo(card!.unrealizedPnl, 2)
    expect(sum(map, 'realized')).toBeCloseTo(card!.realizedPnl, 2)
  })

  it('is none, not zero, when an open buy has no quote', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01' }),
    ]
    expect(rows(transactions, null).get('b1')).toEqual({ kind: 'none' })
    expect(rows(transactions, 0).get('b1')).toEqual({ kind: 'none' })
  })

  it('uses one pool when the same symbol is a stock and a crypto', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'BTC', asset_type: 'stock', action: 'buy', quantity: 1, unit_price: 100, executed_at: '2025-01-01' }),
      tx({ id: 'b2', symbol: 'BTC', asset_type: 'crypto', action: 'buy', quantity: 1, unit_price: 200, executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 180)
    expect(sum(map, 'unrealized')).toBeCloseTo(60, 2)
    expect(map.get('b1')?.kind).toBe('unrealized')
    expect(map.get('b2')?.kind).toBe('unrealized')
  })

  it('keeps input order when two rows share executed_at', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 100, executed_at: '2025-01-01T00:00:00Z' }),
      tx({ id: 's1', symbol: 'AAPL', action: 'sell', quantity: 10, unit_price: 130, executed_at: '2025-01-01T00:00:00Z' }),
    ]
    const map = rows(transactions, 100)
    expect(map.get('b1')).toEqual({ kind: 'closed' })
    expect(map.get('s1')).toMatchObject({ kind: 'realized', amount: 300 })
  })

  it('treats a later row currency as the entry currency', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 1, unit_price: 100, currency: 'USD', executed_at: '2025-01-01' }),
      tx({ id: 'b2', symbol: 'AAPL', action: 'buy', quantity: 1, unit_price: 50, currency: 'EUR', executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 110, 'USD')
    expect(map.get('b2')).toMatchObject({ kind: 'unrealized', amount: 60 })
  })

  it('matches toPreferredHolding for an EUR cost and a USD mark', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'NOKIA', action: 'buy', quantity: 10, unit_price: 4, currency: 'EUR', executed_at: '2025-01-01' }),
      tx({ id: 's1', symbol: 'NOKIA', action: 'sell', quantity: 4, unit_price: 5, currency: 'EUR', executed_at: '2025-01-02' }),
    ]
    const map = rows(transactions, 6, 'EUR', RATE)
    const card = cardUnrealized(transactions, 6, 'EUR', RATE)
    expect(sum(map, 'unrealized')).toBeCloseTo(card!.unrealizedPnl, 2)
    expect(sum(map, 'realized')).toBeCloseTo(card!.realizedPnl, 2)
  })

  it('omits percent when the cost denominator is 0', () => {
    const transactions = [
      tx({ id: 'b1', symbol: 'AAPL', action: 'buy', quantity: 10, unit_price: 0, executed_at: '2025-01-01' }),
    ]
    const row = rows(transactions, 5).get('b1')
    expect(row?.kind).toBe('unrealized')
    expect(row?.amount).toBe(50)
    expect(row?.percent).toBeUndefined()
  })
})
