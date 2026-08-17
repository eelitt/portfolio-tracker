import { describe, it, expect } from 'vitest'
import type { SnapshotPoint } from '../aggregateSnapshots'
import type { Transaction } from '../types'
import {
  cashFlowsFromTransactions,
  dailyTwrs,
  linkedReturn,
  maxDrawdownFromReturns,
  returnVolatility,
} from '../performance'

function pt(date: string, marketValue: number): SnapshotPoint {
  return { date, marketValue, costBasis: 0, isPartial: false }
}

function cashTx(
  action: 'inflow' | 'outflow' | 'buy',
  date: string,
  quantity: number,
  currency: 'USD' | 'EUR' = 'USD'
): Transaction {
  return {
    symbol: 'USD',
    asset_type: 'cash',
    action,
    quantity,
    unit_price: 1,
    executed_at: `${date}T12:00:00.000Z`,
    currency,
  }
}

describe('cashFlowsFromTransactions', () => {
  it('nets inflow/outflow and ignores buys', () => {
    const flows = cashFlowsFromTransactions(
      [
        cashTx('inflow', '2026-01-02', 100),
        cashTx('outflow', '2026-01-02', 30),
        cashTx('buy', '2026-01-02', 50),
      ],
      'USD',
      1
    )
    expect(flows).toEqual([{ date: '2026-01-02', amount: 70 }])
  })
})

describe('dailyTwrs / linkedReturn', () => {
  it('deposit into a flat book is ~0 TWR while MV% is +100', () => {
    const points = [pt('2026-01-01', 100), pt('2026-01-02', 200)]
    const flows = cashFlowsFromTransactions(
      [cashTx('inflow', '2026-01-02', 100)],
      'USD',
      1
    )
    const rets = dailyTwrs(points, flows)
    expect(linkedReturn(rets)).toBeCloseTo(0)
    const mvPct = (200 - 100) / 100
    expect(mvPct).toBe(1)
  })

  it('withdrawal from a flat remaining mark is not a loss', () => {
    const points = [pt('2026-01-01', 200), pt('2026-01-02', 100)]
    const flows = cashFlowsFromTransactions(
      [cashTx('outflow', '2026-01-02', 100)],
      'USD',
      1
    )
    expect(linkedReturn(dailyTwrs(points, flows))).toBeCloseTo(0)
  })

  it('buy with existing cash is not an external flow', () => {
    const points = [pt('2026-01-01', 100), pt('2026-01-02', 100)]
    const flows = cashFlowsFromTransactions(
      [
        {
          symbol: 'TSLA',
          asset_type: 'stock',
          action: 'buy',
          quantity: 1,
          unit_price: 50,
          executed_at: '2026-01-02T12:00:00.000Z',
          currency: 'USD',
        },
      ],
      'USD',
      1
    )
    expect(flows).toEqual([])
    expect(linkedReturn(dailyTwrs(points, flows))).toBeCloseTo(0)
  })

  it('returns null / empty when there is no pair or base MV is 0', () => {
    expect(dailyTwrs([], [])).toEqual([])
    expect(linkedReturn([])).toBeNull()
    expect(dailyTwrs([pt('2026-01-01', 0), pt('2026-01-02', 10)], [])).toEqual(
      []
    )
  })
})

describe('maxDrawdownFromReturns', () => {
  it('is −20% from 100 → 80 → 90', () => {
    const rets = dailyTwrs(
      [pt('2026-01-01', 100), pt('2026-01-02', 80), pt('2026-01-03', 90)],
      []
    )
    const dd = maxDrawdownFromReturns(rets)
    expect(dd?.drawdown).toBeCloseTo(-0.2)
  })
})

describe('returnVolatility', () => {
  it('is 0 when daily TWR is constant', () => {
    const rets = dailyTwrs(
      [pt('2026-01-01', 100), pt('2026-01-02', 101), pt('2026-01-03', 102.01)],
      []
    )
    const v = returnVolatility(rets)
    expect(v).not.toBeNull()
    expect(v!.dailyStDev).toBeCloseTo(0, 8)
    expect(v!.annualizedStDev).toBeNull()
  })

  it('is null with fewer than 2 daily returns', () => {
    expect(returnVolatility(dailyTwrs([pt('2026-01-01', 100)], []))).toBeNull()
  })
})
