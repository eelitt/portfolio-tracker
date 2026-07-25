import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  STOCK_SYMBOLS,
  ETF_SYMBOLS,
  CRYPTO_SYMBOLS,
  getSymbolsForType,
  getCryptoPricing,
  getSymbolOptions,
} from '../symbols'
import { getBinanceSpotSymbol } from '../priceHistory/binanceSymbol'
import { getStockPrice, getCryptoPrice } from '../priceService'

describe('symbols data (curated lists for transaction forms)', () => {
  it('loads stocks, etfs and cryptos with expected structure', () => {
    expect(Array.isArray(STOCK_SYMBOLS)).toBe(true)
    expect(STOCK_SYMBOLS.length).toBeGreaterThan(0)

    expect(Array.isArray(ETF_SYMBOLS)).toBe(true)
    expect(ETF_SYMBOLS.length).toBeGreaterThan(0)

    expect(Array.isArray(CRYPTO_SYMBOLS)).toBe(true)
    expect(CRYPTO_SYMBOLS.length).toBeGreaterThan(0)

    const stock = STOCK_SYMBOLS[0]
    expect(typeof stock.symbol).toBe('string')
    expect(stock.symbol.length).toBeGreaterThan(0)
    expect(typeof stock.name).toBe('string')

    const etf = ETF_SYMBOLS[0]
    expect(typeof etf.symbol).toBe('string')
    expect(typeof etf.name).toBe('string')

    const crypto = CRYPTO_SYMBOLS[0]
    expect(typeof crypto.symbol).toBe('string')
    expect(typeof crypto.name).toBe('string')
    // No CoinGecko id field
    expect((crypto as { id?: string }).id).toBeUndefined()
  })

  it('has no duplicate tickers within each list', () => {
    const checkUnique = (arr: { symbol: string }[], label: string) => {
      const seen = new Set<string>()
      for (const item of arr) {
        const key = item.symbol.toUpperCase()
        if (seen.has(key)) {
          throw new Error(`Duplicate ${label} symbol: ${item.symbol}`)
        }
        seen.add(key)
      }
    }

    checkUnique(STOCK_SYMBOLS, 'stock')
    checkUnique(ETF_SYMBOLS, 'etf')
    checkUnique(CRYPTO_SYMBOLS, 'crypto')
  })

  it('every crypto is either stable or has a Binance USDT pair', () => {
    for (const c of CRYPTO_SYMBOLS) {
      if (c.stable === true) {
        expect(c.binance_symbol == null || c.binance_symbol === '').toBe(true)
        expect(getCryptoPricing(c.symbol)).toEqual({ kind: 'stable' })
        expect(getBinanceSpotSymbol(c.symbol)).toBeUndefined()
      } else {
        expect(typeof c.binance_symbol).toBe('string')
        expect(c.binance_symbol!.length).toBeGreaterThan(0)
        expect(c.binance_symbol).toMatch(/USDT$/)
        expect(getCryptoPricing(c.symbol)).toEqual({
          kind: 'binance',
          pair: c.binance_symbol!.toUpperCase(),
        })
        expect(getBinanceSpotSymbol(c.symbol)).toBe(
          c.binance_symbol!.toUpperCase()
        )
      }
    }
  })

  it('getSymbolsForType returns the right curated list', () => {
    expect(getSymbolsForType('stock').length).toBe(STOCK_SYMBOLS.length)
    expect(getSymbolsForType('etf').length).toBe(ETF_SYMBOLS.length)
    expect(getSymbolsForType('crypto').length).toBe(CRYPTO_SYMBOLS.length)
    expect(getSymbolsForType('cash').length).toBe(0)
    expect(getSymbolsForType('unknown')).toEqual([])
  })

  it('getCryptoPricing is case insensitive and handles legacy fallback', () => {
    expect(getCryptoPricing('btc')).toEqual({
      kind: 'binance',
      pair: 'BTCUSDT',
    })
    expect(getCryptoPricing('usdt')).toEqual({ kind: 'stable' })
    // Unlisted legacy → convention pair
    expect(getCryptoPricing('FOOCOIN')).toEqual({
      kind: 'binance',
      pair: 'FOOCOINUSDT',
    })
  })

  it('getSymbolOptions supports preserveValue for edit scenarios', () => {
    const stockOpts = getSymbolOptions('stock')
    expect(stockOpts.length).toBeGreaterThan(0)

    const weird = 'WEIRDOLD'
    const withPreserve = getSymbolOptions('stock', weird)
    expect(withPreserve[0].value).toBe(weird)
    expect(withPreserve[0].label).toContain('previous')

    const firstSymbol = stockOpts[0].value
    const stillFirst = getSymbolOptions('stock', firstSymbol)
    expect(stillFirst[0].value).toBe(firstSymbol)
  })
})

describe('symbols can be used to fetch prices from the APIs', () => {
  const originalFetch = global.fetch
  const originalFinnhubKey = process.env.FINNHUB_API_KEY

  beforeEach(() => {
    global.fetch = vi.fn()
    process.env.FINNHUB_API_KEY = 'test-key-for-symbols-test'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.FINNHUB_API_KEY = originalFinnhubKey
    vi.restoreAllMocks()
  })

  it('stock symbols from the list can be used with getStockPrice (Finnhub path)', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({
      ok: true,
      json: async () => ({ c: 123.45, dp: 1.23 }),
    } as any)

    const sample =
      STOCK_SYMBOLS.find((s) => s.symbol === 'AAPL') || STOCK_SYMBOLS[0]

    const result = await getStockPrice(sample.symbol)

    expect(result?.price).toBe(123.45)
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining(`symbol=${sample.symbol}`),
      expect.anything()
    )
  })

  it('etf symbols from the list can be used with getStockPrice (Finnhub path)', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockResolvedValue({
      ok: true,
      json: async () => ({ c: 450.0, dp: -0.5 }),
    } as any)

    const sample = ETF_SYMBOLS[0]

    await getStockPrice(sample.symbol)

    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining(`symbol=${sample.symbol}`),
      expect.anything()
    )
  })

  it('crypto symbols hit Binance with the catalog pair', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const sampleCrypto = CRYPTO_SYMBOLS.find((c) => c.binance_symbol)
    expect(sampleCrypto).toBeDefined()
    const pair = sampleCrypto!.binance_symbol!.toUpperCase()

    mock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          symbol: pair,
          lastPrice: '60000',
          priceChangePercent: '2.5',
        },
      ],
    } as any)

    const result = await getCryptoPrice(sampleCrypto!.symbol)

    expect(result?.price).toBe(60000)
    expect(result?.change24h).toBe(2.5)
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v3/ticker/24hr'),
      expect.anything()
    )
    expect(mock.mock.calls[0][0]).toContain(pair)
    expect(mock.mock.calls[0][0]).not.toContain('coingecko')
  })
})
