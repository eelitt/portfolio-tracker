import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCryptoPrice, getPricesForHoldings } from '../priceService'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

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
    it('should return null for unknown crypto symbols', async () => {
      const price = await getCryptoPrice('UNKNOWN')
      expect(price).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should fetch and return crypto price correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bitcoin: { usd: 65000, usd_24h_change: 1.2 } }),
      })

      const price = await getCryptoPrice('BTC')
      expect(price?.price).toBe(65000)
      expect(price?.change24h).toBe(1.2)
      // Single-symbol helper still uses short Data Cache unless forceFresh
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('bitcoin'),
        expect.objectContaining({
          next: expect.objectContaining({ tags: ['prices'] }),
        })
      )
    })

    it('should return null if API response is not ok', async () => {
      // Initial + one retry
      mockFetch.mockResolvedValue({ ok: false })

      const price = await getCryptoPrice('ETH')
      expect(price).toBeNull()
    })

    it('should return null on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const price = await getCryptoPrice('SOL')
      expect(price).toBeNull()
    })

    it('should return null when usd is zero', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bitcoin: { usd: 0 } }),
      })
      expect(await getCryptoPrice('BTC')).toBeNull()
    })
  })

  describe('getPricesForHoldings', () => {
    it('should batch crypto into a single CoinGecko request when all succeed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bitcoin: { usd: 62000, usd_24h_change: 2 },
          ethereum: { usd: 2800, usd_24h_change: -1 },
        }),
      })

      const holdings = [
        { symbol: 'BTC', asset_type: 'crypto' as const },
        { symbol: 'ETH', asset_type: 'crypto' as const },
        { symbol: 'Available Cash', asset_type: 'cash' as const },
      ]

      const prices = await getPricesForHoldings(holdings)

      // One batch request for both cryptos (cash needs no network); no second pass
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toContain('bitcoin')
      expect(mockFetch.mock.calls[0][0]).toContain('ethereum')
      // Portfolio path defaults to live quotes (no-store)
      expect(mockFetch.mock.calls[0][1]).toEqual(
        expect.objectContaining({ cache: 'no-store' })
      )

      expect(prices).toEqual({
        BTC: { price: 62000, change24h: 2 },
        ETH: { price: 2800, change24h: -1 },
        'Available Cash': { price: 1, change24h: 0 },
      })
    })

    it('can opt into Data Cache with forceFresh: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bitcoin: { usd: 62000, usd_24h_change: 2 },
        }),
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
          json: async () => ({
            bitcoin: { usd: 61000, usd_24h_change: 1 },
          }),
        })

      const pricesPromise = getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' },
      ])
      await vi.runAllTimersAsync()
      const prices = await pricesPromise

      expect(prices.BTC).toEqual({ price: 61000, change24h: 1 })
      // Last call should be no-store retry
      const lastInit = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1]
      expect(lastInit).toEqual(expect.objectContaining({ cache: 'no-store' }))
    })

    it('should return empty object when no valid prices after retry', async () => {
      mockFetch.mockResolvedValue({ ok: false })

      const pricesPromise = getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' as const },
      ])
      await vi.runAllTimersAsync()
      const prices = await pricesPromise
      expect(prices).toEqual({})
    })

    it('should omit crypto symbols with zero price then retry that symbol', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            bitcoin: { usd: 0 },
            ethereum: { usd: 2800 },
          }),
        })
        // Retry pass for BTC only
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            bitcoin: { usd: 64000, usd_24h_change: 0.5 },
          }),
        })

      const pricesPromise = getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' },
        { symbol: 'ETH', asset_type: 'crypto' },
      ])
      await vi.runAllTimersAsync()
      const prices = await pricesPromise

      expect(prices.ETH).toEqual({ price: 2800, change24h: null })
      expect(prices.BTC).toEqual({ price: 64000, change24h: 0.5 })
    })
  })
})
