import { describe, expect, it } from 'vitest'
import {
  aggregatePreferredPortfolio,
  calculateCashHoldingsInPreferred,
  perpQuoteInPreferred,
} from '@/lib/convertToPreferred'
import { ledgerPerpRows, reducePerps } from '@/lib/perps'
import type { Transaction } from '@/lib/types'
import {
  buildUserSnapshot,
  type SnapshotTx,
} from '../../supabase/functions/portfolio-snapshots/book'
import { holdingSeriesId } from '@/lib/aggregateSnapshots'

function cash(amount: number): SnapshotTx {
  return {
    symbol: 'Available Cash',
    asset_type: 'cash',
    action: 'inflow',
    quantity: amount,
    unit_price: 1,
    executed_at: '2026-01-01T00:00:00Z',
    currency: 'USD',
  }
}

function future(partial: Partial<SnapshotTx> & Pick<SnapshotTx, 'action' | 'executed_at'>): SnapshotTx {
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

function asLedger(txs: SnapshotTx[]): Transaction[] {
  return txs.map((tx) => ({
    symbol: tx.symbol,
    asset_type: tx.asset_type,
    action: tx.action as Transaction['action'],
    position_side: tx.position_side ?? null,
    quantity: tx.quantity,
    unit_price: tx.unit_price,
    amount: tx.amount ?? null,
    executed_at: tx.executed_at,
    created_at: tx.created_at ?? undefined,
    currency: (tx.currency === 'EUR' ? 'EUR' : 'USD') as 'USD' | 'EUR',
  }))
}

function headline(txs: SnapshotTx[], marks: Record<string, number | null>) {
  const ledger = asLedger(txs)
  const markBook = Object.fromEntries(
    Object.entries(marks).map(([symbol, mark]) => [symbol, { mark }])
  )
  const cashHoldings = calculateCashHoldingsInPreferred(ledger, 'USD', 1, markBook)
  const book = reducePerps({ rows: ledgerPerpRows(ledger), marks: markBook })
  const terms = book.positions.map((position) =>
    perpQuoteInPreferred(position, { mark: marks[position.symbol] }, 'USD', 1)
  )
  return aggregatePreferredPortfolio([], cashHoldings, terms)
}

function snap(
  txs: SnapshotTx[],
  marks: Record<string, number | null>,
  prices: { crypto?: Record<string, number>; stock?: Record<string, number> } = {}
) {
  return buildUserSnapshot({
    userId: 'user-1',
    snapshotDate: '2026-11-01',
    txs,
    cryptoPrices: prices.crypto ?? {},
    stockPrices: prices.stock ?? {},
    usdToEur: 0.92,
    marks,
  })
}

describe('buildUserSnapshot', () => {
  it('snapshots a book with no futures the same way as before', () => {
    const built = snap(
      [
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'buy',
          quantity: 2,
          unit_price: 100,
          executed_at: '2026-01-01T00:00:00Z',
          currency: 'USD',
        },
        {
          symbol: 'Savings',
          asset_type: 'cash',
          action: 'inflow',
          quantity: 50,
          unit_price: 1,
          executed_at: '2026-01-01T00:00:00Z',
          currency: 'EUR',
        },
      ],
      {},
      { stock: { AAPL: 110 } }
    )
    expect(built.empty).toBe(false)
    if (built.empty) return
    expect(built.perpRows).toBe(0)
    expect(built.isPartial).toBe(false)
    expect(built.holdingRows.map((row) => row.position_side)).toEqual(['', ''])
    const stock = built.holdingRows.find((row) => row.symbol === 'AAPL')
    expect(stock?.market_value).toBe(220)
    expect(stock?.cost_basis).toBe(200)
    const savings = built.holdingRows.find((row) => row.symbol === 'Savings')
    expect(savings?.market_value).toBeCloseTo(50 / 0.92, 4)
  })

  it('still reduces a spot position when the sell price is zero', () => {
    const built = snap(
      [
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'buy',
          quantity: 2,
          unit_price: 100,
          executed_at: '2026-01-01T00:00:00Z',
          currency: 'USD',
        },
        {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'sell',
          quantity: 1,
          unit_price: 0,
          executed_at: '2026-01-02T00:00:00Z',
          currency: 'USD',
        },
      ],
      {},
      { stock: { AAPL: 110 } }
    )
    expect(built.empty).toBe(false)
    if (built.empty) return
    const stock = built.holdingRows.find((row) => row.symbol === 'AAPL')
    expect(stock?.quantity).toBe(1)
    expect(stock?.cost_basis).toBe(100)
    expect(stock?.market_value).toBe(110)
    expect(built.totalUnrealizedPnl).toBe(10)
  })

  it('writes one equity row per open side and matches the headline', () => {
    const txs = [
      cash(10000),
      future({ action: 'buy', executed_at: '2026-01-02T00:00:00Z' }),
      future({
        action: 'sell',
        position_side: 'short',
        quantity: 0.5,
        executed_at: '2026-01-03T00:00:00Z',
      }),
    ]
    const marks = { BTC: 101000 }
    const built = snap(txs, marks)
    const book = headline(txs, marks)
    expect(built.empty).toBe(false)
    if (built.empty) return
    expect(built.totalMarketValue).toBe(book.totalMarketValue)
    expect(built.totalCostBasis).toBe(book.totalCost)
    expect(built.totalUnrealizedPnl).toBe(book.totalUnrealizedPnl)
    const futures = built.holdingRows.filter((row) => row.asset_type === 'future')
    expect(futures.map((row) => row.position_side).sort()).toEqual(['long', 'short'])
    expect(futures.map((row) => row.symbol)).toEqual(['BTC', 'BTC'])
    const long = futures.find((row) => row.position_side === 'long')
    expect(long?.market_value).toBe(1200)
    expect(long?.market_value).not.toBe(0.2 * 101000)
    expect(long?.cost_basis).toBe(0)
    expect(built.holdingRows.find((row) => row.symbol === 'Available Cash')?.market_value).toBe(
      8000
    )
    expect(holdingSeriesId('future', 'BTC', 'long')).not.toBe(holdingSeriesId('crypto', 'BTC'))
    expect(holdingSeriesId('future', 'BTC', 'long')).not.toBe(
      holdingSeriesId('future', 'BTC', 'short')
    )
  })

  it('counts margin when the mark is missing and sets the partial flag', () => {
    const txs = [
      cash(10000),
      future({ action: 'buy', executed_at: '2026-01-02T00:00:00Z' }),
    ]
    const built = snap(txs, { BTC: null })
    const book = headline(txs, { BTC: null })
    expect(built.empty).toBe(false)
    if (built.empty) return
    expect(built.totalMarketValue).toBe(book.totalMarketValue)
    expect(built.totalMarketValue).toBe(10000)
    expect(built.isPartial).toBe(true)
    const side = built.holdingRows.find((row) => row.asset_type === 'future')
    expect(side?.market_value).toBe(1000)
    expect(side?.unit_price).toBeNull()
    expect(side?.is_partial).toBe(true)
    expect(side?.unrealized_pnl).toBe(0)
  })

  it('omits a flat side and does not let a future change the spot average', () => {
    const txs: SnapshotTx[] = [
      cash(10000),
      {
        symbol: 'BTC',
        asset_type: 'crypto',
        action: 'buy',
        quantity: 1,
        unit_price: 100,
        executed_at: '2026-01-01T00:00:00Z',
        currency: 'USD',
      },
      future({ action: 'buy', executed_at: '2026-01-02T00:00:00Z' }),
      future({
        action: 'sell',
        quantity: 0.2,
        unit_price: 101000,
        amount: null,
        executed_at: '2026-01-04T00:00:00Z',
      }),
    ]
    const built = snap(txs, { BTC: 101000 }, { crypto: { BTC: 50 } })
    expect(built.empty).toBe(false)
    if (built.empty) return
    expect(built.holdingRows.some((row) => row.asset_type === 'future')).toBe(false)
    const spot = built.holdingRows.find((row) => row.asset_type === 'crypto')
    expect(spot?.quantity).toBe(1)
    expect(spot?.cost_basis).toBe(100)
    expect(spot?.market_value).toBe(50)
    expect(spot?.position_side).toBe('')
  })
})
