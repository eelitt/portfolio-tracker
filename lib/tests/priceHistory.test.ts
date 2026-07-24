import { describe, it, expect } from 'vitest'
import {
  fullBackfillFrom,
  gapFillFrom,
  maxHistoryDays,
  rangeToDays,
  addUtcDays,
  toUtcDayIso,
  markersFromTransactions,
  getBinanceSpotSymbol,
  parseBinanceKlines,
} from '@/lib/priceHistory'
import type { Transaction } from '@/lib/types'

describe('Binance symbol + kline parse', () => {
  it('maps majors to USDT pairs and skips stables', () => {
    expect(getBinanceSpotSymbol('BTC')).toBe('BTCUSDT')
    expect(getBinanceSpotSymbol('eth')).toBe('ETHUSDT')
    expect(getBinanceSpotSymbol('LINK')).toBe('LINKUSDT')
    expect(getBinanceSpotSymbol('USDT')).toBeUndefined()
    expect(getBinanceSpotSymbol('USDC')).toBeUndefined()
  })

  it('parses Binance kline rows into OHLC bars', () => {
    const raw = [
      [
        Date.UTC(2024, 0, 1),
        '100',
        '120',
        '90',
        '110',
        '1234.5',
        Date.UTC(2024, 0, 1, 23, 59, 59),
      ],
      [
        Date.UTC(2024, 0, 2),
        '110',
        '130',
        '105',
        '125',
        '999',
        Date.UTC(2024, 0, 2, 23, 59, 59),
      ],
    ]
    const bars = parseBinanceKlines(raw)
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({
      time: '2024-01-01',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
    })
    expect(bars[1].close).toBe(125)
  })
})

describe('priceHistory constants', () => {
  it('caps crypto at 3Y and stocks/etfs at 2Y', () => {
    expect(maxHistoryDays('crypto')).toBe(1095)
    expect(maxHistoryDays('stock')).toBe(730)
    expect(maxHistoryDays('etf')).toBe(730)
  })

  it('rangeToDays respects asset max', () => {
    expect(rangeToDays('1M', 'crypto')).toBe(30)
    expect(rangeToDays('1Y', 'crypto')).toBe(365)
    expect(rangeToDays('Max', 'stock')).toBeNull()
    expect(rangeToDays('1Y', 'stock')).toBe(365)
  })

  it('fullBackfillFrom ends today and spans maxDays', () => {
    const now = new Date('2026-07-24T15:00:00.000Z')
    const from = fullBackfillFrom(365, now)
    expect(from).toBe('2025-07-25')
    expect(toUtcDayIso(now)).toBe('2026-07-24')
    expect(addUtcDays(from, 364)).toBe('2026-07-24')
  })

  it('gapFillFrom returns next day after latest when stale', () => {
    const now = new Date('2026-07-24T12:00:00.000Z')
    expect(gapFillFrom('2026-07-20T00:00:00.000Z', now)).toBe('2026-07-21')
    expect(gapFillFrom('2026-07-24T00:00:00.000Z', now)).toBeNull()
    expect(gapFillFrom('2026-07-25T00:00:00.000Z', now)).toBeNull()
  })
})

describe('markersFromTransactions', () => {
  const txs: Transaction[] = [
    {
      symbol: 'BTC',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 0.1,
      unit_price: 50000,
      executed_at: '2026-01-10T12:00:00.000Z',
      currency: 'USD',
    },
    {
      symbol: 'BTC',
      asset_type: 'crypto',
      action: 'sell',
      quantity: 0.05,
      unit_price: 60000,
      executed_at: '2026-03-01T09:00:00.000Z',
      currency: 'USD',
    },
    {
      symbol: 'ETH',
      asset_type: 'crypto',
      action: 'buy',
      quantity: 1,
      unit_price: 2000,
      executed_at: '2026-02-01T00:00:00.000Z',
      currency: 'USD',
    },
  ]

  it('filters to symbol and maps buy/sell', () => {
    const markers = markersFromTransactions(txs, 'btc', 'USD', 0.92)
    expect(markers).toHaveLength(2)
    expect(markers[0].side).toBe('buy')
    expect(markers[0].price).toBe(50000)
    expect(markers[0].timeKey).toBe('2026-01-10')
    expect(markers[1].side).toBe('sell')
    expect(markers[1].price).toBe(60000)
  })

  it('converts unit price to preferred EUR', () => {
    const markers = markersFromTransactions(txs, 'BTC', 'EUR', 0.9)
    expect(markers[0].price).toBe(45000)
    expect(markers[0].currency).toBe('EUR')
  })
})
