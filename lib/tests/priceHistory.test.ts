import { describe, it, expect } from 'vitest'
import {
  fullBackfillFrom,
  gapFillFrom,
  maxHistoryDays,
  rangeToDays,
  addUtcDays,
  toUtcDayIso,
  markersFromTransactions,
  groupMarkersByDay,
  dayMarkerStyles,
  getBinanceSpotSymbol,
  parseBinanceKlines,
  parseYahooDailyBars,
  buildYahooHistoryUrl,
  historyProviderForSymbol,
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

  it('groups markers by day and styles multi-trade days', () => {
    const multi: Transaction[] = [
      {
        symbol: 'BTC',
        asset_type: 'crypto',
        action: 'buy',
        quantity: 0.1,
        unit_price: 50000,
        executed_at: '2026-01-10T10:00:00.000Z',
        currency: 'USD',
      },
      {
        symbol: 'BTC',
        asset_type: 'crypto',
        action: 'buy',
        quantity: 0.05,
        unit_price: 51000,
        executed_at: '2026-01-10T15:00:00.000Z',
        currency: 'USD',
      },
      {
        symbol: 'BTC',
        asset_type: 'crypto',
        action: 'sell',
        quantity: 0.02,
        unit_price: 52000,
        executed_at: '2026-01-10T18:00:00.000Z',
        currency: 'USD',
      },
    ]
    const markers = markersFromTransactions(multi, 'BTC', 'USD', 1)
    const byDay = groupMarkersByDay(markers)
    expect(byDay.get('2026-01-10')).toHaveLength(3)
    const styles = dayMarkerStyles(byDay)
    expect(styles).toHaveLength(1)
    expect(styles[0].side).toBe('mixed')
    expect(styles[0].text).toBe('3')
  })
})

describe('Yahoo daily history', () => {
  it('builds a period1/period2 chart URL', () => {
    const url = buildYahooHistoryUrl('0P0000UP8V.F', 1700000000, 1700600000)
    expect(url).toContain('0P0000UP8V.F')
    expect(url).toContain('interval=1d')
    expect(url).toContain('period1=1700000000')
    expect(url).toContain('period2=1700600000')
  })

  it('parses OHLC timestamps', () => {
    const bars = parseYahooDailyBars({
      chart: {
        result: [
          {
            timestamp: [1704067200, 1704153600],
            indicators: {
              quote: [
                {
                  open: [100, 110],
                  high: [120, 115],
                  low: [90, 108],
                  close: [110, 112],
                  volume: [1, 2],
                },
              ],
            },
          },
        ],
      },
    })
    expect(bars).toHaveLength(2)
    expect(bars[0]).toMatchObject({
      time: '2024-01-01',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
    })
    expect(bars[1].close).toBe(112)
  })

  it('uses close for missing open/high/low', () => {
    const bars = parseYahooDailyBars({
      chart: {
        result: [
          {
            timestamp: [1704067200],
            indicators: {
              quote: [{ close: [50], open: [null], high: [null], low: [null] }],
            },
          },
        ],
      },
    })
    expect(bars).toEqual([
      {
        time: '2024-01-01',
        open: 50,
        high: 50,
        low: 50,
        close: 50,
        volume: null,
      },
    ])
  })

  it('returns empty for bad payloads', () => {
    expect(parseYahooDailyBars({})).toEqual([])
    expect(parseYahooDailyBars({ chart: { error: 'Not Found' } })).toEqual([])
  })
})

describe('historyProviderForSymbol', () => {
  it('routes catalog Yahoo funds away from Finnhub', () => {
    expect(historyProviderForSymbol('OP AMERIKKA INDEKSI A', 'etf')).toBe(
      'yahoo'
    )
    expect(historyProviderForSymbol('SPY', 'etf')).toBe('finnhub')
    expect(historyProviderForSymbol('TSLA', 'stock')).toBe('finnhub')
    expect(historyProviderForSymbol('BTC', 'crypto')).toBe('binance')
  })
})
