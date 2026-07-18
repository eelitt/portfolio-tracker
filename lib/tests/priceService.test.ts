import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCryptoPrice, getPricesForHoldings } from '../priceService'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('priceService', () => {
  beforeEach(() => {
    mockFetch.mockClear()
  })

  afterEach(() => {
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
    it('should batch crypto into a single CoinGecko request', async () => {
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

      // One batch request for both cryptos (cash needs no network)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch.mock.calls[0][0]).toContain('bitcoin')
      expect(mockFetch.mock.calls[0][0]).toContain('ethereum')

      expect(prices).toEqual({
        BTC: { price: 62000, change24h: 2 },
        ETH: { price: 2800, change24h: -1 },
        'Available Cash': { price: 1, change24h: 0 },
      })
    })

    it('should return empty object when no valid prices are fetched', async () => {
      mockFetch.mockResolvedValue({ ok: false })

      const holdings = [{ symbol: 'BTC', asset_type: 'crypto' as const }]

      const prices = await getPricesForHoldings(holdings)
      expect(prices).toEqual({})
    })

    it('should omit crypto symbols with zero price in batch response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bitcoin: { usd: 0 },
          ethereum: { usd: 2800 },
        }),
      })

      const prices = await getPricesForHoldings([
        { symbol: 'BTC', asset_type: 'crypto' },
        { symbol: 'ETH', asset_type: 'crypto' },
      ])

      expect(prices.BTC).toBeUndefined()
      expect(prices.ETH).toEqual({ price: 2800, change24h: null })
    })
  })
})
