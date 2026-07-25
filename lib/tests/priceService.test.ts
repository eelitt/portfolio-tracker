import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCryptoPrice,
  getPricesForHoldings,
  buildBinance24hrUrl,
  parseBinance24hrTickers,
} from '../prices'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('parseBinance24hrTickers', () => {
  it('parses array payload into pair → quote', () => {
    const parsed = parseBinance24hrTickers([
      {
        symbol: 'BTCUSDT',
        lastPrice: '65000.50',
        priceChangePercent: '1.25',
      },
      {
        symbol: 'ETHUSDT',
        lastPrice: '2800',
        priceChangePercent: '-0.5',
      },
    ])
    expect(parsed).toEqual({
      BTCUSDT: { price: 65000.5, change24h: 1.25 },
      ETHUSDT: { price: 2800, change24h: -0.5 },
    })
  })

  it('rejects zero / invalid lastPrice', () => {
    const parsed = parseBinance24hrTickers([
      { symbol: 'BTCUSDT', lastPrice: '0', priceChangePercent: '1' },
      { symbol: 'ETHUSDT', lastPrice: 'bad', priceChangePercent: '1' },
    ])
    expect(parsed).toEqual({})
  })

  it('buildBinance24hrUrl encodes symbols list', () => {
    const url = buildBinance24hrUrl(['btcusdt', 'ETHUSDT'])
    expect(url).toContain('/api/v3/ticker/24hr?symbols=')
    expect(url).toContain(encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT'])))
  })
})

describe('priceService', () => {
  beforeEach(() => {
    mockFetch.mockClear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('getCryptoPrice', () => {
    it('returns stable face value without network', async () => {
      const price = await getCryptoPrice('USDT')
      expect(price).toEqual({ price: 1, change24h: 0 })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch and return crypto price from Binance 24hr', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: 'BTCUSDT',
            lastPrice: '65000',
            priceChangePercent: '1.2',
          },
        ],
      })

      const price = await getCryptoPrice('BTC')
      expect(price?.price).toBe(65000)
      expect(price?.change24h).toBe(1.2)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v3/ticker/24hr'),
        expect.objectContaining({
          next: expect.objectContaining({ tags: ['prices'] }),
        })
      )
      expect(mockFetch.mock.calls[0][0]).toContain('BTCUSDT')
    })

    it('should return null if API response is not ok', async () => {
      mockFetch.mockResolvedValue({ ok: false })

      const price = await getCryptoPrice('ETH')
      expect(price).toBeNull()
    })

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const price = await getCryptoPrice('SOL')
      expect(price).toBeNull()
    })

    it('should return null when lastPrice is zero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { symbol: 'BTCUSDT', lastPrice: '0', priceChangePercent: '1' },
        ],
      })
      expect(await getCryptoPrice('BTC')).toBeNull()
    })
  })

  describe('getPricesForHoldings', () => {
    it('should batch crypto into a single Binance 24hr request when all succeed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: 'BTCUSDT',
            lastPrice: '62000',
            priceChangePercent: '2',
          },
          {
            symbol: 'ETHUSDT',
            lastPrice: '2800',
            priceChangePercent: '-1',
          },
        ],
      })

      const holdings = [
        { symbol: 'BTC', asset_type: 'crypto' as const },
        { symbol: 'ETH', asset_type: 'crypto' as const },
        { symbol: 'Available Cash', asset_type: 'cash' as const },
      ]

      const prices = await getPricesForHoldings(holdings)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toContain('/api/v3/ticker/24hr')
      expect(mockFetch.mock.calls[0][0]).toContain('BTCUSDT')
      expect(mockFetch.mock.calls[0][0]).toContain('ETHUSDT')
      expect(mockFetch.mock.calls[0][1]).toEqual(
        expect.objectContaining({ cache: 'no-store' })
      )

      expect(prices).toEqual({
        BTC: { price: 62000, change24h: 2 },
        ETH: { price: 2800, change24h: -1 },
        'Available Cash': { price: 1, change24h: 0 },
      })
    })

    it('prices stable crypto locally without network', async () => {
      const prices = await getPricesForHoldings([
        { symbol: 'USDC', asset_type: 'crypto' },
      ])
      expect(prices.USDC).toEqual({ price: 1, change24h: 0 })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('can opt into Data Cache with forceFresh: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            symbol: 'BTCUSDT',
            lastPrice: '62000',
            priceChangePercent: '2',
          },
        ],
      })

      await getPricesForHoldings(
        [{ symbol: 'BTC', asset_type: 'crypto' }],
        { forceFresh: false }
      )

      expect(mockFetch.mock.calls[0][1]).toEqual(
        expect.objectContaining({
          next: expect.objectContaining({ tags: ['prices'] }),
        })
      )
    })

    it('should retry missing symbols with forceFresh on second pass', async () => {
      mockFetch
        // Pass 1: fail (ok false + internal retry = 2 calls)
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: false })
        // Pass 2 (forceFresh): success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              symbol: 'BTCUSDT',
              lastPrice: '61000',
              priceChangePercent: '1',
            },
          ],
        })

      const pricesPromise = getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' },
      ])
      await vi.runAllTimersAsync()
      const prices = await pricesPromise

      expect(prices.BTC).toEqual({ price: 61000, change24h: 1 })
      const lastInit = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1]
      expect(lastInit).toEqual(expect.objectContaining({ cache: 'no-store' }))
    })

    it('should return empty object when no valid prices after retry', async () => {
      mockFetch.mockResolvedValue({ ok: false })

      const pricesPromise = getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' },
      ])
      await vi.runAllTimersAsync()
      const prices = await pricesPromise

      expect(prices.BTC).toBeUndefined()
    })
  })
})
