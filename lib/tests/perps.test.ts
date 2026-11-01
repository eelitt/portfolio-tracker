import { describe, expect, it } from 'vitest'
import { calculateHoldings } from '../calculatePortfolio'
import { transactionPnl } from '../transactionPnl'
import {
  holdingSnapshotKey,
  quotePerp,
  perpFillIntent,
  reducePerps,
  usableUsdMPair,
  validatePerps,
  type CashEvent,
  type PerpRow,
} from '../perps'
import type { Transaction } from '../types'

const CASH: CashEvent[] = [
  { id: 'cash', executed_at: '2026-01-01T00:00:00Z', amount: 10000 },
]

function row(partial: PerpRow): PerpRow {
  return partial
}

function openLong(extra?: Partial<PerpRow>): PerpRow {
  return row({
    id: 'open',
    symbol: 'BTC',
    action: 'buy',
    position_side: 'long',
    quantity: 0.2,
    unit_price: 100000,
    amount: 1000,
    executed_at: '2026-01-02T00:00:00Z',
    ...extra,
  })
}

describe('perp reduce', () => {
  it('keeps notional out of the portfolio total', () => {
    const book = reducePerps({ rows: [openLong()], cash: CASH })
    const quote = quotePerp(book.positions[0], { mark: 101000, previousMark: 100000 })
    const total = book.cash + quote.valueAdd
    expect(quote.notional).toBe(20200)
    expect(total).toBe(10200)
    expect(total).not.toBe(book.cash + (quote.notional ?? 0))
  })

  it('leaves the total unchanged when a position opens', () => {
    const book = reducePerps({ rows: [openLong()], cash: CASH })
    const quote = quotePerp(book.positions[0], { mark: 100000, previousMark: 100000 })
    expect(book.cash).toBe(9000)
    expect(quote.equity).toBe(1000)
    expect(book.cash + quote.equity).toBe(10000)
    expect(book.futureCashDelta).toBe(-1000)
  })

  it('moves the total by 200 on the 1% long', () => {
    const book = reducePerps({ rows: [openLong()], cash: CASH })
    const quote = quotePerp(book.positions[0], { mark: 101000, previousMark: 100000 })
    expect(quote.unrealized).toBe(200)
    expect(quote.equity).toBe(1200)
    expect(quote.leverage).toBe(20)
    expect(quote.requiredMargin).toBeCloseTo(1010, 6)
    expect(quote.availableMargin).toBeCloseTo(190, 6)
    expect(book.cash + quote.valueAdd).toBe(10200)
    expect(quote.dayAdd).toBe(200)
  })

  it('gains on a short when the mark falls and loses when it rises', () => {
    const book = reducePerps({
      rows: [
        row({
          id: 'short',
          symbol: 'BTC',
          action: 'sell',
          position_side: 'short',
          quantity: 0.5,
          unit_price: 100000,
          amount: 1000,
          executed_at: '2026-01-02T00:00:00Z',
        }),
      ],
      cash: CASH,
    })
    const down = quotePerp(book.positions[0], { mark: 98000 })
    const up = quotePerp(book.positions[0], { mark: 102000 })
    expect(book.cash + down.valueAdd).toBe(11000)
    expect(book.cash + up.valueAdd).toBe(9000)
  })

  it('keeps the total flat on a partial close and releases half the margin', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'cut',
          symbol: 'BTC',
          action: 'sell',
          position_side: 'long',
          quantity: 0.1,
          unit_price: 101000,
          amount: null,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
    })
    const left = book.positions[0]
    const quote = quotePerp(left, { mark: 101000, previousMark: 101000 })
    expect(left.quantity).toBe(0.1)
    expect(left.margin).toBe(500)
    expect(left.assignedMargin).toBe(500)
    expect(left.entry).toBe(100000)
    expect(quote.leverage).toBe(20)
    expect(book.cash).toBe(9600)
    expect(book.rowPnl.get('cut')).toEqual({
      kind: 'realized',
      realized: 100,
      releasedMargin: 500,
    })
    expect(book.cash + quote.valueAdd).toBe(10200)
  })

  it('keeps margin when the mark is missing and does not book a loss', () => {
    const book = reducePerps({ rows: [openLong()], cash: CASH })
    const quote = quotePerp(book.positions[0], { mark: null, previousMark: null })
    expect(quote.valueAdd).toBe(1000)
    expect(quote.unrealizedAdd).toBe(0)
    expect(quote.dayAdd).toBe(0)
    expect(book.cash + quote.valueAdd).toBe(10000)
  })

  it('adds nothing to 24h when the previous mark is missing', () => {
    const book = reducePerps({ rows: [openLong()], cash: CASH })
    const quote = quotePerp(book.positions[0], { mark: 101000, previousMark: null })
    expect(quote.dayAdd).toBe(0)
    expect(quote.unrealizedAdd).toBe(200)
  })

  it('treats a 1000-unit contract as a missing pair', () => {
    expect(usableUsdMPair('BTCUSDT')).toBe('BTCUSDT')
    expect(usableUsdMPair('1000PEPEUSDT')).toBeNull()
    expect(usableUsdMPair(null)).toBeNull()
  })

  it('does not let a future BTC row change the spot BTC average', () => {
    const spot: Transaction = {
      id: 'spot',
      symbol: 'BTC',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 1,
      unit_price: 100,
      executed_at: '2026-01-01T00:00:00Z',
      currency: 'USD',
    }
    const future: Transaction = {
      id: 'fut',
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
    const alone = calculateHoldings([spot])
    const mixed = calculateHoldings([spot, future])
    expect(mixed).toEqual(alone)
    expect(mixed[0].avgCost).toBe(100)
  })

  it('describes an open, an add, a reduce, and an order that is too big', () => {
    const rows = [openLong()]
    expect(
      perpFillIntent({
        rows,
        symbol: 'ETH',
        positionSide: 'long',
        action: 'buy',
        quantity: 1,
        executedAt: '2026-01-04T00:00:00Z',
      }).kind
    ).toBe('open')
    expect(
      perpFillIntent({
        rows,
        symbol: 'BTC',
        positionSide: 'long',
        action: 'buy',
        quantity: 0.1,
        executedAt: '2026-01-04T00:00:00Z',
      }).kind
    ).toBe('add')
    expect(
      perpFillIntent({
        rows,
        symbol: 'BTC',
        positionSide: 'long',
        action: 'sell',
        quantity: 0.1,
        executedAt: '2026-01-04T00:00:00Z',
      }).kind
    ).toBe('reduce')
    expect(
      perpFillIntent({
        rows,
        symbol: 'BTC',
        positionSide: 'long',
        action: 'sell',
        quantity: 0.3,
        executedAt: '2026-01-04T00:00:00Z',
      }).kind
    ).toBe('too-big')
  })

  it('rejects a sell larger than the long and leaves the short in place', () => {
    const rows: PerpRow[] = [
      openLong(),
      row({
        id: 'short',
        symbol: 'BTC',
        action: 'sell',
        position_side: 'short',
        quantity: 0.1,
        unit_price: 100000,
        amount: 500,
        executed_at: '2026-01-03T00:00:00Z',
      }),
      row({
        id: 'too-big',
        symbol: 'BTC',
        action: 'sell',
        position_side: 'long',
        quantity: 0.3,
        unit_price: 100000,
        amount: null,
        executed_at: '2026-01-04T00:00:00Z',
      }),
    ]
    const saved = validatePerps({ rows, cash: CASH })
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.rowId).toBe('too-big')
    const without = reducePerps({ rows: rows.slice(0, 2), cash: CASH })
    expect(without.positions.map((p) => p.positionSide).sort()).toEqual(['long', 'short'])
    expect(without.positions.find((p) => p.positionSide === 'short')?.quantity).toBe(0.1)
  })

  it('moves cash by margin and does not invent an Available Cash row', () => {
    const rows = [openLong()]
    const before = rows.length
    const book = reducePerps({ rows, cash: CASH })
    expect(rows).toHaveLength(before)
    expect(book.futureCashDelta).toBe(-1000)
    expect(book.cash).toBe(9000)
  })

  it('does not book notional or exchange profit as cash on a future sell', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'cut',
          symbol: 'BTC',
          action: 'sell',
          position_side: 'long',
          quantity: 0.1,
          unit_price: 101000,
          amount: null,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
    })
    expect(book.futureCashDelta).toBe(-400)
    expect(book.futureCashDelta).not.toBe(-1000 + 0.1 * 101000)
  })

  it('lowers equity by funding and a fee and leaves cash unchanged', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'fund',
          symbol: 'BTC',
          action: 'funding',
          position_side: 'long',
          amount: -40,
          executed_at: '2026-01-03T00:00:00Z',
        }),
        row({
          id: 'fee',
          symbol: 'BTC',
          action: 'fee',
          position_side: 'long',
          amount: -5,
          executed_at: '2026-01-03T00:00:01Z',
        }),
      ],
      cash: CASH,
    })
    const quote = quotePerp(book.positions[0], { mark: 101000 })
    expect(book.cash).toBe(9000)
    expect(quote.equity).toBe(1155)
    expect(book.rowPnl.get('fund')).toEqual({ kind: 'none' })
    expect(book.rowPnl.get('fee')).toEqual({ kind: 'none' })
  })

  it('returns 1155 to cash on a full close after funding and a fee', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'fund',
          symbol: 'btc',
          action: 'funding',
          position_side: 'long',
          amount: -40,
          executed_at: '2026-01-03T00:00:00Z',
        }),
        row({
          id: 'fee',
          symbol: 'BTC',
          action: 'fee',
          position_side: 'long',
          amount: -5,
          executed_at: '2026-01-03T00:00:01Z',
        }),
        row({
          id: 'close',
          symbol: 'BTC',
          action: 'sell',
          position_side: 'long',
          quantity: 0.2,
          unit_price: 101000,
          amount: null,
          executed_at: '2026-01-04T00:00:00Z',
        }),
      ],
      cash: CASH,
    })
    expect(book.positions).toHaveLength(0)
    expect(book.rowPnl.get('close')).toMatchObject({ realized: 200 })
    expect(book.cash).toBe(10155)
  })

  it('leaves the total unchanged when margin is added', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'add',
          symbol: 'BTC',
          action: 'margin_add',
          position_side: 'long',
          amount: 200,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
    })
    const quote = quotePerp(book.positions[0], { mark: 101000 })
    expect(book.cash).toBe(8800)
    expect(book.positions[0].margin).toBe(1200)
    expect(quote.equity).toBe(1400)
    expect(book.cash + quote.valueAdd).toBe(10200)
  })

  it('lets a profit withdrawal drive the margin balance negative', () => {
    const book = reducePerps({
      rows: [
        openLong(),
        row({
          id: 'out',
          symbol: 'BTC',
          action: 'margin_remove',
          position_side: 'long',
          amount: 9500,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
      marks: { BTC: { mark: 150000 } },
    })
    const left = book.positions[0]
    const quote = quotePerp(left, { mark: 150000 })
    expect(left.margin).toBe(-8500)
    expect(quote.unrealized).toBe(10000)
    expect(quote.leverage).toBe(20)
    expect(book.cash).toBe(18500)
    expect(quote.equity).toBe(1500)
    expect(quote.availableMargin).toBeCloseTo(0, 6)
  })

  it('rejects a margin removal above available margin and one when none is free', () => {
    const tooMuch = validatePerps({
      rows: [
        openLong(),
        row({
          id: 'out',
          symbol: 'BTC',
          action: 'margin_remove',
          position_side: 'long',
          amount: 9501,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
      marks: { BTC: { mark: 150000 } },
    })
    expect(tooMuch.ok).toBe(false)
    const atEntry = validatePerps({
      rows: [
        openLong(),
        row({
          id: 'out',
          symbol: 'BTC',
          action: 'margin_remove',
          position_side: 'long',
          amount: 1,
          executed_at: '2026-01-03T00:00:00Z',
        }),
      ],
      cash: CASH,
      marks: { BTC: { mark: 100000 } },
    })
    expect(atEntry.ok).toBe(false)
  })

  it('rejects a backdated open that the ending cash could cover', () => {
    const rows = [openLong({ executed_at: '2025-12-01T00:00:00Z' })]
    const lateCash: CashEvent[] = [
      { id: 'later', executed_at: '2026-02-01T00:00:00Z', amount: 10000 },
    ]
    const saved = validatePerps({ rows, cash: lateCash })
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.rowId).toBe('open')
    const ending = lateCash[0].amount
    expect(ending).toBeGreaterThan(1000)
  })

  it('rejects an edit that makes a later reduce larger than the side', () => {
    const original = [
      openLong(),
      row({
        id: 'cut',
        symbol: 'BTC',
        action: 'sell',
        position_side: 'long',
        quantity: 0.1,
        unit_price: 101000,
        executed_at: '2026-01-03T00:00:00Z',
      }),
    ]
    const edited = [{ ...original[0], quantity: 0.05 }, original[1]]
    const saved = validatePerps({ rows: edited, cash: CASH })
    expect(saved.ok).toBe(false)
    if (!saved.ok) expect(saved.rowId).toBe('cut')
    expect(edited[0].quantity).toBe(0.05)
    expect(validatePerps({ rows: original, cash: CASH }).ok).toBe(true)
  })

  it('sorts a same-time fee after the fill it was split from', () => {
    const book = reducePerps({
      rows: [
        row({
          id: 'fee',
          symbol: 'BTC',
          action: 'fee',
          position_side: 'long',
          amount: -5,
          executed_at: '2026-01-02T00:00:00Z',
          created_at: '2026-01-02T00:00:00Z',
        }),
        openLong({ created_at: '2026-01-02T00:00:01Z' }),
      ],
      cash: CASH,
    })
    expect(book.positions[0].feeNet).toBe(-5)
    expect(book.positions[0].quantity).toBe(0.2)
  })

  it('distinguishes a long and a short snapshot of the same symbol', () => {
    const longKey = holdingSnapshotKey({
      userId: 'u',
      snapshotDate: '2026-01-02',
      symbol: 'BTC',
      assetType: 'future',
      positionSide: 'long',
    })
    const shortKey = holdingSnapshotKey({
      userId: 'u',
      snapshotDate: '2026-01-02',
      symbol: 'BTC',
      assetType: 'future',
      positionSide: 'short',
    })
    expect(longKey).not.toBe(shortKey)
  })
})

describe('transactionPnl futures', () => {
  it('does not change spot BTC P&L and shows realized only on a reduce', () => {
    const spot: Transaction = {
      id: 'spot',
      symbol: 'BTC',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 1,
      unit_price: 100,
      executed_at: '2026-01-01T00:00:00Z',
      currency: 'USD',
    }
    const futureOpen: Transaction = {
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
    const futureCut: Transaction = {
      id: 'cut',
      symbol: 'BTC',
      asset_type: 'future',
      action: 'sell',
      position_side: 'long',
      quantity: 0.1,
      unit_price: 101000,
      amount: null,
      executed_at: '2026-01-03T00:00:00Z',
      currency: 'USD',
    }
    const funding: Transaction = {
      id: 'fund',
      symbol: 'BTC',
      asset_type: 'future',
      action: 'funding',
      position_side: 'long',
      quantity: null,
      unit_price: null,
      amount: -40,
      executed_at: '2026-01-02T12:00:00Z',
      currency: 'USD',
    }
    const fee: Transaction = {
      id: 'fee',
      symbol: 'BTC',
      asset_type: 'future',
      action: 'fee',
      position_side: 'long',
      quantity: null,
      unit_price: null,
      amount: -5,
      executed_at: '2026-01-02T13:00:00Z',
      currency: 'USD',
    }
    const marginAdd: Transaction = {
      id: 'add-margin',
      symbol: 'BTC',
      asset_type: 'future',
      action: 'margin_add',
      position_side: 'long',
      quantity: null,
      unit_price: null,
      amount: 200,
      executed_at: '2026-01-04T00:00:00Z',
      currency: 'USD',
    }
    const input = {
      priceData: { BTC: { price: 160 } },
      preferredCurrency: 'USD' as const,
      usdToEurRate: 0.87,
    }
    const spotOnly = transactionPnl({ transactions: [spot], ...input })
    const mixed = transactionPnl({
      transactions: [spot, futureOpen, funding, fee, futureCut, marginAdd],
      ...input,
    })
    expect(mixed.get('spot')).toEqual(spotOnly.get('spot'))
    expect(mixed.get('open')).toEqual({ kind: 'none' })
    expect(mixed.get('fund')).toEqual({ kind: 'none' })
    expect(mixed.get('fee')).toEqual({ kind: 'none' })
    expect(mixed.get('add-margin')).toEqual({ kind: 'none' })
    expect(mixed.get('cut')).toEqual({ kind: 'realized', amount: 100, percent: 20 })

    const edited = transactionPnl({
      transactions: [
        spot,
        { ...futureOpen, unit_price: 102000 },
        funding,
        fee,
        futureCut,
        marginAdd,
      ],
      ...input,
    })
    expect(edited.get('spot')).toEqual(spotOnly.get('spot'))
    expect(edited.get('cut')).toEqual({ kind: 'realized', amount: -100, percent: -20 })
  })
})
