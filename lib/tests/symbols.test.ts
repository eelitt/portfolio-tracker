import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  STOCK_SYMBOLS,
  ETF_SYMBOLS,
  CRYPTO_SYMBOLS,
  getSymbolsForType,
  getCryptoId,
  getSymbolOptions,
} from '../symbols'
import { getStockPrice, getCryptoPrice } from '../priceService'

describe('symbols data (curated lists for transaction forms)', () => {
  it('loads stocks, etfs and cryptos with expected structure', () => {
    expect(Array.isArray(STOCK_SYMBOLS)).toBe(true)
    expect(STOCK_SYMBOLS.length).toBeGreaterThan(0)

    expect(Array.isArray(ETF_SYMBOLS)).toBe(true)
    expect(ETF_SYMBOLS.length).toBeGreaterThan(0)

    expect(Array.isArray(CRYPTO_SYMBOLS)).toBe(true)
    expect(CRYPTO_SYMBOLS.length).toBeGreaterThan(0)

    // spot checks on shape
    const stock = STOCK_SYMBOLS[0]
    expect(typeof stock.symbol).toBe('string')
    expect(stock.symbol.length).toBeGreaterThan(0)
    expect(typeof stock.name).toBe('string')

    const etf = ETF_SYMBOLS[0]
    expect(typeof etf.symbol).toBe('string')
    expect(typeof etf.name).toBe('string')

    const crypto = CRYPTO_SYMBOLS[0]
    expect(typeof crypto.id).toBe('string')
    expect(crypto.id.length).toBeGreaterThan(0)
    expect(typeof crypto.symbol).toBe('string')
    expect(typeof crypto.name).toBe('string')
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

  it('provides crypto ids usable for CoinGecko price fetches', () => {
    for (const c of CRYPTO_SYMBOLS) {
      expect(typeof c.id).toBe('string')
      expect(c.id.trim().length).toBeGreaterThan(0)
      // typical CoinGecko ids are lowercase slugs
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('getSymbolsForType returns the right curated list', () => {
    expect(getSymbolsForType('stock').length).toBe(STOCK_SYMBOLS.length)
    expect(getSymbolsForType('etf').length).toBe(ETF_SYMBOLS.length)
    expect(getSymbolsForType('crypto').length).toBe(CRYPTO_SYMBOLS.length)
    expect(getSymbolsForType('cash').length).toBe(0)
    expect(getSymbolsForType('unknown')).toEqual([])
  })

  it('getCryptoId resolves tickers from the curated list (case insensitive)', () => {
    const first = CRYPTO_SYMBOLS[0]
    expect(getCryptoId(first.symbol)).toBe(first.id)
    expect(getCryptoId(first.symbol.toLowerCase())).toBe(first.id)
    expect(getCryptoId('NONEXISTENT')).toBeUndefined()
  })

  it('getSymbolOptions supports preserveValue for edit scenarios', () => {
    const stockOpts = getSymbolOptions('stock')
    expect(stockOpts.length).toBeGreaterThan(0)

    // pick something unlikely to be the first entry
    const weird = 'WEIRDOLD'
    const withPreserve = getSymbolOptions('stock', weird)
    expect(withPreserve[0].value).toBe(weird)
    expect(withPreserve[0].label).toContain('previous')

    // when already present, it should not duplicate at the front
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
    // Finnhub key is required for getStockPrice to actually call fetch
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

    // Use a symbol that is extremely likely to be in the stocks list
    const sample = STOCK_SYMBOLS.find((s) => s.symbol === 'AAPL') || STOCK_SYMBOLS[0]

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

  it('crypto symbols from the json resolve the correct CoinGecko id and hit the right URL', async () => {
    const mock = global.fetch as unknown as ReturnType<typeof vi.fn>
    const sampleCrypto = CRYPTO_SYMBOLS[0] // e.g. bitcoin / BTC

    mock.mockResolvedValue({
      ok: true,
      json: async () => ({
        [sampleCrypto.id]: { usd: 60000, usd_24h_change: 2.5 },
      }),
    } as any)

    const result = await getCryptoPrice(sampleCrypto.symbol)

    expect(result?.price).toBe(60000)
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining(`ids=${sampleCrypto.id}`),
      expect.anything()
    )
  })
})
