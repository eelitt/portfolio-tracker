import { describe, expect, it } from 'vitest'
import {
  buildUsdMMarkKlineUrl,
  buildUsdMPremiumIndexUrl,
  parseUsdMMarkKlineOpen,
  parseUsdMPremiumIndex,
  usdMPreviousMarkStart,
} from '../prices/binanceUsdM'

describe('USD-M mark parsers', () => {
  it('reads markPrice and ignores a last-trade field', () => {
    expect(
      parseUsdMPremiumIndex({
        symbol: 'BTCUSDT',
        markPrice: '101000.5',
        lastPrice: '99999',
      })
    ).toBe(101000.5)
    expect(parseUsdMPremiumIndex({ code: -1121, msg: 'Invalid symbol.' })).toBeNull()
    expect(parseUsdMPremiumIndex({ markPrice: '0' })).toBeNull()
  })

  it('reads the 1m mark kline open and rejects a candle that is not 24h ago', () => {
    const start = 1_700_000_000_000
    expect(parseUsdMMarkKlineOpen([[start, '100000', '101000', '99000', '100500']], start)).toBe(
      100000
    )
    expect(
      parseUsdMMarkKlineOpen([[start + 6 * 60 * 1000, '100000']], start)
    ).toBeNull()
    expect(parseUsdMMarkKlineOpen([], start)).toBeNull()
  })

  it('asks fapi for the mark price and the mark kline, not the spot ticker', () => {
    const markUrl = buildUsdMPremiumIndexUrl('BTCUSDT')
    const klineUrl = buildUsdMMarkKlineUrl('BTCUSDT', 123)
    expect(markUrl).toContain('/fapi/v1/premiumIndex?symbol=BTCUSDT')
    expect(klineUrl).toContain('/fapi/v1/markPriceKlines?')
    expect(klineUrl).toContain('interval=1m')
    expect(klineUrl).toContain('startTime=123')
    expect(markUrl).not.toContain('/api/v3/ticker')
    expect(klineUrl).not.toContain('/api/v3/ticker')
  })

  it('floors the previous-mark request to the minute 24h earlier', () => {
    const now = Date.UTC(2026, 0, 2, 15, 30, 45)
    expect(usdMPreviousMarkStart(now)).toBe(Date.UTC(2026, 0, 1, 15, 30, 0))
  })
})
