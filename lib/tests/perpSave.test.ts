import { describe, expect, it } from 'vitest'
import { ledgerPerpRows, validatePerps } from '../perps'
import {
  cashEventsInUsd,
  ledgerAfterSave,
  type SaveRow,
} from '../perpSave'

const NOW = '2026-01-05T00:00:00.000Z'

function cash(amount: number, executed_at = '2026-01-01T00:00:00Z'): SaveRow {
  return {
    id: 'cash',
    symbol: 'Available Cash',
    asset_type: 'cash',
    action: 'inflow',
    quantity: amount,
    unit_price: 1,
    currency: 'USD',
    executed_at,
  }
}

function openLong(): SaveRow {
  return {
    id: 'open',
    symbol: 'BTC',
    asset_type: 'future',
    action: 'buy',
    position_side: 'long',
    quantity: 0.2,
    unit_price: 100000,
    amount: 1000,
    executed_at: '2026-01-02T00:00:00Z',
    currency: 'USD',
  }
}

function check(existing: SaveRow[], row: SaveRow, marks?: Record<string, { mark: number }>) {
  const ledger = ledgerAfterSave(existing, { kind: 'create', row }, NOW)
  return validatePerps({
    rows: ledgerPerpRows(ledger),
    cash: cashEventsInUsd(ledger, 0.92),
    marks,
  })
}

describe('perp save book', () => {
  it('rejects an oversize reduce and leaves the book unchanged', () => {
    const existing = [cash(10000), openLong()]
    const row: SaveRow = {
      symbol: 'BTC',
      asset_type: 'future',
      action: 'sell',
      position_side: 'long',
      quantity: 0.3,
      unit_price: 101000,
      executed_at: '2026-01-04T00:00:00Z',
      currency: 'USD',
    }
    const saved = check(existing, row)
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.rowId).toBe('new')
    expect(existing).toHaveLength(2)
  })

  it('rejects a wallet row on a flat side', () => {
    const saved = check(
      [cash(10000)],
      {
        symbol: 'BTC',
        asset_type: 'future',
        action: 'funding',
        position_side: 'long',
        amount: 12,
        executed_at: '2026-01-04T00:00:00Z',
        currency: 'USD',
      }
    )
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.reason).toContain('not open')
  })

  it('rejects an open and a margin add that are short of cash at that time', () => {
    const open = check(
      [cash(10000, '2026-02-01T00:00:00Z')],
      {
        symbol: 'BTC',
        asset_type: 'future',
        action: 'buy',
        position_side: 'long',
        quantity: 0.2,
        unit_price: 100000,
        amount: 1000,
        executed_at: '2026-01-02T00:00:00Z',
        currency: 'USD',
      }
    )
    expect(open.ok).toBe(false)

    const add = check(
      [cash(10000), openLong()],
      {
        symbol: 'BTC',
        asset_type: 'future',
        action: 'margin_add',
        position_side: 'long',
        amount: 20000,
        executed_at: '2026-01-03T00:00:00Z',
        currency: 'USD',
      }
    )
    expect(add.ok).toBe(false)
    if (!add.ok) expect(add.reason).toContain('available cash')
  })

  it('rejects a margin removal above available margin', () => {
    const saved = check(
      [cash(10000), openLong()],
      {
        symbol: 'BTC',
        asset_type: 'future',
        action: 'margin_remove',
        position_side: 'long',
        amount: 9501,
        executed_at: '2026-01-03T00:00:00Z',
        currency: 'USD',
      },
      { BTC: { mark: 150000 } }
    )
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.reason).toContain('available margin')
  })

  it('adds proceeds for a spot sell and not for a future sell', () => {
    const spot = ledgerAfterSave(
      [],
      {
        kind: 'create',
        row: {
          symbol: 'AAPL',
          asset_type: 'stock',
          action: 'sell',
          quantity: 2,
          unit_price: 10,
          executed_at: '2026-01-02T00:00:00Z',
          currency: 'USD',
        },
      },
      NOW
    )
    expect(spot.filter((row) => row.symbol === 'Available Cash')).toHaveLength(1)

    const future = ledgerAfterSave(
      [cash(10000), openLong()],
      {
        kind: 'create',
        row: {
          symbol: 'BTC',
          asset_type: 'future',
          action: 'sell',
          position_side: 'long',
          quantity: 0.1,
          unit_price: 101000,
          executed_at: '2026-01-04T00:00:00Z',
          currency: 'USD',
        },
      },
      NOW
    )
    expect(future.filter((row) => row.symbol === 'Available Cash')).toHaveLength(1)
  })

  it('converts a euro cash row before the open check', () => {
    const saved = check(
      [
        {
          id: 'eur',
          symbol: 'Available Cash',
          asset_type: 'cash',
          action: 'inflow',
          quantity: 92,
          unit_price: 1,
          currency: 'EUR',
          executed_at: '2026-01-01T00:00:00Z',
        },
      ],
      {
        symbol: 'BTC',
        asset_type: 'future',
        action: 'buy',
        position_side: 'long',
        quantity: 0.2,
        unit_price: 100000,
        amount: 1000,
        executed_at: '2026-01-02T00:00:00Z',
        currency: 'USD',
      }
    )
    expect(saved.ok).toBe(false)
  })
})
