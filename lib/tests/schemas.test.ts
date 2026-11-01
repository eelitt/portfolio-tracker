import { describe, it, expect } from 'vitest'
import {
  changePasswordSchema,
  csvParsedTransactionsSchema,
  goalSchema,
  transactionSchema,
  watchlistSchema,
} from '../schemas'

function validTx(overrides: Record<string, unknown> = {}) {
  return {
    symbol: 'aapl',
    asset_type: 'stock',
    action: 'buy',
    quantity: '10',
    unit_price: '150.5',
    executed_at: '2025-01-01',
    ...overrides,
  }
}

describe('transactionSchema', () => {
  it('uppercases symbol and coerces numeric strings', () => {
    const r = transactionSchema.safeParse(validTx())
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.symbol).toBe('AAPL')
    expect(r.data.quantity).toBe(10)
    expect(r.data.unit_price).toBe(150.5)
  })

  it('rejects empty symbol, zero quantity, and negative price', () => {
    expect(transactionSchema.safeParse(validTx({ symbol: '' })).success).toBe(false)
    expect(transactionSchema.safeParse(validTx({ quantity: 0 })).success).toBe(false)
    expect(transactionSchema.safeParse(validTx({ unit_price: -1 })).success).toBe(
      false
    )
  })

  it('rejects invalid asset_type and action', () => {
    expect(
      transactionSchema.safeParse(validTx({ asset_type: 'bond' })).success
    ).toBe(false)
    expect(transactionSchema.safeParse(validTx({ action: 'hold' })).success).toBe(
      false
    )
  })

  it('rejects amount and position side on a stock', () => {
    expect(transactionSchema.safeParse(validTx({ amount: '5' })).success).toBe(false)
    expect(
      transactionSchema.safeParse(validTx({ position_side: 'long' })).success
    ).toBe(false)
  })

  it('accepts a future open and a funding row with empty quantity and price', () => {
    const open = transactionSchema.safeParse({
      symbol: 'btc',
      asset_type: 'future',
      action: 'buy',
      position_side: 'long',
      quantity: '0.2',
      unit_price: '100000',
      amount: '1000',
      executed_at: '2026-01-02T00:00:00Z',
      currency: 'EUR',
    })
    expect(open.success).toBe(true)
    if (!open.success) return
    expect(open.data.symbol).toBe('BTC')
    expect(open.data.currency).toBe('USD')
    expect(open.data.amount).toBe(1000)

    const funding = transactionSchema.safeParse({
      symbol: 'BTC',
      asset_type: 'future',
      action: 'funding',
      position_side: 'long',
      quantity: '',
      unit_price: '',
      amount: '12.5',
      executed_at: '2026-01-03T00:00:00Z',
    })
    expect(funding.success).toBe(true)
    if (!funding.success) return
    expect(funding.data.quantity).toBeNull()
    expect(funding.data.unit_price).toBeNull()
    expect(funding.data.amount).toBe(12.5)
  })

  it('rejects a future fee that is not negative and a future open without a side', () => {
    expect(
      transactionSchema.safeParse({
        symbol: 'BTC',
        asset_type: 'future',
        action: 'fee',
        position_side: 'long',
        quantity: '',
        unit_price: '',
        amount: '3',
        executed_at: '2026-01-03T00:00:00Z',
      }).success
    ).toBe(false)
    expect(
      transactionSchema.safeParse({
        symbol: 'BTC',
        asset_type: 'future',
        action: 'buy',
        quantity: '0.1',
        unit_price: '100',
        amount: '10',
        executed_at: '2026-01-02T00:00:00Z',
      }).success
    ).toBe(false)
  })

  it('currently allows cash + buy (chat layer rejects; schema does not)', () => {
    const r = transactionSchema.safeParse(
      validTx({
        symbol: 'Available Cash',
        asset_type: 'cash',
        action: 'buy',
        quantity: 100,
        unit_price: 1,
      })
    )
    expect(r.success).toBe(true)
  })
})

describe('watchlistSchema', () => {
  it('uppercases symbol', () => {
    const r = watchlistSchema.safeParse({ symbol: 'msft', asset_type: 'stock' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.symbol).toBe('MSFT')
  })

  it('rejects cash', () => {
    expect(
      watchlistSchema.safeParse({ symbol: 'USD', asset_type: 'cash' }).success
    ).toBe(false)
  })
})

describe('goalSchema', () => {
  it('rejects non-positive target', () => {
    expect(goalSchema.safeParse({ name: 'Save', target_amount: 0 }).success).toBe(
      false
    )
    expect(goalSchema.safeParse({ name: 'Save', target_amount: -10 }).success).toBe(
      false
    )
  })

  it('treats empty date and monthly as null', () => {
    const r = goalSchema.safeParse({
      name: 'House',
      target_amount: 10000,
      target_date: '',
      planned_monthly: '',
      assigned_amount: '',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.target_date).toBeNull()
      expect(r.data.planned_monthly).toBeNull()
      expect(r.data.assigned_amount).toBeNull()
      expect(r.data.include_cash).toBe(true)
    }
  })
})

describe('csvParsedTransactionsSchema', () => {
  it('accepts one valid row and rejects 201', () => {
    const one = csvParsedTransactionsSchema.safeParse({
      transactions: [validTx({ symbol: 'BTC', asset_type: 'crypto' })],
    })
    expect(one.success).toBe(true)

    const rows = Array.from({ length: 201 }, (_, i) =>
      validTx({ symbol: `S${i}` })
    )
    expect(
      csvParsedTransactionsSchema.safeParse({ transactions: rows }).success
    ).toBe(false)
  })
})

describe('changePasswordSchema', () => {
  it('rejects short, mismatched, and unchanged passwords', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass1',
        newPassword: 'short',
        confirmPassword: 'short',
      }).success
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpass12',
        newPassword: 'newpass12',
        confirmPassword: 'otherpass',
      }).success
    ).toBe(false)
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'samepass1',
        newPassword: 'samepass1',
        confirmPassword: 'samepass1',
      }).success
    ).toBe(false)
  })

  it('accepts a valid change', () => {
    const r = changePasswordSchema.safeParse({
      currentPassword: 'oldpass12',
      newPassword: 'newpass12',
      confirmPassword: 'newpass12',
    })
    expect(r.success).toBe(true)
  })
})
